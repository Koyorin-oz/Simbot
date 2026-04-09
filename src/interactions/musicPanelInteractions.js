"use strict";

const crypto = require("crypto");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildMusicPanelPayload } = require("../utils/musicPanel");
const musicService = require("../services/musicService");
const musicPlaylist = require("../services/musicPlaylistService");
const {
  loadPrefs,
  savePrefs,
  parseSavedSpotifyPlaylistUrls,
  isSpotifyPlaylistUrl,
  normalizeSavedSpotifyPlaylistLines,
  MAX_SAVED_SPOTIFY_PLAYLISTS
} = require("../services/privateRoomService");

function buildSpotifySavedMenuRow(actorId) {
  const id = String(actorId);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:splplay:${id}`)
      .setLabel("Lancer dans le vocal")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`music_pb:spladd:${id}`)
      .setLabel("Ajouter une playlist")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`music_pb:spledit:${id}`)
      .setLabel("Modifier les liens")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music_pb:splclr:${id}`).setLabel("Tout effacer").setStyle(ButtonStyle.Danger)
  );
}

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
    if (
      p.userId !== interaction.user.id &&
      !musicService.memberHasPrivateRoomMusicBypass(interaction.member)
    ) {
      await interaction
        .reply({ content: "Ce panneau ne t'est pas destine.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }

    const actorId = interaction.user.id;

    if (p.action === "refresh") {
      const payload = buildMusicPanelPayload(actorId);
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

    if (p.action === "playlist") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const payload = await musicPlaylist.buildPlaylistPanelPayload(
          client.prisma,
          interaction.guildId,
          interaction.user.id
        );
        await interaction.editReply({ content: payload.content, components: payload.components });
      } catch (e) {
        await interaction.editReply({
          content: `Erreur playlist : ${String(e?.message || e).slice(0, 180)}`
        });
      }
      return true;
    }

    if (p.action === "pladd") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:pladd:${actorId}`)
        .setTitle("Ajouter a ta playlist");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("music_pl_q")
            .setLabel("Lien YouTube / Spotify ou recherche")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(3)
            .setMaxLength(400)
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (p.action === "plplay") {
      await interaction.deferUpdate();
      const items = await musicPlaylist.listUserPlaylist(
        client.prisma,
        interaction.guildId,
        interaction.user.id
      );
      if (!items.length) {
        await interaction.followUp({
          content: "Ta playlist est vide.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      const v = musicService.getVoiceChannelForMember(interaction.member);
      if (v.error) {
        await interaction.followUp({ content: v.error, flags: MessageFlags.Ephemeral });
        return true;
      }
      const j = await musicService.joinChannel(interaction.guild, v.channel, {
        member: interaction.member,
        client
      });
      if (j.error) {
        await interaction.followUp({ content: j.error, flags: MessageFlags.Ephemeral });
        return true;
      }
      const tracks = items.map((it) => ({
        title: it.title,
        url: it.url,
        source: "saved_playlist"
      }));
      const enq = await musicService.enqueueDirectTracks(
        interaction.guild,
        tracks,
        interaction.user.id,
        client.prisma
      );
      await interaction.followUp({
        content: enq.error
          ? enq.error
          : `**${enq.added}** morceau(x) de ta playlist ajoute(s) a la file — premier : **${enq.firstTitle}**.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (p.action === "plclr") {
      await interaction.deferUpdate();
      await musicPlaylist.clearUserPlaylist(client.prisma, interaction.guildId, interaction.user.id);
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id
      );
      await interaction.editReply({ content: payload.content, components: payload.components });
      return true;
    }

    if (p.action === "plref") {
      await interaction.deferUpdate();
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id
      );
      await interaction.editReply({ content: payload.content, components: payload.components });
      return true;
    }

    if (p.action === "search") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:search:${actorId}`)
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
        .setCustomId(`music_md:link:${actorId}`)
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

    if (p.action === "spotifypl") {
      const prefs = await loadPrefs(client.prisma, interaction.guildId, actorId);
      const urls = parseSavedSpotifyPlaylistUrls(prefs);
      if (!urls.length) {
        const modal = new ModalBuilder()
          .setCustomId(`music_md:spotifypl_set:${actorId}`)
          .setTitle("Enregistrer une playlist Spotify");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("music_spotify_pl_url")
              .setLabel("Lien playlist publique (open.spotify.com/...)")
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(12)
              .setMaxLength(500)
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const summary = urls
        .map((u, i) => {
          const short = u.length > 90 ? `${u.slice(0, 87)}…` : u;
          return `**${i + 1}.** ${short}`;
        })
        .join("\n");
      await interaction.editReply({
        content: `**Playlists Spotify enregistrees** (${urls.length}/${MAX_SAVED_SPOTIFY_PLAYLISTS})\n\n${summary}\n\nChoisis une action :`.slice(
          0,
          2000
        ),
        components: [buildSpotifySavedMenuRow(actorId)]
      });
      return true;
    }

    if (p.action === "spladd") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:spotifypl_append:${actorId}`)
        .setTitle("Ajouter une playlist Spotify");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("music_spotify_pl_append")
            .setLabel("Lien playlist publique")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(12)
            .setMaxLength(500)
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (p.action === "spledit") {
      const prefs = await loadPrefs(client.prisma, interaction.guildId, actorId);
      const urls = parseSavedSpotifyPlaylistUrls(prefs);
      const modal = new ModalBuilder()
        .setCustomId(`music_md:spotifypl_replace:${actorId}`)
        .setTitle("Modifier tes playlists Spotify");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("music_spotify_pl_bulk")
            .setLabel("Une URL playlist par ligne (max 10)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(urls.join("\n").slice(0, 3900))
            .setMinLength(0)
            .setMaxLength(4000)
            .setRequired(false)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (p.action === "splclr") {
      await loadPrefs(client.prisma, interaction.guildId, actorId);
      await savePrefs(client.prisma, interaction.guildId, actorId, { musicSpotifyUrl: "" });
      await interaction.update({
        content:
          "Toutes les playlists Spotify enregistrees ont ete effacees. Sur le panneau musique, clique **Playlist Spotify** pour en ajouter une nouvelle.",
        components: []
      });
      return true;
    }

    if (p.action === "splplay") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const prefs = await loadPrefs(client.prisma, interaction.guildId, actorId);
      const urls = parseSavedSpotifyPlaylistUrls(prefs);
      if (!urls.length) {
        await interaction.editReply({
          content: "Aucune playlist enregistree. Utilise **Playlist Spotify** sur le panneau musique."
        });
        return true;
      }
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
      let totalAdded = 0;
      let firstTitle = "";
      const errs = [];
      for (const url of urls) {
        const enq = await musicService.enqueueQuery(interaction.guild, url, interaction.user.id, client.prisma);
        if (enq.error) errs.push(enq.error);
        else {
          totalAdded += Number(enq.added) || 0;
          if (!firstTitle && enq.firstTitle) firstTitle = enq.firstTitle;
        }
      }
      if (!totalAdded && errs.length) {
        await interaction.editReply({
          content: `Impossible de charger les playlists : ${errs[0]}`.slice(0, 2000)
        });
        return true;
      }
      let msg = `**${totalAdded}** morceau(x) ajoute(s) depuis **${urls.length}** playlist(s). Premier : **${firstTitle || "?"}**.`;
      if (errs.length)
        msg += `\n_(Certaines lignes ont echoue : ${errs
          .slice(0, 2)
          .join("; ")
          .slice(0, 280)})_`;
      await interaction.editReply({ content: msg.slice(0, 2000) });
      return true;
    }

    if (p.action === "saveurl") {
      const modal = new ModalBuilder()
        .setCustomId(`music_md:save:${actorId}`)
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

  if (interaction.isButton() && interaction.customId.startsWith("music_ppa:")) {
    const m = interaction.customId.match(/^music_ppa:(\d{17,20}):(\d+):(j|q|r)$/);
    if (!m) return false;
    const ownerId = m[1];
    const itemId = Number(m[2]);
    const mode = m[3];
    if (ownerId !== interaction.user.id) {
      await interaction
        .reply({ content: "Ce panneau ne t'est pas destine.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }
    await interaction.deferUpdate();
    const owned = await musicPlaylist.getOwnedPlaylistItem(
      client.prisma,
      interaction.guildId,
      interaction.user.id,
      itemId
    );
    if (!owned) {
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id
      );
      await interaction.editReply({ content: payload.content, components: payload.components });
      return true;
    }
    if (mode === "r") {
      await musicPlaylist.removePlaylistItem(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        itemId
      );
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        null
      );
      await interaction.editReply({ content: payload.content, components: payload.components });
      return true;
    }
    const v = musicService.getVoiceChannelForMember(interaction.member);
    if (v.error) {
      await interaction.followUp({ content: v.error, flags: MessageFlags.Ephemeral });
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        itemId
      );
      await interaction.editReply({ content: payload.content, components: payload.components });
      return true;
    }
    const j = await musicService.joinChannel(interaction.guild, v.channel, {
      member: interaction.member,
      client
    });
    if (j.error) {
      await interaction.followUp({ content: j.error, flags: MessageFlags.Ephemeral });
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        itemId
      );
      await interaction.editReply({ content: payload.content, components: payload.components });
      return true;
    }
    if (mode === "j") {
      const r = await musicService.playPlaylistItemNow(
        interaction.guild,
        { title: owned.title, url: owned.url },
        interaction.user.id
      );
      if (r.error) {
        await interaction.followUp({ content: r.error, flags: MessageFlags.Ephemeral });
      }
    } else {
      const enq = await musicService.enqueueDirectTracks(
        interaction.guild,
        [{ title: owned.title, url: owned.url, source: "saved_playlist" }],
        interaction.user.id,
        client.prisma
      );
      if (enq.error) {
        await interaction.followUp({ content: enq.error, flags: MessageFlags.Ephemeral });
      }
    }
    const payload = await musicPlaylist.buildPlaylistPanelPayload(
      client.prisma,
      interaction.guildId,
      interaction.user.id,
      itemId
    );
    await interaction.editReply({ content: payload.content, components: payload.components });
    return true;
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

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("music_plpick:")) {
    const uid = interaction.customId.slice("music_plpick:".length);
    if (uid !== interaction.user.id) {
      await interaction
        .reply({ content: "Ce menu ne t'est pas destine.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }
    const sel = Number(interaction.values?.[0]);
    await interaction.deferUpdate();
    const payload = await musicPlaylist.buildPlaylistPanelPayload(
      client.prisma,
      interaction.guildId,
      interaction.user.id,
      Number.isFinite(sel) ? sel : null
    );
    await interaction.editReply({ content: payload.content, components: payload.components });
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

    if (parsed.kind === "spotifypl_set") {
      const raw = interaction.fields.getTextInputValue("music_spotify_pl_url");
      const url = String(raw || "").trim();
      if (!isSpotifyPlaylistUrl(url)) {
        await interaction.reply({
          content:
            "Ce n'est pas un lien de **playlist** Spotify. Il faut une URL du type `https://open.spotify.com/playlist/...` (playlist **publique**).",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
      await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: url });
      await interaction.reply({
        content:
          "Playlist enregistree. Clique encore sur **Playlist Spotify** sur le panneau pour **lancer** dans le vocal ou **en ajouter** d'autres.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (parsed.kind === "spotifypl_append") {
      const raw = interaction.fields.getTextInputValue("music_spotify_pl_append");
      const url = String(raw || "").trim();
      if (!isSpotifyPlaylistUrl(url)) {
        await interaction.reply({
          content:
            "Lien invalide : colle une URL **playlist** `https://open.spotify.com/playlist/...` (publique).",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      const prefs = await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
      const cur = parseSavedSpotifyPlaylistUrls(prefs);
      if (cur.includes(url)) {
        await interaction.reply({
          content: "Ce lien est deja enregistre.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      if (cur.length >= MAX_SAVED_SPOTIFY_PLAYLISTS) {
        await interaction.reply({
          content: `Tu as deja **${MAX_SAVED_SPOTIFY_PLAYLISTS}** playlists (max). Utilise **Modifier les liens** pour en retirer.`,
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      const next = [...cur, url].join("\n");
      await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: next });
      await interaction.reply({
        content: `Playlist ajoutee — **${cur.length + 1}** au total. Rouvre **Playlist Spotify** puis **Lancer dans le vocal** si besoin.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (parsed.kind === "spotifypl_replace") {
      const raw = interaction.fields.getTextInputValue("music_spotify_pl_bulk");
      const lines = String(raw || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) {
        await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
        await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: "" });
        await interaction.reply({
          content: "Liste vide : toutes les playlists enregistrees ont ete effacees.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      const valid = normalizeSavedSpotifyPlaylistLines(lines.filter((l) => isSpotifyPlaylistUrl(l)));
      if (!valid.length) {
        await interaction.reply({
          content:
            "Aucune URL valide : chaque ligne doit etre un lien **playlist** `https://open.spotify.com/playlist/...`.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      const dropped = lines.length - valid.length;
      await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
      await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: valid.join("\n") });
      let msg = `**${valid.length}** playlist(s) enregistree(s).`;
      if (dropped > 0) msg += ` (${dropped} ligne(s) ignoree(s) — pas une URL playlist.)`;
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      return true;
    }

    if (parsed.kind === "pladd") {
      const raw = interaction.fields.getTextInputValue("music_pl_q");
      const q = String(raw || "").trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (!musicService.loadDeps()) {
        await interaction.editReply({ content: "Module musique indisponible." });
        return true;
      }
      const resolved = await musicService.resolveQueryToYoutubeTracks(q, interaction.guild);
      if (resolved.error) {
        await interaction.editReply({ content: resolved.error });
        return true;
      }
      const add = await musicPlaylist.addTracksToUserPlaylist(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        resolved.tracks
      );
      if (add.error) {
        await interaction.editReply({ content: add.error });
        return true;
      }
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        interaction.guildId,
        interaction.user.id
      );
      let header = `**${add.added}** titre(s) ajoute(s).`;
      if (add.skipped > 0) {
        header += ` (${add.skipped} ignore(s), plafond **${musicPlaylist.MAX_ITEMS}**.)`;
      }
      await interaction.editReply({
        content: `${header}\n\n${payload.content}`.slice(0, 3900),
        components: payload.components
      });
      return true;
    }

    if (parsed.kind === "save") {
      const raw = interaction.fields.getTextInputValue("music_save_url");
      const lien = raw != null ? String(raw).trim().slice(0, 500) : "";
      await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
      await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: lien });
      await interaction.reply({
        content: lien
          ? "Lien enregistre (ancien bouton). Prefere **Playlist Spotify** sur le panneau pour plusieurs playlists."
          : "Lien efface.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
  }

  return false;
}

module.exports = { handleMusicPanelInteractions, runPlayQueryFlow };
