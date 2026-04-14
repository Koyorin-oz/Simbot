"use strict";

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");
const {
  buildMusicPanelPayload,
  buildBlzMusicSessionAdapter,
  parseMusicButtonId,
  parseMusicSelectId
} = require("../utils/musicPanel");
const musicService = require("../services/musicService");
const musicPlaylist = require("../services/musicPlaylistService");

const blzPendingSearches = new Map();
const BLZ_PENDING_TTL_MS = 8 * 60 * 1000;

function blzPickKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function pruneBlzPending() {
  const now = Date.now();
  for (const [k, v] of blzPendingSearches) {
    if (v.expires < now) blzPendingSearches.delete(k);
  }
}

async function syncBlzPanels(interaction, guildId) {
  const payload = buildMusicPanelPayload(guildId, buildBlzMusicSessionAdapter(guildId));
  if (interaction.message?.editable) {
    await interaction.message.edit(payload).catch(() => null);
  }
  await musicService.refreshRegisteredMusicPanels(interaction.client, guildId, {
    skipMessageId: interaction.message?.id
  });
}

/**
 * @param {import("discord.js").Interaction} interaction
 * @param {import("discord.js").Client} client
 * @param {{ query: string, guildId: string, userId: string, prisma?: object }} opts
 */
async function runBlzPlayQueryFlow(interaction, client, opts) {
  const q = String(opts.query || "").trim();
  const { guildId, userId, prisma } = opts;
  if (!q) {
    await interaction.editReply({ content: "Texte vide." });
    return;
  }

  const v = musicService.getVoiceChannelForMember(interaction.member);
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
    const enq = await musicService.enqueueQuery(interaction.guild, q, userId, prisma);
    if (enq.error) await interaction.editReply({ content: enq.error });
    else {
      const first = enq.firstTitleDisplay || enq.firstTitle || "OK";
      await interaction.editReply({
        content:
          enq.added > 1
            ? `**${enq.added}** morceaux ajoutes. Premier : **${first}**.`
            : `**${first}** ajoute (${enq.queueLen} en file).`
      });
      await musicService.refreshRegisteredMusicPanels(client, guildId);
    }
    return;
  }

  await interaction.editReply({ content: "Recherche des resultats…" });
  const candidates = await musicService.searchMixedCandidates(q);
  if (!candidates.length) {
    await interaction.editReply({
      content:
        "Aucun resultat. Precise (ex. **artiste + titre**) ou **colle un lien** YouTube / Spotify."
    });
    return;
  }

  pruneBlzPending();
  const slice = candidates.slice(0, 25);
  blzPendingSearches.set(blzPickKey(guildId, userId), {
    choices: slice,
    expires: Date.now() + BLZ_PENDING_TTL_MS
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`blzmpick:${guildId}:${userId}`)
    .setPlaceholder("Choisis un resultat")
    .addOptions(
      slice.map((c, i) => ({
        label: `${c.kind === "spotify" ? "[SP]" : "[YT]"} ${String(c.title).slice(0, 92)}`,
        value: String(i),
        description: (c.url ? "YouTube" : "Spotify → YouTube").slice(0, 100)
      }))
    );

  await interaction.editReply({
    content: `**${slice.length}** proposition(s) pour \`${q.slice(0, 55)}\` — choisis ci-dessous.`,
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").ButtonInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleBlzMusicButton(client, interaction) {
  const parsed = parseMusicButtonId(interaction.customId);
  if (!parsed) return false;
  const { action, guildId } = parsed;
  if (interaction.guildId !== guildId) {
    await interaction.reply({ content: "Salon incorrect.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const guild = interaction.guild;
  if (!guild) return false;

  if (action === "playlist") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const payload = await musicPlaylist.buildPlaylistPanelPayload(
        client.prisma,
        guildId,
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

  if (action === "playprompt") {
    const modal = new ModalBuilder()
      .setCustomId(`blzmm:play:${guildId}`)
      .setTitle("Ajouter à la file")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("blzm_query")
            .setLabel("Titre ou lien YouTube")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(500)
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (action === "clear") {
    musicService.clearQueueGuild(guildId);
    await interaction.deferUpdate().catch(() => null);
    await syncBlzPanels(interaction, guildId);
    await interaction
      .followUp({ content: "🧹 File vidée (lecture en cours inchangée).", flags: MessageFlags.Ephemeral })
      .catch(() => null);
    return true;
  }

  if (action === "queue") {
    const text = musicService.formatQueue(guildId, 15);
    await interaction.reply({ content: text.slice(0, 2000), flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const vc = interaction.member?.voice?.channel;
  if (!vc?.isVoiceBased?.()) {
    await interaction
      .reply({
        content: "Connecte-toi au **salon vocal** où tu veux écouter la musique.",
        flags: MessageFlags.Ephemeral
      })
      .catch(() => null);
    return true;
  }

  await interaction.deferUpdate().catch(() => null);

  try {
    await musicService.joinChannel(guild, vc, { member: interaction.member, client });
  } catch (e) {
    await interaction
      .followUp({ content: "Impossible de rejoindre le vocal.", flags: MessageFlags.Ephemeral })
      .catch(() => null);
    return true;
  }

  switch (action) {
    case "prev": {
      const r = musicService.previousGuild(guild);
      if (r.error) {
        await interaction.followUp({ content: r.error, flags: MessageFlags.Ephemeral }).catch(() => null);
      }
      break;
    }
    case "pause": {
      const r = musicService.pauseGuild(guildId);
      if (r.error) await interaction.followUp({ content: r.error, flags: MessageFlags.Ephemeral }).catch(() => null);
      break;
    }
    case "resume": {
      const r = musicService.resumeGuild(guildId);
      if (r.error) await interaction.followUp({ content: r.error, flags: MessageFlags.Ephemeral }).catch(() => null);
      break;
    }
    case "skip": {
      const r = musicService.skipGuild(guildId);
      if (r.error) await interaction.followUp({ content: r.error, flags: MessageFlags.Ephemeral }).catch(() => null);
      break;
    }
    case "stop": {
      const r = musicService.stopGuild(guildId);
      if (r.error) await interaction.followUp({ content: r.error, flags: MessageFlags.Ephemeral }).catch(() => null);
      break;
    }
    default:
      return true;
  }

  await syncBlzPanels(interaction, guildId);
  return true;
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleBlzMusicModal(client, interaction) {
  if (!interaction.customId.startsWith("blzmm:play:")) return false;
  const guildId = interaction.customId.slice("blzmm:play:".length);
  if (!/^\d{17,22}$/.test(guildId) || interaction.guildId !== guildId) {
    await interaction.reply({ content: "Requête invalide.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }
  const q = interaction.fields.getTextInputValue("blzm_query")?.trim();
  if (!q) {
    await interaction.reply({ content: "Champ vide.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await runBlzPlayQueryFlow(interaction, client, {
    query: q,
    guildId,
    userId: interaction.user.id,
    prisma: client.prisma
  });
  await musicService.refreshRegisteredMusicPanels(client, guildId);
  return true;
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").StringSelectMenuInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleBlzMusicSelect(client, interaction) {
  const parsed = parseMusicSelectId(interaction.customId);
  if (!parsed) return false;
  const { guildId, userId } = parsed;
  if (interaction.user.id !== userId || interaction.guildId !== guildId) {
    await interaction.reply({ content: "Ce menu ne t'est pas destine.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  await interaction.deferUpdate().catch(() => null);
  pruneBlzPending();
  const key = blzPickKey(guildId, userId);
  const pending = blzPendingSearches.get(key);
  if (!pending || Date.now() > pending.expires) {
    blzPendingSearches.delete(key);
    await interaction
      .editReply({
        content: "Résultats expirés — relance **Ajouter**.",
        components: []
      })
      .catch(() => null);
    return true;
  }

  const idx = parseInt(interaction.values[0], 10);
  const choice = pending.choices[idx];
  blzPendingSearches.delete(key);
  if (!choice) {
    await interaction.editReply({ content: "Choix invalide.", components: [] }).catch(() => null);
    return true;
  }

  const v = musicService.getVoiceChannelForMember(interaction.member);
  if (v?.error) {
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
  else {
    await interaction
      .editReply({
        content: `Ajouté : **${enq.firstTitleDisplay || enq.firstTitle}** (${enq.queueLen} en file).`,
        components: []
      })
      .catch(() => null);
  }
  await musicService.refreshRegisteredMusicPanels(client, guildId);
  return true;
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Interaction} interaction
 * @returns {Promise<boolean>}
 */
async function routeBlzMusicInteractions(client, interaction) {
  if (interaction.isButton() && interaction.customId.startsWith("blzm:")) {
    return handleBlzMusicButton(client, interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("blzmm:play:")) {
    return handleBlzMusicModal(client, interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("blzmpick:")) {
    return handleBlzMusicSelect(client, interaction);
  }
  return false;
}

module.exports = { routeBlzMusicInteractions, runBlzPlayQueryFlow };
