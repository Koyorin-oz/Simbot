const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const config = require("../config");
const {
  completeWelcomeVerification,
  VERIFICATION_BUTTON_CUSTOM_ID
} = require("../services/welcomeVerifyService");
const {
  buildPanelPayload,
  createTempVoice,
  applyVoiceChannelSettings,
  loadPrefs,
  savePrefs,
  parseIdList,
  safeJsonParseArray,
  resolvePrivateRoomNameFromPrefs,
  memberHasPrivateRoomStaffBypass,
  resolveOwnerPrivateVoiceChannel
} = require("../services/privateRoomService");
const {
  TICKET_ACCESS_ROLE_ID,
  isTicketStaff,
  canCloseTicket,
  createTicketChannel,
  getGeneralTicketPanelChannelId,
  getWelcomeTicketPanelChannelId,
  pinStaffPanel,
  setTicketClosed,
  buildTranscript
} = require("../services/ticketService");
const {
  parseSuggestionVoteCustomId,
  channelMatchesStoredSuggestion,
  getVoteCounts,
  applyVote,
  buildSuggestionMessagePayload,
  canViewAndVoteSuggestions,
  isSuggestionOpenRow
} = require("../services/suggestionService");
const musicService = require("../services/musicService");
const { handleMusicPanelInteractions } = require("./musicPanelInteractions");
const { buildMusicPanelPayload, buildBlzMusicSessionAdapter } = require("../utils/musicPanel");
const voiceRoomPanelBLZInteractions = require("./voiceRoomPanelBLZInteractions");

function parsePrvOwner(customId) {
  const m = String(customId).match(/^(.+):(\d{17,20})$/);
  if (!m) return null;
  return { prefix: m[1], ownerId: m[2] };
}

async function handleWelcomeInteractions(client, interaction) {
  const v = config.welcomeVerify;
  if (!v?.enabled) return false;

  const isVerifyButton =
    interaction.isButton() &&
    (interaction.customId === VERIFICATION_BUTTON_CUSTOM_ID ||
      interaction.customId === "welcome_phone_verify");

  if (isVerifyButton) {
    await interaction.deferUpdate().catch(() => null);

    const guild = interaction.guild;
    const member = interaction.member;
    if (!guild || !member) return true;

    if (member.pending) {
      return true;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return true;

    try {
      await completeWelcomeVerification(guild, interaction.user.id);
    } catch (e) {
      console.warn("[welcomeVerify] interaction", e?.message || e);
    }
    return true;
  }

  return false;
}

async function handleTicketInteractions(client, interaction) {
  if (interaction.isButton() && interaction.customId === "ticket_open_prompt") {
    const expected = interaction.guild ? getGeneralTicketPanelChannelId(interaction.guild) : "";
    if (!expected || interaction.channelId !== expected) {
      await interaction.reply({
        content: "Utilise le bouton depuis le salon du panel **tickets generaux** uniquement.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    const modal = new ModalBuilder().setCustomId("ticket_open_modal").setTitle("Ouvrir un ticket");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_desc")
          .setLabel("Décris ton problème au maximum.")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(8)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && interaction.customId === "ticket_open_prompt_welcome") {
    const expected = getWelcomeTicketPanelChannelId();
    if (!expected || interaction.channelId !== expected) {
      await interaction.reply({
        content: "Ce bouton ne fonctionne que dans le salon du **processus d'accueil** (panel dedie).",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    const modal = new ModalBuilder().setCustomId("ticket_open_modal_welcome").setTitle("Ticket — verification / accueil");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_desc")
          .setLabel("Explique ton souci (verification, salons…)")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(8)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (
    interaction.isModalSubmit() &&
    (interaction.customId === "ticket_open_modal" || interaction.customId === "ticket_open_modal_welcome")
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const desc = interaction.fields.getTextInputValue("ticket_desc");
    const guild = interaction.guild;
    const isWelcome = interaction.customId === "ticket_open_modal_welcome";
    const kind = isWelcome ? "welcome" : "general";

    if (isWelcome) {
      const expected = getWelcomeTicketPanelChannelId();
      if (!expected || interaction.channelId !== expected) {
        await interaction.editReply({
          content: "Session invalide : rouvre le ticket depuis le salon **processus d'accueil**."
        });
        return true;
      }
    } else {
      const expected = getGeneralTicketPanelChannelId(guild);
      if (!expected || interaction.channelId !== expected) {
        await interaction.editReply({
          content: "Session invalide : rouvre le ticket depuis le salon **tickets generaux**."
        });
        return true;
      }
    }

    const existing = await client.prisma.ticket.findFirst({
      where: { guildId: guild.id, ownerId: interaction.user.id, status: "open", kind }
    });
    if (existing) {
      await interaction.editReply({ content: `Tu as deja un ticket ${kind === "welcome" ? "accueil " : ""}ouvert : <#${existing.channelId}>.` });
      return true;
    }

    let channel;
    try {
      channel = await createTicketChannel(guild, interaction.user.id, desc, { kind });
    } catch (e) {
      await interaction.editReply({ content: `Erreur : ${e.message}` });
      return true;
    }

    await client.prisma.ticket.create({
      data: { guildId: guild.id, channelId: channel.id, ownerId: interaction.user.id, status: "open", kind }
    });

    const tag = isWelcome ? "**[Accueil / verification]**" : "";
    await channel.send({
      content:
        `<@&${TICKET_ACCESS_ROLE_ID}> ${interaction.user} — merci pour ta demande. Un membre du staff te repondra ici.\n` +
        `${tag ? `${tag}\n` : ""}\n` +
        `**Sujet :**\n${desc}`
    });
    await pinStaffPanel(channel);
    await interaction.editReply({ content: `Ticket cree : ${channel}` });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ticket_close:")) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ticket = await client.prisma.ticket.findUnique({ where: { channelId } });
    if (!ticket) {
      await interaction.editReply({ content: "Ticket inconnu en base." });
      return true;
    }
    if (ticket.status === "closed") {
      await interaction.editReply({ content: "Ce ticket est deja ferme." });
      return true;
    }
    if (!canCloseTicket(interaction.member, interaction.user.id, ticket.ownerId)) {
      await interaction.editReply({
        content:
          "Seul le **demandeur** du ticket, le **staff** ou un membre avec le role moderateur peuvent fermer ce ticket."
      });
      return true;
    }
    await setTicketClosed(interaction.channel, ticket.ownerId, true);
    await client.prisma.ticket.update({ where: { channelId }, data: { status: "closed", closedAt: new Date() } });

    const closerMention = `<@${interaction.user.id}>`;
    const ownerMention = `<@${ticket.ownerId}>`;
    const closeEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Ticket fermé")
      .setDescription(
        `${closerMention} a **fermé** ce ticket.\n\n` +
          `**Demandeur :** ${ownerMention}\n` +
          `Le demandeur ne peut plus envoyer de messages. Le staff garde l’accès en lecture.\n\n` +
          `**Transcript** : archive complète du fil (fichier .txt).\n` +
          `**Supprimer le ticket** : supprime définitivement ce salon (irréversible).`
      )
      .setTimestamp(new Date());

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_closed_tr:${channelId}`)
        .setLabel("Télécharger transcript")
        .setEmoji("📜")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ticket_closed_del:${channelId}`)
        .setLabel("Supprimer le ticket")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [closeEmbed], components: [closeRow] });
    await interaction.editReply({
      content: "Ticket fermé. Un message récapitulatif a été envoyé dans le salon."
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ticket_reopen:")) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isTicketStaff(interaction.member)) {
      await interaction.reply({ content: "Reserve au staff.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const ticket = await client.prisma.ticket.findUnique({ where: { channelId } });
    if (!ticket) {
      await interaction.reply({ content: "Ticket inconnu.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await setTicketClosed(interaction.channel, ticket.ownerId, false);
    await client.prisma.ticket.update({ where: { channelId }, data: { status: "open", closedAt: null } });
    await interaction.reply({ content: "Ticket reouvert pour le membre.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ticket_closed_tr:")) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isTicketStaff(interaction.member)) {
      await interaction.reply({ content: "Réservé au staff.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { filename, buffer } = await buildTranscript(interaction.channel, "txt");
    await interaction.editReply({
      content: "Voici le transcript (.txt) de ce ticket.",
      files: [new AttachmentBuilder(buffer, { name: filename })]
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ticket_closed_del:")) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isTicketStaff(interaction.member)) {
      await interaction.reply({ content: "Réservé au staff.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ch = interaction.channel;
    try {
      await client.prisma.ticket.delete({ where: { channelId } }).catch(() => null);
      await ch.delete(`Ticket supprimé par ${interaction.user.tag}`);
    } catch (e) {
      await interaction.editReply({ content: `Impossible de supprimer le salon : ${e.message}` });
      return true;
    }
    await interaction.editReply({ content: "Salon du ticket supprimé." }).catch(() => null);
    return true;
  }

  if (interaction.isButton() && (interaction.customId.startsWith("ticket_tr_txt:") || interaction.customId.startsWith("ticket_tr_html:"))) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isTicketStaff(interaction.member)) {
      await interaction.reply({ content: "Reserve au staff.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const format = interaction.customId.startsWith("ticket_tr_html") ? "html" : "txt";
    const { filename, buffer } = await buildTranscript(interaction.channel, format);
    await interaction.editReply({
      content: "Voici le transcript.",
      files: [new AttachmentBuilder(buffer, { name: filename })]
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ticket_member_prompt:")) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isTicketStaff(interaction.member)) {
      await interaction.reply({ content: "Reserve au staff.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId(`ticket_member_modal:${channelId}`)
      .setTitle("Ajouter ou retirer un membre");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_member_id")
          .setLabel("ID du membre (profil > copier ID)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(17)
          .setMaxLength(20)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_member_action")
          .setLabel('Tape "ajouter" ou "retirer"')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(12)
          .setPlaceholder("ajouter")
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_member_modal:")) {
    const channelId = interaction.customId.split(":")[1];
    if (interaction.channelId !== channelId) {
      await interaction.reply({ content: "Mauvais salon.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isTicketStaff(interaction.member)) {
      await interaction.reply({ content: "Reserve au staff.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const userId = interaction.fields.getTextInputValue("ticket_member_id").trim();
    const actionRaw = interaction.fields.getTextInputValue("ticket_member_action").toLowerCase().trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ content: "ID membre invalide.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (actionRaw !== "ajouter" && actionRaw !== "retirer") {
      await interaction.reply({
        content: "Action invalide : ecris **ajouter** ou **retirer** (sans accent si besoin).",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    const ticket = await client.prisma.ticket.findUnique({ where: { channelId } });
    if (!ticket) {
      await interaction.reply({ content: "Ticket inconnu en base.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (userId === ticket.ownerId && actionRaw === "retirer") {
      await interaction.reply({ content: "Impossible de retirer l'auteur du ticket.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (userId === interaction.client.user.id) {
      await interaction.reply({ content: "Le bot doit rester dans le salon.", flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;

    if (actionRaw === "ajouter") {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await interaction.editReply({ content: "Membre introuvable sur ce serveur." });
        return true;
      }
      await channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true
      });
      await interaction.editReply({ content: `${member.user.tag} a ete ajoute au ticket.` });
      await channel.send({ content: `${member} a ete ajoute a ce ticket par ${interaction.user}.` }).catch(() => null);
      return true;
    }

    const ow = channel.permissionOverwrites.cache.get(userId);
    if (!ow) {
      await interaction.editReply({
        content: "Ce membre n'a pas d'acces individuel sur ce salon (rien a retirer)."
      });
      return true;
    }
    await channel.permissionOverwrites.delete(userId, `Ticket: retrait par ${interaction.user.tag}`);
    await interaction.editReply({ content: `Acces retire pour <@${userId}>.` });
    await channel.send({ content: `Acces de <@${userId}> retire par ${interaction.user}.` }).catch(() => null);
    return true;
  }

  return false;
}

function buildCreateModal(prefs, ownerId, hasExistingChannel = false, member = null) {
  const defaultName = member
    ? resolvePrivateRoomNameFromPrefs(member, prefs.defaultName)
    : String(prefs.defaultName || "Salon vocal").trim().slice(0, 100) || "Salon vocal";
  const modal = new ModalBuilder()
    .setCustomId(`prv_create_modal:${ownerId}`)
    .setTitle(hasExistingChannel ? "Configurer ton salon vocal" : "Creer ton salon vocal");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pr_name")
        .setLabel("Nom du salon")
        .setStyle(TextInputStyle.Short)
        .setValue(defaultName)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pr_limit")
        .setLabel("Places max (0 = illimite)")
        .setStyle(TextInputStyle.Short)
        .setValue(String(prefs.defaultLimit ?? 0))
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pr_mode")
        .setLabel("Mode: OPEN, BLACKLIST, WHITELIST, BOTH")
        .setStyle(TextInputStyle.Short)
        .setValue((prefs.defaultMode || "open").toUpperCase())
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pr_bl")
        .setLabel("IDs liste noire (optionnel)")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(safeJsonParseArray(prefs.blacklistIds).join(" "))
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pr_wl")
        .setLabel("IDs liste blanche (optionnel)")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(safeJsonParseArray(prefs.whitelistIds).join(" "))
        .setRequired(false)
    )
  );
  return modal;
}

function normalizePrivateRoomMode(raw) {
  const modeRaw = String(raw || "open").toLowerCase();
  const modeMap = { open: "open", blacklist: "blacklist", whitelist: "whitelist", both: "both" };
  return modeMap[modeRaw] || "open";
}

async function applySessionVoiceFromPrefs(client, prisma, guildId, ownerId, member) {
  const resolved = await resolveOwnerPrivateVoiceChannel(client, member.guild, ownerId);
  if (!resolved.channel) return { ok: true, skipped: true };
  const prefs = await loadPrefs(prisma, guildId, ownerId);
  return applyVoiceChannelSettings(client, prisma, member, resolved.channel.id, {
    name: resolvePrivateRoomNameFromPrefs(member, prefs.defaultName),
    limit: Number.isFinite(Number(prefs.defaultLimit)) ? Number(prefs.defaultLimit) : 0,
    mode: normalizePrivateRoomMode(prefs.defaultMode),
    blacklistIds: safeJsonParseArray(prefs.blacklistIds),
    whitelistIds: safeJsonParseArray(prefs.whitelistIds)
  });
}

async function handlePrivateRoomInteractions(client, interaction) {
  const pr = config.privateRoom;
  if (!pr?.enabled) return false;

  if (interaction.isButton() && interaction.customId.startsWith("prv_")) {
    const parsed = parsePrvOwner(interaction.customId);
    if (!parsed) return false;
    const staffBypass = memberHasPrivateRoomStaffBypass(interaction.member);
    if (parsed.ownerId !== interaction.user.id && !staffBypass) {
      await interaction.reply({ content: "Ce panneau ne t'est pas destine.", flags: MessageFlags.Ephemeral }).catch(() => null);
      return true;
    }
    const { prefix, ownerId } = parsed;

    if (prefix === "prv_create") {
      const prefs = await loadPrefs(client.prisma, interaction.guildId, ownerId);
      const member = await interaction.guild.members.fetch(ownerId).catch(() => interaction.member);
      const s = client.privateRoomSessions?.get(`${interaction.guildId}:${ownerId}`);
      let hasExistingChannel = false;
      if (s?.voiceChannelId) {
        const ch = await interaction.guild.channels.fetch(s.voiceChannelId).catch(() => null);
        hasExistingChannel = Boolean(ch?.isVoiceBased?.());
        if (!hasExistingChannel) s.voiceChannelId = null;
      }
      await interaction.showModal(buildCreateModal(prefs, ownerId, hasExistingChannel, member));
      return true;
    }

    if (prefix === "prv_refresh") {
      const member = await interaction.guild.members.fetch(ownerId).catch(() => interaction.member);
      const payload = await buildPanelPayload(client, client.prisma, member);
      const upd = {
        embeds: payload.embeds || [],
        components: payload.components || []
      };
      if (payload.content != null) upd.content = payload.content;
      if (payload.allowedMentions) upd.allowedMentions = payload.allowedMentions;
      await interaction.update(upd).catch(() => null);
      return true;
    }

    if (prefix === "prv_lock") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const resolved = await resolveOwnerPrivateVoiceChannel(client, interaction.guild, ownerId);
      if (!resolved.channel) {
        await interaction.editReply({ content: resolved.error || "Pas de salon actif." });
        return true;
      }
      const guild = interaction.guild;
      const channel = resolved.channel;
      const gOw = channel.permissionOverwrites.cache.get(guild.id);
      const allow = new PermissionsBitField(gOw?.allow?.bitfield ?? 0n);
      const deny = new PermissionsBitField(gOw?.deny?.bitfield ?? 0n);
      deny.add(PermissionFlagsBits.Connect);
      allow.remove(PermissionFlagsBits.Connect);
      try {
        await channel.permissionOverwrites.edit(guild.id, { allow, deny });
        await interaction.editReply({
          content:
            "Salon **verrouillé** : les membres sans permission explicite ne peuvent plus rejoindre. Utilise **Déverr.** pour réappliquer tes listes / mode."
        });
      } catch (e) {
        await interaction.editReply({ content: e?.message || "Impossible de modifier les permissions." });
      }
      return true;
    }

    if (prefix === "prv_unlock") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const prefs = await loadPrefs(client.prisma, interaction.guildId, ownerId);
      const member = await interaction.guild.members.fetch(ownerId).catch(() => interaction.member);
      const resolved = await resolveOwnerPrivateVoiceChannel(client, interaction.guild, ownerId);
      if (!resolved.channel) {
        await interaction.editReply({ content: resolved.error || "Pas de salon actif." });
        return true;
      }
      const userLimit = Number.isFinite(Number(prefs.defaultLimit)) ? Math.max(0, Math.min(99, Number(prefs.defaultLimit))) : 0;
      const applied = await applyVoiceChannelSettings(client, client.prisma, member, resolved.channel.id, {
        name: resolvePrivateRoomNameFromPrefs(member, prefs.defaultName),
        limit: userLimit,
        mode: normalizePrivateRoomMode(prefs.defaultMode),
        blacklistIds: safeJsonParseArray(prefs.blacklistIds),
        whitelistIds: safeJsonParseArray(prefs.whitelistIds)
      });
      await interaction.editReply({
        content: applied.ok ? "Salon **déverrouillé** : permissions réappliquées selon tes préférences." : applied.error
      });
      return true;
    }

    if (prefix === "prv_rename" || prefix === "prv_limit") {
      const modal = new ModalBuilder()
        .setCustomId(`${prefix === "prv_rename" ? "prv_rename_modal" : "prv_limit_modal"}:${ownerId}`)
        .setTitle(prefix === "prv_rename" ? "Renommer" : "Places max");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("pr_val")
            .setLabel(prefix === "prv_rename" ? "Nouveau nom" : "Nombre max (0 illimite)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (prefix === "prv_bl" || prefix === "prv_wl") {
      const modal = new ModalBuilder()
        .setCustomId(`${prefix === "prv_bl" ? "prv_bl_modal" : "prv_wl_modal"}:${ownerId}`)
        .setTitle(prefix === "prv_bl" ? "Liste noire (IDs)" : "Liste blanche (IDs)");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("pr_ids")
            .setLabel("IDs Discord separes par espace ou virgule")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );
      await interaction.showModal(modal);
      return true;
    }

    if (prefix === "prv_music_panel") {
      if (!musicService.isEnabled()) {
        await interaction
          .reply({ content: "La musique est desactivee sur ce bot.", flags: MessageFlags.Ephemeral })
          .catch(() => null);
        return true;
      }
      const payload = buildMusicPanelPayload(
        interaction.guildId,
        buildBlzMusicSessionAdapter(interaction.guildId)
      );
      await interaction
        .reply({ ...payload, flags: MessageFlags.Ephemeral })
        .catch((e) => console.warn("[PRV] music panel reply", e?.message || e));
      return true;
    }

    return false;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("prv_")) {
    const parsed = parsePrvOwner(interaction.customId);
    if (!parsed || !parsed.prefix.includes("_modal")) return false;
    if (parsed.ownerId !== interaction.user.id && !memberHasPrivateRoomStaffBypass(interaction.member)) {
      await interaction.reply({ content: "Ce formulaire ne t'est pas destine.", flags: MessageFlags.Ephemeral }).catch(() => null);
      return true;
    }
    const { prefix, ownerId } = parsed;

    if (prefix === "prv_create_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.fields.getTextInputValue("pr_name");
      const limit = Number(interaction.fields.getTextInputValue("pr_limit"));
      const modeRaw = interaction.fields.getTextInputValue("pr_mode").trim().toLowerCase();
      const bl = parseIdList(interaction.fields.getTextInputValue("pr_bl"));
      const wl = parseIdList(interaction.fields.getTextInputValue("pr_wl"));

      const modeMap = { open: "open", blacklist: "blacklist", whitelist: "whitelist", both: "both" };
      const mode = modeMap[modeRaw] || "open";

      const member = await interaction.guild.members.fetch(ownerId).catch(() => interaction.member);
      const payload = { name, limit, mode, blacklistIds: bl, whitelistIds: wl };

      const resolved = await resolveOwnerPrivateVoiceChannel(client, interaction.guild, ownerId);
      if (resolved.channel) {
        const applied = await applyVoiceChannelSettings(
          client,
          client.prisma,
          member,
          resolved.channel.id,
          payload
        );
        if (!applied.ok) {
          await interaction.editReply({ content: applied.error });
          return true;
        }
        await interaction.editReply({ content: `Parametres appliques sur ${applied.channel}.` });
        return true;
      }
      if (resolved.error && resolved.mayCreateNew === false) {
        await interaction.editReply({ content: resolved.error });
        return true;
      }

      const result = await createTempVoice(client, client.prisma, member, payload);

      if (!result.ok) {
        await interaction.editReply({ content: result.error });
        return true;
      }
      await interaction.editReply({ content: `Salon cree : ${result.channel}` });
      return true;
    }

    if (prefix === "prv_rename_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.fields.getTextInputValue("pr_val").trim();
      const resolved = await resolveOwnerPrivateVoiceChannel(client, interaction.guild, ownerId);
      if (!resolved.channel) {
        await interaction.editReply({ content: resolved.error || "Pas de salon actif." });
        return true;
      }
      await resolved.channel.setName(name.slice(0, 100)).catch(() => null);
      await interaction.editReply({ content: "Nom mis a jour." });
      return true;
    }

    if (prefix === "prv_limit_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const n = Math.max(0, Math.min(99, Number(interaction.fields.getTextInputValue("pr_val"))));
      const resolved = await resolveOwnerPrivateVoiceChannel(client, interaction.guild, ownerId);
      if (!resolved.channel) {
        await interaction.editReply({ content: resolved.error || "Pas de salon actif." });
        return true;
      }
      await resolved.channel.setUserLimit(n || 0).catch(() => null);
      await interaction.editReply({ content: "Limite mise a jour." });
      return true;
    }

    if (prefix === "prv_bl_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ids = parseIdList(interaction.fields.getTextInputValue("pr_ids"));
      await loadPrefs(client.prisma, interaction.guildId, ownerId);
      await savePrefs(client.prisma, interaction.guildId, ownerId, { blacklistIds: JSON.stringify(ids) });
      const member = await interaction.guild.members.fetch(ownerId).catch(() => interaction.member);
      const applied = await applySessionVoiceFromPrefs(client, client.prisma, interaction.guildId, ownerId, member);
      let extra = "";
      if (!applied.skipped) {
        extra = applied.ok ? " Appliquee sur ton salon vocal." : ` ${applied.error}`;
      }
      await interaction.editReply({
        content: `Liste noire enregistree (${ids.length} id).${extra}`
      });
      return true;
    }

    if (prefix === "prv_wl_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ids = parseIdList(interaction.fields.getTextInputValue("pr_ids"));
      await loadPrefs(client.prisma, interaction.guildId, ownerId);
      await savePrefs(client.prisma, interaction.guildId, ownerId, { whitelistIds: JSON.stringify(ids) });
      const member = await interaction.guild.members.fetch(ownerId).catch(() => interaction.member);
      const applied = await applySessionVoiceFromPrefs(client, client.prisma, interaction.guildId, ownerId, member);
      let extra = "";
      if (!applied.skipped) {
        extra = applied.ok ? " Appliquee sur ton salon vocal." : ` ${applied.error}`;
      }
      await interaction.editReply({
        content: `Liste blanche enregistree (${ids.length} id).${extra}`
      });
      return true;
    }

  }

  return false;
}

async function handleSuggestionInteractions(client, interaction) {
  if (interaction.isButton() && interaction.customId.startsWith("sg_vote:")) {
    // Anciens messages avec le bouton « Réagir » (retiré) : eviter interaction echouee.
    if (/:react$/.test(interaction.customId)) {
      await interaction
        .reply({
          content:
            "Ce bouton n’est plus utilisé. Pour **commenter**, ouvre le **fil de discussion** sous la suggestion.",
          flags: MessageFlags.Ephemeral
        })
        .catch(() => null);
      return true;
    }

    const parsed = parseSuggestionVoteCustomId(interaction.customId);
    if (!parsed) return false;

    if (interaction.user.bot) {
      await interaction.reply({ content: "Les bots ne votent pas.", flags: MessageFlags.Ephemeral }).catch(() => null);
      return true;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Vote impossible hors serveur.", flags: MessageFlags.Ephemeral }).catch(() => null);
      return true;
    }

    const member =
      interaction.member ||
      (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member || !canViewAndVoteSuggestions(member)) {
      await interaction
        .reply({
          content:
            "Tu dois etre **membre verifie** (ou staff suggestions) pour voter. Si tu viens d'obtenir le role, reessaie dans un instant.",
          flags: MessageFlags.Ephemeral
        })
        .catch(() => null);
      return true;
    }

    const { suggestionId, dir } = parsed;
    const suggestion = await client.prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || !channelMatchesStoredSuggestion(interaction, suggestion.channelId)) {
      await interaction
        .reply({ content: "Suggestion introuvable ou mauvais salon.", flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return true;
    }
    if (!isSuggestionOpenRow(suggestion)) {
      await interaction
        .reply({
          content:
            "Cette suggestion est **close** : le staff a déjà tranché, tu ne peux plus voter.",
          flags: MessageFlags.Ephemeral
        })
        .catch(() => null);
      return true;
    }

    await interaction.deferUpdate().catch(() => null);

    try {
      await applyVote(client.prisma, suggestionId, interaction.user.id, dir);
      const counts = await getVoteCounts(client.prisma, suggestionId);
      const pingRoleId = String(config.suggestions?.pingRoleId || "").trim();
      const footerIconURL =
        interaction.guild?.iconURL({ extension: "png", size: 64 }) || null;
      const payload = buildSuggestionMessagePayload(suggestion, counts, {
        pingRoleId,
        footerIconURL
      });

      if (interaction.message?.editable) {
        const editOpts = {
          components: payload.components,
          embeds: payload.embeds ?? [],
          allowedMentions: payload.allowedMentions
        };
        if (payload.content != null) editOpts.content = payload.content;
        await interaction.message.edit(editOpts);
      }
    } catch (e) {
      await interaction
        .followUp({
          content: `Erreur vote / affichage : ${e.message || e}`.slice(0, 2000),
          flags: MessageFlags.Ephemeral
        })
        .catch(() => null);
    }
    return true;
  }

  return false;
}

async function routeFeatureInteractions(client, interaction) {
  if (await handleWelcomeInteractions(client, interaction)) return true;
  if (await handleTicketInteractions(client, interaction)) return true;

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("pvropen:")) {
      if (await voiceRoomPanelBLZInteractions.handleVocPanelOpenBLZButton(interaction)) return true;
    }
    if (interaction.customId.startsWith("pvr:")) {
      if (await voiceRoomPanelBLZInteractions.handleVoiceRoomPanelBLZButton(interaction)) return true;
    }
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("pvrm:")) {
    if (await voiceRoomPanelBLZInteractions.handleVoiceRoomPanelBLZModal(interaction)) return true;
  }

  if (await handlePrivateRoomInteractions(client, interaction)) return true;
  if (await handleMusicPanelInteractions(client, interaction)) return true;
  if (await handleSuggestionInteractions(client, interaction)) return true;
  return false;
}

module.exports = { routeFeatureInteractions };
