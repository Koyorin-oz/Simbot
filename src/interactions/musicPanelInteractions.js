"use strict";

const crypto = require("crypto");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");
const { buildMusicPanelPayload } = require("../utils/musicPanel");
const musicService = require("../services/musicService");
const { loadPrefs, savePrefs } = require("../services/privateRoomService");

function ensureSessions(client) {
  if (!client.musicInteractionSessions) client.musicInteractionSessions = new Map();
  return client.musicInteractionSessions;
}

function storeSession(client, data, ttlMs = 600_000) {
  const token = crypto.randomBytes(8).toString("hex");
  ensureSessions(client).set(token, { ...data, expires: Date.now() + ttlMs });
  setTimeout(() => client.musicInteractionSessions?.delete(token), ttlMs);
  return token;
}

function getSession(client, token) {
  const map = ensureSessions(client);
  const s = map.get(token);
  if (!s || Date.now() > s.expires) {
    map.delete(token);
    return null;
  }
  return s;
}

function parseMusicButton(customId) {
  const m = String(customId).match(/^music_pb:([a-z]+):(\d{17,20})$/);
  if (!m) return null;
  return { action: m[1], userId: m[2] };
}

function parseMusicModalId(customId) {
  const parts = String(customId).split(":");
  if (parts.length < 3 || parts[0] !== "music_md") return null;
  return { kind: parts[1], userId: parts[2] };
}

/**
 * Recherche avec menu de choix, ou lecture directe si URL.
 * @param {{ query: string, getVoice: () => { channel?: import('discord.js').VoiceBasedChannel, error?: string }, prisma?: object, alreadyDeferred?: boolean }} opts
 */
async function runPlayQueryFlow(interaction, client, opts) {
  const { query: rawQuery, getVoice, prisma, alreadyDeferred } = opts;
  const q = String(rawQuery || "").trim();
  if (!q) {
    if (alreadyDeferred) await interaction.editReply({ content: "Texte vide." });
    else await interaction.reply({ content: "Texte vide.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!alreadyDeferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const v = getVoice();
  if (v?.error) {
    await interaction.editReply({ content: v.error });
    return;
  }
  const joined = await musicService.joinChannel(interaction.guild, v.channel, {
    member: interaction.member,
    client
  });
  if (joined.error) {
    await interaction.editReply({ content: joined.error });
    return;
  }

  if (musicService.isDirectPlayQuery(q)) {
    const enq = await musicService.enqueueQuery(interaction.guild, q, interaction.user.id, prisma);
    if (enq.error) await interaction.editReply({ content: enq.error });
    else {
      const first = enq.firstTitle || "OK";
      await interaction.editReply({
        content:
          enq.added > 1
            ? `**${enq.added}** morceaux ajoutes. Premier : **${first}**.`
            : `**${first}** ajoute (${enq.queueLen} en file).`
      });
    }
    return;
  }

  await interaction.editReply({ content: "Recherche des resultats…" });
  const candidates = await musicService.searchMixedCandidates(q);
  if (!candidates.length) {
    await interaction.editReply({
      content:
        "Aucun resultat. Precise (ex. **artiste + titre**) ou **colle un lien** YouTube / Spotify (bouton *Coller un lien* sur le panneau)."
    });
    return;
  }

  const token = storeSession(client, {
    type: "search_pick",
    userId: interaction.user.id,
    guildId: interaction.guild.id,
    choices: candidates
  });

  const slice = candidates.slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`music_pick:${token}`)
    .setPlaceholder("Choisis un resultat")
    .addOptions(
      slice.map((c, i) => ({
        label: `${c.kind === "spotify" ? "[SP]" : "[YT]"} ${String(c.title).slice(0, 92)}`,
        value: String(i),
        description: (c.url ? "YouTube" : "Spotify → YouTube").slice(0, 100)
      }))
    );

  await interaction.editReply({
    content: `**${slice.length}** proposition(s) pour \`${q.slice(0, 55)}\` — choisis ci-dessous, ou envoie un **lien direct** via *Coller un lien*.`,
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

async function handleMusicPanelInteractions(client, interaction) {
  if (!musicService.isEnabled()) return false;

  if (interaction.isButton() && interaction.customId.startsWith("music_pb:")) {
    const p = parseMusicButton(interaction.customId);
    if (!p) return false;
    if (p.userId !== interaction.user.id) {
      await interaction
        .reply({ content: "Ce panneau ne t'est pas destine.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }

    if (p.action === "refresh") {
      const payload = buildMusicPanelPayload(p.userId);
      await interaction.update(payload).catch(() => null);
      return true;
    }

    if (p.action === "queue") {
      const text = musicService.formatQueue(interaction.guildId, 15);
      await interaction.reply({ content: text.slice(0, 2000), flags: MessageFlags.Ephemeral });
      return true;
    }

    if (p.action === "join") {
      const v = musicService.getVoiceChannelForMember(interaction.member);
      if (v.error) {
        await interaction.reply({ content: v.error, flags: MessageFlags.Ephemeral });
        return true;
      }
      const j = await musicService.joinChannel(interaction.guild, v.channel, {
        member: interaction.member,
        client
      });
      await interaction.reply({
        content: j.error || `Connecte dans **${v.channel.name}**.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "leave") {
      musicService.leaveGuild(interaction.guildId, client);
      await interaction.reply({
        content: "Bot deconnecte du vocal, file videe.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "skip") {
      const r = musicService.skipGuild(interaction.guildId);
      await interaction.reply({ content: r.error || "Skip.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (p.action === "stop") {
      const r = musicService.stopGuild(interaction.guildId);
      await interaction.reply({
        content: r.error || "Stop — file videe.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "pause") {
      const r = musicService.pauseGuild(interaction.guildId);
      await interaction.reply({ content: r.error || "Pause.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (p.action === "resume") {
      const r = musicService.resumeGuild(interaction.guildId);
      await interaction.reply({ content: r.error || "Lecture reprise.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (p.action === "restart") {
      const r = await musicService.restartCurrentTrackGuild(interaction.guildId);
      await interaction.reply({
        content: r.error || "Morceau relance depuis le debut.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "voldown") {
      const r = musicService.nudgeGuildVolume(interaction.guildId, -musicService.VOLUME_NUDGE);
      await interaction.reply({
        content: r.error || `Volume : **${r.volume}%**.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "volup") {
      const r = musicService.nudgeGuildVolume(interaction.guildId, musicService.VOLUME_NUDGE);
      await interaction.reply({
        content: r.error || `Volume : **${r.volume}%**.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "search") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:search:${p.userId}`)
        .setTitle("Rechercher une musique");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("music_q")
            .setLabel("Titre, artiste, ou mots-cles")
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(200)
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (p.action === "link") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:link:${p.userId}`)
        .setTitle("Coller un lien");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("music_link")
            .setLabel("URL YouTube ou Spotify")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(8)
            .setMaxLength(400)
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (p.action === "saveurl") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:save:${p.userId}`)
        .setTitle("Lien Spotify (panneau vocal prive)");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("music_save_url")
            .setLabel("Playlist / album / morceau (vide = effacer)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (p.action === "hist") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const list = await musicService.getUserPlayHistoryUnique(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        25
      );
      if (!list.length) {
        await interaction.editReply({
          content: "Ton historique est vide pour ce serveur. Lance d’abord des morceaux avec **Rechercher** ou **Coller un lien**."
        });
        return true;
      }
      const token = storeSession(client, {
        type: "hist_pick",
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        items: list
      });
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`music_hsel:${token}`)
        .setPlaceholder("Remettre en file un morceau")
        .addOptions(
          list.map((it, i) => ({
            label: String(it.title).slice(0, 100),
            value: String(i)
          }))
        );
      await interaction.editReply({
        content: `**${list.length}** morceau(x) dans ton historique (serveur) — choisis-en un :`,
        components: [new ActionRowBuilder().addComponents(menu)]
      });
      return true;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("music_pick:")) {
    const token = interaction.customId.slice("music_pick:".length);
    const s = getSession(client, token);
    if (!s || s.type !== "search_pick" || s.userId !== interaction.user.id) {
      await interaction
        .reply({ content: "Session expiree ou invalide. Relance une recherche.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }
    try {
      await interaction.deferUpdate();
      const idx = Number(interaction.values?.[0]);
      const choice = s.choices[idx];
      if (!choice) {
        await interaction.editReply({ content: "Choix invalide.", components: [] }).catch(() => null);
        return true;
      }
      const v = musicService.getVoiceChannelForMember(interaction.member);
      if (v.error) {
        await interaction.editReply({ content: v.error, components: [] }).catch(() => null);
        return true;
      }
      const j = await musicService.joinChannel(interaction.guild, v.channel, {
        member: interaction.member,
        client
      });
      if (j.error) {
        await interaction.editReply({ content: j.error, components: [] }).catch(() => null);
        return true;
      }
      const resolved = await musicService.resolveCandidateChoice(choice);
      if (resolved.error) {
        await interaction.editReply({ content: resolved.error, components: [] }).catch(() => null);
        return true;
      }
      const enq = await musicService.enqueueDirectTracks(
        interaction.guild,
        [{ title: resolved.title, url: resolved.url, source: resolved.source }],
        interaction.user.id,
        client.prisma
      );
      if (enq.error) await interaction.editReply({ content: enq.error, components: [] }).catch(() => null);
      else
        await interaction
          .editReply({
            content: `Ajoute : **${enq.firstTitle}** (${enq.queueLen} en file).`,
            components: []
          })
          .catch(() => null);
    } finally {
      client.musicInteractionSessions?.delete(token);
    }
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("music_hsel:")) {
    const token = interaction.customId.slice("music_hsel:".length);
    const s = getSession(client, token);
    if (!s || s.type !== "hist_pick" || s.userId !== interaction.user.id) {
      await interaction
        .reply({ content: "Session expiree. Rouvre **Historique**.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }
    try {
      await interaction.deferUpdate();
      const idx = Number(interaction.values?.[0]);
      const item = s.items[idx];
      if (!item) {
        await interaction.editReply({ content: "Choix invalide.", components: [] }).catch(() => null);
        return true;
      }
      const v = musicService.getVoiceChannelForMember(interaction.member);
      if (v.error) {
        await interaction.editReply({ content: v.error, components: [] }).catch(() => null);
        return true;
      }
      const j = await musicService.joinChannel(interaction.guild, v.channel, {
        member: interaction.member,
        client
      });
      if (j.error) {
        await interaction.editReply({ content: j.error, components: [] }).catch(() => null);
        return true;
      }
      const enq = await musicService.enqueueDirectTracks(
        interaction.guild,
        [{ title: item.title, url: item.url, source: "history_replay" }],
        interaction.user.id,
        client.prisma
      );
      if (enq.error) await interaction.editReply({ content: enq.error, components: [] }).catch(() => null);
      else
        await interaction
          .editReply({
            content: `Replay depuis l’historique : **${item.title}**.`,
            components: []
          })
          .catch(() => null);
    } finally {
      client.musicInteractionSessions?.delete(token);
    }
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("music_md:")) {
    const parsed = parseMusicModalId(interaction.customId);
    if (!parsed || parsed.userId !== interaction.user.id) {
      await interaction.reply({ content: "Formulaire invalide.", flags: MessageFlags.Ephemeral }).catch(() => null);
      return true;
    }

    if (parsed.kind === "search") {
      const q = interaction.fields.getTextInputValue("music_q");
      await runPlayQueryFlow(interaction, client, {
        query: q,
        prisma: client.prisma,
        alreadyDeferred: false,
        getVoice: () => musicService.getVoiceChannelForMember(interaction.member)
      });
      return true;
    }

    if (parsed.kind === "link") {
      const link = interaction.fields.getTextInputValue("music_link");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const v = musicService.getVoiceChannelForMember(interaction.member);
      if (v.error) {
        await interaction.editReply({ content: v.error });
        return true;
      }
      const j = await musicService.joinChannel(interaction.guild, v.channel, {
        member: interaction.member,
        client
      });
      if (j.error) {
        await interaction.editReply({ content: j.error });
        return true;
      }
      const enq = await musicService.enqueueQuery(interaction.guild, link, interaction.user.id, client.prisma);
      if (enq.error) await interaction.editReply({ content: enq.error });
      else {
        const first = enq.firstTitle || "OK";
        await interaction.editReply({
          content:
            enq.added > 1
              ? `**${enq.added}** morceaux ajoutes. Premier : **${first}**.`
              : `**${first}** ajoute (${enq.queueLen} en file).`
        });
      }
      return true;
    }

    if (parsed.kind === "save") {
      const raw = interaction.fields.getTextInputValue("music_save_url");
      const lien = raw != null ? String(raw).trim().slice(0, 500) : "";
      await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
      await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: lien });
      await interaction.reply({
        content: lien
          ? "Lien enregistre pour **Ma playlist** (panneau vocal prive). Pense a **Rafraichir** ce panneau si besoin."
          : "Lien efface.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
  }

  return false;
}

module.exports = { handleMusicPanelInteractions, runPlayQueryFlow };
