const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const config = require("../../config");
const { ensureUser } = require("../../services/economyService");
const {
  buildShopPanel,
  buildLeaderboardPanel,
  buildModeratorProfilePanel,
  formatLeaderboardViewerPlacement
} = require("../../utils/componentsV2Panels");
const { buildInventoryPanel } = require("../../utils/inventoryPanels");
const {
  addCoffeeItem,
  addCustomRoleItem,
  consumeCustomRoleItem,
  getInventorySnapshot,
  useCoffeeItem,
  formatDuration
} = require("../../services/inventoryService");
const { buildVotePanel } = require("../../utils/votePanel");
const { buildTicTacToePanel, buildConnect4Panel } = require("../../utils/gamesPanels");
const { parseBirthdayInput, upsertBirthday, listBirthdays, getUpcomingBirthdays } = require("../../services/birthdayService");
const { buildBirthdayListPanel } = require("../../utils/birthdayPanels");
const { formatSC } = require("../../utils/currency");
const {
  GIVEAWAY_JOIN_PREFIX,
  canParticipate,
  buildGiveawayPayload,
  finalizeGiveaway,
  parseDurationMs,
  scheduleGiveawayEnd
} = require("../../services/giveawayService");
const {
  CATEGORIES,
  classifyCommand,
  getGuildVisibility,
  buildVisibilityMenu,
  applyVisibilityForGuild
} = require("../../services/commandVisibilityService");
const { getModeratorProfileView } = require("../../services/moderatorProfileService");
const { isFrozen } = require("../../services/simbotRuntimeService");
const { isEconomyPaused } = require("../../services/economyRuntimeService");
const { logApiError } = require("../../utils/botLogger");
const {
  getAdminDevCommandRoleId,
  getModerationCommandRoleId,
  getCommandOwnerBypassUserId
} = require("../../services/staffCommandPermissionsService");
const { APPEAL_FORM_URL } = require("../../utils/ticketPanels");
const { getGuildLeaderboardRank } = require("../../services/leaderboardRankService");
const { handleAutoModInteraction } = require("../../interactions/autoModInteractions");

const OWNER_BYPASS_ID = getCommandOwnerBypassUserId();
const VOTE_ALLOWED_ROLE_ID = "1401908829339390002";

const ECONOMY_MUTATION_COMMANDS = new Set([
  "quotidien",
  "journalier",
  "hebdomadaire",
  "mensuel",
  "boutique",
  "transfert-sc",
  "donner",
  "pret",
  "admin-give",
  "admin-remove",
  "give-sc",
  "give-sp",
  "give-lp",
  "remove-sc",
  "remove-sp",
  "remove-lp",
  "adminargent",
  "admin-reset-saison"
]);

function hasAdminAccess(interaction) {
  return (
    interaction.user?.id === OWNER_BYPASS_ID ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

function hasAdminDevSlashAccess(interaction) {
  if (interaction.user?.id === OWNER_BYPASS_ID) return true;
  return Boolean(interaction.member?.roles?.cache?.has(getAdminDevCommandRoleId()));
}

function hasModerationSlashAccess(interaction) {
  if (interaction.user?.id === OWNER_BYPASS_ID) return true;
  return Boolean(interaction.member?.roles?.cache?.has(getModerationCommandRoleId()));
}

function hasRequiredCommandPermissions(interaction, command) {
  if (interaction.user?.id === OWNER_BYPASS_ID) return true;
  /** Pas de filtre staff : la commande vérifie seulement le salon dans son execute. */
  if (interaction.commandName === "flex") return true;
  const cat = classifyCommand(interaction.commandName);
  if (cat === "dev" || cat === "admin") {
    return hasAdminDevSlashAccess(interaction);
  }
  if (cat === "moderation") {
    return hasModerationSlashAccess(interaction);
  }
  const raw = command?.data?.toJSON?.()?.default_member_permissions;
  if (!raw) return true;
  try {
    return Boolean(interaction.memberPermissions?.has(BigInt(raw)));
  } catch {
    return Boolean(interaction.memberPermissions?.has(raw));
  }
}

function canUseVote(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles?.cache?.has(VOTE_ALLOWED_ROLE_ID)) return true;
  const suggestionsStaffRole = String(config.suggestions?.staffRoleId || "").trim();
  if (suggestionsStaffRole && member.roles?.cache?.has(suggestionsStaffRole)) return true;
  return false;
}

/** Évite un crash si le token d’interaction a expiré (> ~3 s) : met à jour le message directement. */
async function safeInteractionComponentUpdate(interaction, payload) {
  try {
    await interaction.update(payload);
    return;
  } catch (err) {
    if (err?.code === 10062 && interaction.message?.editable) {
      await interaction.message.edit(payload).catch(() => null);
      return;
    }
    logApiError("INTERACTION", err, { maxDetailChars: 400 });
  }
}

function normalizeDeployPanel(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  const map = {
    bienvenue: "bienvenue_panel",
    "bienvenue_panel": "bienvenue_panel",
    "bienvenue_alt": "bienvenue_alt_panel",
    bienvenuealt: "bienvenue_alt_panel",
    accueil_alt: "bienvenue_alt_panel",
    accueil2: "bienvenue_alt_panel",
    second_accueil: "bienvenue_alt_panel",
    "bienvenue_alt_panel": "bienvenue_alt_panel",
    rank: "rank_roles",
    ranks: "rank_roles",
    rang: "rank_roles",
    rangs: "rank_roles",
    rank_roles: "rank_roles",
    ticket: "ticket_panel",
    tickets: "ticket_panel",
    ticket_panel: "ticket_panel",
    ticket_general: "ticket_panel",
    tickets_general: "ticket_panel",
    ticket_welcome: "ticket_welcome_panel",
    ticket_welcome_panel: "ticket_welcome_panel",
    tickets_accueil: "ticket_welcome_panel",
    tickets_welcome: "ticket_welcome_panel",
    suggestion: "suggestions_intro",
    suggestions: "suggestions_intro",
    suggestions_intro: "suggestions_intro",
    verification: "verification_panel",
    verif: "verification_panel",
    verification_panel: "verification_panel",
    categorie: "categories_accueil",
    categories: "categories_accueil",
    categories_accueil: "categories_accueil",
    tout: "tout"
  };
  return map[value] || null;
}

const { readShopBannerAttachment } = require("../../utils/shopBanner");

module.exports = {
  name: "interactionCreate",
  async execute(client, interaction) {
    if (interaction.isChatInputCommand()) {
      let command = client.commands.get(interaction.commandName);
      if (!command) {
        if (!client._reloadTriedCommandNames) client._reloadTriedCommandNames = new Set();
        const key = interaction.commandName;
        if (!client._reloadTriedCommandNames.has(key)) {
          client._reloadTriedCommandNames.add(key);
          const { reloadCommands } = require("../../handlers/commandHandler");
          reloadCommands(client);
          command = client.commands.get(key);
        }
      }
      if (!command) {
        await interaction
          .reply({
            content:
              "Cette commande n'est pas chargee par le bot (fichier manquant ou process pas a jour). **Redemarre SimBot** sur l'hebergeur (ou relance `npm start` en local) apres un `deploy:commands`.",
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      if (isFrozen() && !["restart-simbot", "arreter-simbot"].includes(interaction.commandName)) {
        await interaction
          .reply({
            content: "SimBot est actuellement arrete (mode gele). Utilise `/restart-simbot` pour re-activer.",
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      const visibility = getGuildVisibility(interaction.guildId);
      const category = classifyCommand(interaction.commandName);
      const flexBypassVisibility = interaction.commandName === "flex";
      if (visibility[category] && !hasAdminAccess(interaction) && !flexBypassVisibility) {
        await interaction
          .reply({
            content: "Cette categorie de commandes est actuellement desactivee sur ce serveur.",
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      if (category === "dev" || category === "admin") {
        if (!hasAdminDevSlashAccess(interaction)) {
          await interaction
            .reply({
              content:
                "Cette commande est réservée au rôle **Admin/Dev** du bot.",
              flags: MessageFlags.Ephemeral
            })
            .catch(() => null);
          return;
        }
      } else if (category === "moderation") {
        if (!hasModerationSlashAccess(interaction)) {
          await interaction
            .reply({
              content:
                "Cette commande est réservée au rôle **Modération** du bot.",
              flags: MessageFlags.Ephemeral
            })
            .catch(() => null);
          return;
        }
      }
      if (!hasRequiredCommandPermissions(interaction, command)) {
        await interaction
          .reply({
            content: "Tu n'as pas les permissions requises pour cette commande.",
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      if (isEconomyPaused() && ECONOMY_MUTATION_COMMANDS.has(interaction.commandName)) {
        await interaction
          .reply({
            content: "⏸️ L'economie est actuellement en pause. Cette commande est temporairement desactivee.",
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      try {
        await command.execute(client, interaction);
      } catch (error) {
        logApiError(`CMD_ERROR:${interaction.commandName}`, error, { maxDetailChars: 500 });
        const payload = { content: "Une erreur est survenue pendant l'execution de la commande.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
        else await interaction.reply(payload).catch(() => null);
      }
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isModalSubmit() ||
      (interaction.isStringSelectMenu() &&
        (interaction.customId === "automod:del" ||
          interaction.customId.startsWith("music_pick:") ||
          interaction.customId.startsWith("music_hsel:") ||
          interaction.customId.startsWith("music_plpick:") ||
          interaction.customId.startsWith("blzmpick:")))
    ) {
      if (isFrozen()) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "SimBot est en mode gele, interaction desactivee temporairement.",
            flags: MessageFlags.Ephemeral
          }).catch(() => null);
        }
        return;
      }
      const { routeFeatureInteractions } = require("../../interactions/featureRouter");
      const handled = await routeFeatureInteractions(client, interaction).catch((err) => {
        console.error("[FEATURE_ROUTER]", err);
        return false;
      });
      if (handled) return;
      const autoModHandled = await handleAutoModInteraction(client, interaction).catch((err) => {
        logApiError("AUTOMOD_INTERACTION", err, { maxDetailChars: 400 });
        return false;
      });
      if (autoModHandled) return;
    }

    if (interaction.isButton() && interaction.customId?.startsWith("blague_reveal:")) {
      const { parseRevealCustomId, consumePunchline } = require("../../utils/blagueRevealStore");
      const token = parseRevealCustomId(interaction.customId);
      const data = token ? consumePunchline(client, token) : null;
      if (!data) {
        await interaction
          .reply({
            content: "Cette chute ne peut plus être révélée (expirée ou déjà affichée).",
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0xc27b2e)
        .setDescription(`**${data.setup}**\n\n${data.punchline}`)
        .setFooter({ text: `Catégorie : ${data.category}` })
        .setTimestamp(new Date());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("scheduled_joke_like")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🤍")
          .setLabel("J'aime")
      );
      await interaction.update({ embeds: [embed], components: [row] }).catch(() => null);
      return;
    }

    if (interaction.isButton() && interaction.customId === "scheduled_joke_like") {
      await interaction
        .reply({
          content: "Merci, noté.",
          flags: MessageFlags.Ephemeral
        })
        .catch(() => null);
      return;
    }

    if (interaction.isButton() && interaction.customId === "ban_appeal_open") {
      const payload = { content: `**Debannissement:** ${APPEAL_FORM_URL}` };
      if (interaction.inGuild()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      else await interaction.reply(payload);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("ping_role_toggle:")) {
      const { parsePingRoleToggleCustomId, getAllowedPingRoleIds } = require("../../utils/pingRolesPanel");
      const parsed = parsePingRoleToggleCustomId(interaction.customId);
      const roleId = parsed?.roleId || "";
      if (!interaction.inGuild()) {
        await interaction.reply({ content: "Utilisable uniquement sur le serveur.", flags: MessageFlags.Ephemeral });
        return;
      }
      const allowedIds = getAllowedPingRoleIds(config);
      if (!roleId || !allowedIds.has(roleId)) {
        await interaction.reply({ content: "Ce bouton n'est plus valide.", flags: MessageFlags.Ephemeral });
        return;
      }
      const member = interaction.member;
      if (!member) {
        await interaction.reply({ content: "Membre introuvable.", flags: MessageFlags.Ephemeral });
        return;
      }
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        await interaction.reply({ content: "Rôle introuvable.", flags: MessageFlags.Ephemeral });
        return;
      }
      const me = interaction.guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({
          content: "Je n'ai pas la permission **Gérer les rôles**.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (role.position >= me.roles.highest.position) {
        await interaction.reply({
          content: "Ce rôle est trop haut dans la liste : place mes rôles au-dessus des rôles ping.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const has = member.roles.cache.has(roleId);
      try {
        if (has) await member.roles.remove(role, "Panel ping : retrait par le membre");
        else await member.roles.add(role, "Panel ping : ajout par le membre");
      } catch (e) {
        const msg = e?.message || String(e);
        await interaction
          .reply({
            content: `Impossible de modifier le rôle : ${msg.slice(0, 400)}`,
            flags: MessageFlags.Ephemeral
          })
          .catch(() => null);
        return;
      }
      await interaction.reply({
        content: has ? "Tu ne recevras plus ce ping — rôle **retiré**." : "C'est bon — rôle **ajouté**.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "dev_deploy_select") {
      if (!interaction.inGuild()) {
        await interaction.reply({ content: "Utilisable uniquement sur un serveur.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (!hasAdminAccess(interaction)) {
        await interaction.reply({
          content: "Reserve aux **administrateurs** (ou au proprietaire autorise du bot).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (isFrozen()) {
        await interaction.reply({
          content: "SimBot est en mode gele, interaction desactivee temporairement.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const raw = String(interaction.values?.[0] || "");
      const colon = raw.indexOf(":");
      const resetChar = colon >= 0 ? raw.slice(0, colon) : "";
      const key = colon >= 0 ? raw.slice(colon + 1) : "";
      const { getDeployActionKeys } = require("../../utils/deployPanel");
      const allowed = new Set(getDeployActionKeys());
      if (!allowed.has(key) || (resetChar !== "0" && resetChar !== "1")) {
        await interaction.reply({ content: "Choix invalide, relance `/dev-deployer`.", flags: MessageFlags.Ephemeral });
        return;
      }
      const reset = resetChar === "1";
      const { runDeployAction } = require("../../services/deployService");

      await interaction.deferUpdate();
      try {
        const msg = await runDeployAction(client, interaction.guild, key, interaction.user.id, { reset });
        await interaction.editReply({
          content: msg.slice(0, 2000),
          components: []
        });
      } catch (e) {
        logApiError("DEV_DEPLOY_SELECT", e, { maxDetailChars: 500 });
        await interaction
          .editReply({
            content: `Erreur : ${e?.message || String(e)}`.slice(0, 2000),
            components: []
          })
          .catch(() => null);
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "cmd_visibility_select") {
      if (!hasAdminAccess(interaction)) {
        await interaction.reply({
          content: "Menu reserve aux administrateurs.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const selected = interaction.values?.[0] || "";
      const [action, category] = selected.split(":");
      if (!["enable", "disable"].includes(action) || !CATEGORIES.includes(category)) {
        await interaction.reply({ content: "Action invalide.", flags: MessageFlags.Ephemeral });
        return;
      }
      const current = getGuildVisibility(interaction.guildId);
      const next = { ...current, [category]: action === "disable" };
      const result = await applyVisibilityForGuild(client, interaction.guild, next);
      const menu = buildVisibilityMenu(result.state);
      await interaction.update({
        ...menu,
        content: `${menu.content}\n\n✅ Mise à jour appliquée (${result.updated} commandes).`
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(GIVEAWAY_JOIN_PREFIX)) {
      const giveawayId = interaction.customId.slice(GIVEAWAY_JOIN_PREFIX.length);
      const state = client.giveaways.get(giveawayId);
      if (!state || state.messageId !== interaction.message.id) {
        await interaction.reply({ content: "Ce giveaway est introuvable.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (state.ended || Date.now() >= state.endAt) {
        await finalizeGiveaway(client, state);
        await interaction.reply({ content: "Ce giveaway est déjà terminé.", flags: MessageFlags.Ephemeral });
        return;
      }

      const member = interaction.member;
      if (!canParticipate(member, state.mode, state.roleId)) {
        const reason =
          state.mode === "exclude_role"
            ? "Tu as un rôle exclu de ce giveaway."
            : state.mode === "include_role"
              ? "Ce giveaway est réservé à un rôle spécifique."
              : "Tu ne peux pas participer à ce giveaway.";
        await interaction.reply({ content: reason, flags: MessageFlags.Ephemeral });
        return;
      }

      const uid = interaction.user.id;
      if (state.participants.has(uid)) state.participants.delete(uid);
      else state.participants.add(uid);

      await interaction.update(buildGiveawayPayload(state));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("ga:create:")) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "Réservé aux membres avec **Gérer le serveur**.", flags: MessageFlags.Ephemeral });
        return;
      }

      const parts = interaction.customId.split(":");
      const mode = parts[2] || "open";
      const roleId = parts[3] && parts[3] !== "0" ? parts[3] : null;
      const channelId = parts[4];

      const title = interaction.fields.getTextInputValue("ga_title").trim();
      const desc = interaction.fields.getTextInputValue("ga_desc")?.trim() || "";
      const winnersRaw = interaction.fields.getTextInputValue("ga_winners").trim();
      const durationRaw = interaction.fields.getTextInputValue("ga_duration").trim();

      const winnerCount = Number(winnersRaw);
      if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) {
        await interaction.reply({ content: "Nombre de gagnants invalide (1 à 20).", flags: MessageFlags.Ephemeral });
        return;
      }

      const parsed = parseDurationMs(durationRaw);
      if (!parsed.ok) {
        await interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) {
        await interaction.editReply({ content: "Salon de destination introuvable." });
        return;
      }
      const me = interaction.guild.members.me;
      if (!channel.permissionsFor(me).has(["ViewChannel", "SendMessages"])) {
        await interaction.editReply({
          content: "Je ne peux pas poster dans ce salon (permissions manquantes)."
        });
        return;
      }

      const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const state = {
        id,
        guildId: interaction.guild.id,
        channelId: channel.id,
        messageId: null,
        authorId: interaction.user.id,
        title,
        description: desc,
        winnerCount,
        mode,
        roleId,
        createdAt: Date.now(),
        endAt: Date.now() + parsed.ms,
        participants: new Set(),
        ended: false,
        timeout: null
      };

      const msg = await channel.send(buildGiveawayPayload(state));
      state.messageId = msg.id;
      client.giveaways.set(state.id, state);
      scheduleGiveawayEnd(client, state);

      await interaction.editReply({
        content: `Giveaway créé dans ${channel}: [ouvrir](${msg.url})`
      });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "deploy_modal") {
      if (!hasAdminAccess(interaction)) {
        await interaction.reply({
          content: "Commande admin réservée aux membres avec **Administrateur** (ou au propriétaire autorisé du bot).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const panelRaw = interaction.fields.getTextInputValue("deploy_panel");
      const modeRaw = (interaction.fields.getTextInputValue("deploy_mode") || "").trim().toLowerCase();
      const panel = normalizeDeployPanel(panelRaw);
      if (!panel) {
        await interaction.reply({
          content:
            "Panel invalide. Ex. `bienvenue`, `bienvenue_alt`, `verification`, `ranks`, `ticket_general`, `ticket_welcome`, `suggestions`, `categories`, `tout`.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const reset = ["reinitialiser", "reset", "reload", "refresh"].includes(modeRaw);
      const { runDeployAction } = require("../../services/deployService");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const msg = await runDeployAction(client, interaction.guild, panel, interaction.user.id, { reset });
        await interaction.editReply({ content: msg.slice(0, 2000) });
      } catch (e) {
        logApiError("DEPLOY_MODAL", e, { maxDetailChars: 500 });
        await interaction
          .editReply({
            content: `Erreur pendant le deploiement : ${e?.message || String(e)}`.slice(0, 2000)
          })
          .catch(() => null);
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "shop_item") {
      const selected = interaction.values[0];
      client.shopSessions.set(interaction.user.id, selected);
      const { attachment, hasFile } = readShopBannerAttachment();
      const user = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
      const inv = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
      const now = new Date();
      const timeLabel = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const panel = buildShopPanel(config, user.simbaCoins, timeLabel, selected, {
        canBuyCustomRole: !user.customRoleUnlocked && !user.customRoleId && (inv.customRoleCount || 0) < 1,
        includeShopBanner: hasFile
      });
      await interaction.update({
        files: attachment ? [attachment] : [],
        components: panel.components,
        flags: panel.flags,
        embeds: panel.embeds ?? []
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("shop_")) {
      if (isEconomyPaused()) {
        await interaction.reply({
          content: "⏸️ L'economie est en pause. Boutique temporairement indisponible.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (interaction.customId === "shop_refresh") {
        await interaction.reply({ content: "Selection mise a jour. Rechoisis une categorie.", flags: MessageFlags.Ephemeral });
        return;
      }
      const selected = client.shopSessions.get(interaction.user.id);
      if (!selected) {
        await interaction.reply({ content: "Selectionne d'abord une categorie dans le menu.", flags: MessageFlags.Ephemeral });
        return;
      }
      await purchaseItem(client, interaction, selected);
      return;
    }

    if (interaction.isButton() && (interaction.customId === "inv_refresh" || interaction.customId === "inv_use_coffee")) {
      if (interaction.customId === "inv_refresh") {
        const snapshot = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
        const panel = buildInventoryPanel(interaction, snapshot);
        await interaction.update(panel);
        return;
      }

      const result = await useCoffeeItem(client.prisma, interaction.guildId, interaction.user.id);
      if (!result.ok) {
        if (result.error === "cooldown") {
          await interaction.reply({
            content: `Heho, calma sur le cafe. Tu veux une surcharge ? Sinon tu ne vas pas dormir ce soir.\nAttends encore **${formatDuration(result.remainingMs)}** avant d'en reutiliser un.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
        return;
      }

      const snapshot = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
      const panel = buildInventoryPanel(interaction, snapshot);
      await interaction.update(panel);
      await interaction.followUp({
        content: `Cafe utilise: **+${result.boost}%** pendant **${result.minutes} minutes**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === "inv_use_custom_role") {
      const dbUser = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
      const snapshot = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
      if (dbUser.customRoleId) {
        await interaction.reply({ content: "Tu as deja cree ton role perso (limite: 1).", flags: MessageFlags.Ephemeral });
        return;
      }
      if (snapshot.customRoleCount < 1) {
        await interaction.reply({ content: "Tu n'as pas d'item Role Perso dans ton inventaire.", flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder().setCustomId("role_perso_create_modal_inv").setTitle("Creation du role perso");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("role_name")
            .setLabel("Nom du role")
            .setPlaceholder("Ex: Carmina Legend")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hex_color")
            .setLabel("Couleur HEX principale")
            .setPlaceholder("#FF55AA")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("gradient_enabled")
            .setLabel("Degrade ? (oui/non)")
            .setPlaceholder("oui")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("hex_color_2")
            .setLabel("2e couleur HEX (si degrade)")
            .setPlaceholder("#55CCFF")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("emoji_or_image")
            .setLabel("Emoji unicode ou URL image role icon")
            .setPlaceholder("🔥 ou https://...")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === "modlog_delete") {
      const modal = new ModalBuilder().setCustomId("modlog_delete_modal").setTitle("Supprimer une sanction");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("punishment_id").setLabel("ID de la sanction").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === "modlog_edit") {
      const modal = new ModalBuilder().setCustomId("modlog_edit_modal").setTitle("Modifier une sanction");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("punishment_id").setLabel("ID de la sanction").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("new_reason").setLabel("Nouvelle raison").setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "modlog_delete_modal") {
      const id = Number(interaction.fields.getTextInputValue("punishment_id"));
      await client.prisma.punishment.delete({ where: { id } }).catch(() => null);
      await interaction.reply({ content: `Sanction #${id} supprimee (si existante).`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "birthday_set_modal") {
      const raw = interaction.fields.getTextInputValue("birthday_input");
      const parsed = parseBirthdayInput(raw);
      if (!parsed.ok) {
        await interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });
        return;
      }

      await upsertBirthday(
        client.prisma,
        interaction.guildId,
        interaction.user.id,
        parsed.day,
        parsed.month,
        parsed.year
      );

      const rows = await listBirthdays(client.prisma, interaction.guildId);
      const upcoming = getUpcomingBirthdays(rows);
      const panel = await buildBirthdayListPanel(upcoming, interaction.guild);

      const base = parsed.year
        ? `🎂 Date enregistree: **${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}**`
        : `🎂 Date enregistree: **${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}**`;

      await interaction.reply({
        content: `${base}\n🎉 Le classement des prochains anniversaires a ete mis a jour :`,
        flags: MessageFlags.Ephemeral
      });
      await interaction.followUp(panel);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("vote:create:")) {
      if (!canUseVote(interaction.member)) {
        await interaction.reply({
          content: "Seuls les membres staff autorises peuvent creer et utiliser les votes.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const channelId = interaction.customId.split(":")[2];

      const question = interaction.fields.getTextInputValue("vote_question").trim();
      const optionsRaw = interaction.fields.getTextInputValue("vote_options");
      const options = optionsRaw
        .split(/\r?\n+/)
        .map((opt) => opt.trim())
        .filter(Boolean)
        .slice(0, 8);

      if (options.length < 2) {
        await interaction.reply({
          content: "Il faut au moins 2 options non vides (une par ligne).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const unique = new Set(options.map((opt) => opt.toLowerCase()));
      if (unique.size !== options.length) {
        await interaction.reply({
          content: "Chaque option doit etre differente.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!targetChannel?.isTextBased?.()) {
        await interaction.editReply({ content: "Salon introuvable pour ce vote." });
        return;
      }

      const me = interaction.guild.members.me;
      const perms = targetChannel.permissionsFor(me);
      const hasNeededPerms =
        perms?.has(PermissionFlagsBits.ViewChannel) &&
        perms?.has(PermissionFlagsBits.SendMessages) &&
        perms?.has(PermissionFlagsBits.ReadMessageHistory);
      if (!hasNeededPerms) {
        await interaction.editReply({
          content: "Je n'ai pas les permissions requises dans ce salon."
        });
        return;
      }

      if (!client.votes) client.votes = new Map();
      const voteId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const voteState = {
        voteId,
        messageId: null,
        question,
        options,
        authorId: interaction.user.id,
        open: true,
        votes: new Map()
      };

      const message = await targetChannel.send(buildVotePanel(voteState));
      voteState.messageId = message.id;
      client.votes.set(voteId, voteState);

      await interaction.editReply({
        content: `Vote cree dans ${targetChannel} : ${message.url}`
      });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "modlog_edit_modal") {
      const id = Number(interaction.fields.getTextInputValue("punishment_id"));
      const reason = interaction.fields.getTextInputValue("new_reason");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await client.prisma.punishment.update({ where: { id }, data: { reason } }).catch(() => null);
      await interaction.editReply({ content: `Sanction #${id} modifiee (si existante).` });
      return;
    }

    if (
      interaction.isModalSubmit() &&
      (interaction.customId === "role_perso_create_modal" || interaction.customId === "role_perso_create_modal_inv")
    ) {
      const fromInventory = interaction.customId === "role_perso_create_modal_inv";
      const roleName = interaction.fields.getTextInputValue("role_name").trim();
      const hex = normalizeHex(interaction.fields.getTextInputValue("hex_color"));
      const gradientEnabled = interaction.fields.getTextInputValue("gradient_enabled").trim().toLowerCase();
      const hex2Raw = interaction.fields.getTextInputValue("hex_color_2").trim();
      const emojiOrImage = interaction.fields.getTextInputValue("emoji_or_image").trim();

      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ content: "Le bot doit avoir la permission Gerer les roles.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const dbUser = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
      if (!dbUser.customRoleUnlocked && !fromInventory) {
        await interaction.editReply({ content: "Tu dois d'abord acheter l'item Role Perso dans /boutique." });
        return;
      }
      if (dbUser.customRoleId) {
        await interaction.editReply({ content: "Tu as deja cree ton role perso (limite: 1)." });
        return;
      }
      if (!hex) {
        await interaction.editReply({ content: "Couleur HEX invalide. Exemple: #FF55AA" });
        return;
      }

      let colorHex = hex;
      if (gradientEnabled === "oui") {
        const hex2 = normalizeHex(hex2Raw);
        if (!hex2) {
          await interaction.editReply({ content: "Tu as active le degrade mais la 2e couleur HEX est invalide." });
          return;
        }
        colorHex = averageHex(hex, hex2);
      }

      const rolePayload = {
        name: roleName.slice(0, 100),
        color: parseInt(colorHex.slice(1), 16),
        mentionable: true,
        reason: `Role perso de ${interaction.user.tag}`
      };

      if (emojiOrImage) {
        if (isValidHttpUrl(emojiOrImage)) rolePayload.icon = emojiOrImage;
        else rolePayload.unicodeEmoji = emojiOrImage;
      }

      const role = await interaction.guild.roles.create(rolePayload).catch(async () => {
        // Fallback if guild doesn't support role icon/emoji or invalid media.
        return interaction.guild.roles.create({
          name: rolePayload.name,
          color: rolePayload.color,
          mentionable: true,
          reason: rolePayload.reason
        });
      });

      await interaction.member.roles.add(role.id).catch(() => null);
      if (fromInventory) {
        const consumed = await consumeCustomRoleItem(client.prisma, interaction.guildId, interaction.user.id);
        if (!consumed.ok) {
          await interaction.editReply({ content: consumed.error });
          return;
        }
      }
      await client.prisma.user.update({
        where: { userId: interaction.user.id },
        data: { customRoleId: role.id, customRoleUnlocked: true }
      });

      await interaction.editReply({
        content: `Role perso cree: ${role}. Utilise maintenant les parametres que tu as choisis.`
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("lb:")) {
      const parts = interaction.customId.split(":");
      let metric;
      let page;

      if (parts[1] === "prev" || parts[1] === "next") {
        metric = parts[2];
        const current = Number(parts[3]);
        page = parts[1] === "prev" ? Math.max(0, current - 1) : current + 1;
      } else {
        metric = parts[1];
        page = Number(parts[2]);
      }

      const users = await client.prisma.user.findMany({
        where: { guildId: interaction.guildId },
        orderBy: metric === "sc" ? { simbaCoins: "desc" } : metric === "sp" ? { simbaPoints: "desc" } : { levelPoints: "desc" },
        take: 10,
        skip: page * 10
      });
      const guild = interaction.guild;
      await Promise.all(
        users.map((u) => (guild.members.cache.has(u.userId) ? Promise.resolve() : guild.members.fetch(u.userId).catch(() => null)))
      );
      if (!guild.members.cache.has(interaction.user.id)) {
        await guild.members.fetch(interaction.user.id).catch(() => null);
      }
      const placement = await getGuildLeaderboardRank(client.prisma, interaction.guildId, interaction.user.id, metric);
      const viewerFooter = placement
        ? formatLeaderboardViewerPlacement(guild, metric, placement.rank, interaction.user.id, placement.value)
        : "Tu n'as pas encore de statistiques enregistrées sur ce serveur.";
      const panel = buildLeaderboardPanel(metric, page, users, guild, viewerFooter);
      await safeInteractionComponentUpdate(interaction, {
        components: panel.components,
        flags: panel.flags,
        embeds: panel.embeds,
        allowedMentions: panel.allowedMentions
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("modprof:")) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({
          content: "Reserve aux membres avec la permission `Moderer les membres`.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const [, rawFilter, moderatorId] = interaction.customId.split(":");
      const filter = (rawFilter || "ALL").toUpperCase();
      const moderator =
        interaction.guild.members.cache.get(moderatorId)?.user ||
        (await client.users.fetch(moderatorId).catch(() => null)) || { id: moderatorId, tag: moderatorId };
      const view = await getModeratorProfileView(client.prisma, interaction.guildId, moderatorId, filter);
      const panel = buildModeratorProfilePanel(moderator, view);
      await safeInteractionComponentUpdate(interaction, {
        components: panel.components,
        flags: panel.flags,
        embeds: panel.embeds
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("vote:")) {
      if (!canUseVote(interaction.member)) {
        await interaction.reply({
          content: "Seuls les membres staff autorises peuvent voter.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const parts = interaction.customId.split(":");
      const action = parts[1];
      const voteId = parts[2];
      const vote = client.votes?.get(voteId);

      if (!vote) {
        await interaction.reply({ content: "Ce vote n'est plus disponible.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === "pick") {
        if (!vote.open) {
          await interaction.reply({ content: "Ce vote est termine.", flags: MessageFlags.Ephemeral });
          return;
        }
        const index = Number(parts[3]);
        if (!Number.isInteger(index) || index < 0 || index >= vote.options.length) {
          await interaction.reply({ content: "Option de vote invalide.", flags: MessageFlags.Ephemeral });
          return;
        }
        vote.votes.set(interaction.user.id, index);
        await interaction.update(buildVotePanel(vote));
        return;
      }

      if (action === "end") {
        const isAuthor = interaction.user.id === vote.authorId;
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (!isAuthor && !isAdmin) {
          await interaction.reply({ content: "Seul l'auteur du vote (ou un admin) peut le fermer.", flags: MessageFlags.Ephemeral });
          return;
        }
        vote.open = false;
        await interaction.update(buildVotePanel(vote));
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("transfer:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const transferId = parts[2];
      const request = client.transferRequests?.get(transferId);
      if (!request) {
        await interaction.reply({ content: "Cette demande de transfert est introuvable.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (request.status !== "PENDING") {
        await interaction.reply({ content: "Cette demande n'est plus active.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (Date.now() > request.expiresAt) {
        request.status = "EXPIRED";
        await interaction.update(buildTransferResultMessage(request, "EXPIRED"));
        return;
      }
      if (interaction.user.id !== request.toUserId) {
        await interaction.reply({ content: "Seul le destinataire peut repondre a cette demande.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === "decline") {
        request.status = "DECLINED";
        await interaction.update(buildTransferResultMessage(request, "DECLINED"));
        return;
      }

      if (action === "accept") {
        const result = await executeTransfer(client, request);
        if (!result.ok) {
          request.status = "FAILED";
          await interaction.update(buildTransferResultMessage(request, "FAILED", result.error));
          return;
        }
        request.status = "ACCEPTED";
        await interaction.update(buildTransferResultMessage(request, "ACCEPTED"));
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("ttt:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const game = client.ticTacToeGames?.get(messageId);
      if (!game) {
        await interaction.reply({ content: "Cette partie n'existe plus.", flags: MessageFlags.Ephemeral });
        return;
      }

      const isPlayer = interaction.user.id === game.playerX || interaction.user.id === game.playerO;
      if (!isPlayer) {
        await interaction.reply({ content: "Tu ne fais pas partie de cette partie.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === "surrender") {
        if (!game.open) {
          await interaction.reply({ content: "Cette partie est deja terminee.", flags: MessageFlags.Ephemeral });
          return;
        }
        game.open = false;
        game.winner = interaction.user.id === game.playerX ? "O" : "X";
        await interaction.update(buildTicTacToePanel(game));
        return;
      }

      if (action === "play") {
        if (!game.open) {
          await interaction.reply({ content: "Cette partie est terminee.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.user.id !== game.turnPlayerId) {
          await interaction.reply({ content: "Ce n'est pas ton tour.", flags: MessageFlags.Ephemeral });
          return;
        }
        const index = Number(parts[3]);
        if (!Number.isInteger(index) || index < 0 || index > 8 || game.board[index]) {
          await interaction.reply({ content: "Case invalide.", flags: MessageFlags.Ephemeral });
          return;
        }

        game.board[index] = game.turn;
        const winner = getTicTacToeWinner(game.board);
        if (winner) {
          game.winner = winner;
          game.open = false;
        } else if (game.board.every(Boolean)) {
          game.winner = "draw";
          game.open = false;
        } else {
          game.turn = game.turn === "X" ? "O" : "X";
          game.turnPlayerId = game.turn === "X" ? game.playerX : game.playerO;
        }

        await interaction.update(buildTicTacToePanel(game));
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("c4:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const messageId = parts[2];
      const game = client.connect4Games?.get(messageId);
      if (!game) {
        await interaction.reply({ content: "Cette partie n'existe plus.", flags: MessageFlags.Ephemeral });
        return;
      }

      const isPlayer = interaction.user.id === game.playerRed || interaction.user.id === game.playerYellow;
      if (!isPlayer) {
        await interaction.reply({ content: "Tu ne fais pas partie de cette partie.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === "surrender") {
        if (!game.open) {
          await interaction.reply({ content: "Cette partie est deja terminee.", flags: MessageFlags.Ephemeral });
          return;
        }
        game.open = false;
        game.winner = interaction.user.id === game.playerRed ? "Y" : "R";
        await interaction.update(buildConnect4Panel(game));
        return;
      }

      if (action === "drop") {
        if (!game.open) {
          await interaction.reply({ content: "Cette partie est terminee.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.user.id !== game.turnPlayerId) {
          await interaction.reply({ content: "Ce n'est pas ton tour.", flags: MessageFlags.Ephemeral });
          return;
        }
        const col = Number(parts[3]);
        if (!Number.isInteger(col) || col < 0 || col > 6) {
          await interaction.reply({ content: "Colonne invalide.", flags: MessageFlags.Ephemeral });
          return;
        }

        const row = findConnect4DropRow(game.board, col);
        if (row === -1) {
          await interaction.reply({ content: "Cette colonne est pleine.", flags: MessageFlags.Ephemeral });
          return;
        }

        game.board[row][col] = game.turn;
        if (hasConnect4Winner(game.board, row, col, game.turn)) {
          game.winner = game.turn;
          game.open = false;
        } else if (isConnect4BoardFull(game.board)) {
          game.winner = "draw";
          game.open = false;
        } else {
          game.turn = game.turn === "R" ? "Y" : "R";
          game.turnPlayerId = game.turn === "R" ? game.playerRed : game.playerYellow;
        }

        await interaction.update(buildConnect4Panel(game));
      }
    }
  }
};

async function executeTransfer(client, request) {
  try {
    await client.prisma.$transaction(async (tx) => {
      const sender = await ensureUser(tx, request.guildId, request.fromUserId);
      if (Number(sender.simbaCoins) < request.amount) {
        throw new Error("Le solde de l'expediteur n'est plus suffisant.");
      }
      await ensureUser(tx, request.guildId, request.toUserId);
      await tx.user.update({
        where: { userId: request.fromUserId },
        data: { simbaCoins: { decrement: request.amount } }
      });
      await tx.user.update({
        where: { userId: request.toUserId },
        data: { simbaCoins: { increment: request.amount } }
      });
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || "Erreur transfert." };
  }
}

function buildTransferResultMessage(request, status, reason) {
  const base = [
    `Expediteur: <@${request.fromUserId}>`,
    `Destinataire: <@${request.toUserId}>`,
    `Montant: **${formatSC(request.amount)} SC**`
  ];

  let title = "Transfert";
  let color = 0x181627;
  let extra = "";
  if (status === "ACCEPTED") {
    title = "Transfert accepte";
    color = 0x3ba55d;
    extra = "✅ Le transfert a ete effectue.";
  } else if (status === "DECLINED") {
    title = "Transfert refuse";
    color = 0xed4245;
    extra = "❌ Le destinataire a refuse.";
  } else if (status === "EXPIRED") {
    title = "Transfert expire";
    color = 0xfee75c;
    extra = "⏱️ Le delai de 60 secondes est depasse.";
  } else {
    title = "Transfert echoue";
    color = 0xed4245;
    extra = `⚠️ ${reason || "Operation impossible."}`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription([...base, "", extra].join("\n"))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("transfer_done_accept").setLabel("Accepter").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("transfer_done_decline").setLabel("Refuser").setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  return { embeds: [embed], components: [row] };
}

function getTicTacToeWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

function findConnect4DropRow(board, col) {
  for (let row = 5; row >= 0; row -= 1) {
    if (!board[row][col]) return row;
  }
  return -1;
}

function hasConnect4Winner(board, row, col, token) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (const [dr, dc] of directions) {
    let count = 1;
    count += countDirection(board, row, col, token, dr, dc);
    count += countDirection(board, row, col, token, -dr, -dc);
    if (count >= 4) return true;
  }
  return false;
}

function countDirection(board, row, col, token, dr, dc) {
  let r = row + dr;
  let c = col + dc;
  let count = 0;
  while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === token) {
    count += 1;
    r += dr;
    c += dc;
  }
  return count;
}

function isConnect4BoardFull(board) {
  return board[0].every(Boolean);
}

async function purchaseItem(client, interaction, item) {
  const user = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
  let price = config.shop.coffeePrice;
  if (item === "crown") price = config.shop.crownPrice;
  if (item === "piggy") price = config.shop.piggyPrice;
  if (item === "custom_role") price = config.shop.customRolePrice;

  if (user.simbaCoins < price) {
    await interaction.reply({ content: "Solde insuffisant.", flags: MessageFlags.Ephemeral });
    return;
  }

  const data = { simbaCoins: { decrement: price } };
  let msg = "Achat valide.";
  if (item === "crown") {
    data.crownOwned = true;
    msg = "Couronne achetee: boost permanent LP/SP +15%.";
  } else if (item === "piggy") {
    data.piggyOwned = true;
    msg = `Tirelire achetee: boost permanent SC +${config.shop.piggyBoostPct}%.`;
  } else if (item === "custom_role") {
    const inv = await getInventorySnapshot(client.prisma, interaction.guildId, interaction.user.id);
    if (user.customRoleUnlocked || user.customRoleId || (inv.customRoleCount || 0) > 0) {
      await interaction.reply({ content: "Role perso limite a 1 par personne (deja debloque / en inventaire / cree).", flags: MessageFlags.Ephemeral });
      return;
    }
    msg = "Item Role Perso achete: ajoute dans ton inventaire. Utilise `/inventaire` puis **Utiliser role perso**.";
  } else {
    msg = "Cafe achete: ajoute dans ton inventaire. Utilise `/inventaire` puis le bouton **Utiliser le cafe**.";
  }

  const updated = await client.prisma.user.update({ where: { userId: interaction.user.id }, data });
  if (item === "coffee") {
    const nextCount = await addCoffeeItem(client.prisma, interaction.guildId, interaction.user.id, 1);
    msg += ` (Quantite cafe: **${nextCount}**)`;
  } else if (item === "custom_role") {
    const nextCount = await addCustomRoleItem(client.prisma, interaction.guildId, interaction.user.id, 1);
    msg += ` (Quantite Role Perso: **${nextCount}**)`;
  }
  if ((item === "crown" || item === "piggy" || item === "custom_role") && process.env.ECONOMY_LOG_CHANNEL_ID) {
    const log = await interaction.guild.channels.fetch(process.env.ECONOMY_LOG_CHANNEL_ID).catch(() => null);
    if (log?.isTextBased()) {
      await log.send(`Achat premium: ${interaction.user.tag} -> ${item} (${formatSC(price)} SC). Nouveau solde: ${formatSC(updated.simbaCoins)} SC`);
    }
  }
  await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
}

function normalizeHex(input) {
  const value = input.trim();
  const clean = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9A-Fa-f]{6}$/.test(clean) ? clean.toUpperCase() : null;
}

function averageHex(a, b) {
  const aInt = parseInt(a.slice(1), 16);
  const bInt = parseInt(b.slice(1), 16);
  const ar = (aInt >> 16) & 255;
  const ag = (aInt >> 8) & 255;
  const ab = aInt & 255;
  const br = (bInt >> 16) & 255;
  const bg = (bInt >> 8) & 255;
  const bb = bInt & 255;
  const rr = Math.floor((ar + br) / 2);
  const rg = Math.floor((ag + bg) / 2);
  const rb = Math.floor((ab + bb) / 2);
  return `#${[rr, rg, rb].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
