const {
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
  SeparatorSpacingSize,
  ButtonStyle,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { ACCENT_COLOR } = require("../utils/componentsV2Panels");

/** Bouton : retire « nouveau membre », ajoute « utilisateur vérifié » (IDs dans config.welcomeVerify). */
const VERIFICATION_BUTTON_CUSTOM_ID = "verification_salon_confirm";

/** Serveur definitif : mentions dans le panneau verification (surchargable via config / channelSetup). */
const DEFAULT_REGLEMENT_CHANNEL_ID = "1428410217170866177";
const DEFAULT_REPERTOIRE_CHANNEL_ID = "1428411223531196446";
const DEFAULT_INFO_CHANNEL_ID = "1428411204757618718";
const VERIFICATION_BANNER_NAME = "verification-banner.png";
const VERIFICATION_BANNER_CANDIDATES = [
  path.join(process.cwd(), "assets", "verification-banner.png"),
  "C:\\Users\\koyor\\.cursor\\projects\\c-Users-koyor-OneDrive-Documents-Desktop-GM-CARMINABOT\\assets\\c__Users_koyor_AppData_Roaming_Cursor_User_workspaceStorage_807d0a7989207b892549e0e965b63191_images_image-0ee7675d-4805-4fde-b2e4-1f8c380ce85e.png"
];

const COMPONENTS_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds;

function resolveVerificationBanner() {
  const filePath = VERIFICATION_BANNER_CANDIDATES.find((p) => fs.existsSync(p));
  if (!filePath) return null;
  const buffer = fs.readFileSync(filePath);
  return new AttachmentBuilder(buffer, { name: VERIFICATION_BANNER_NAME });
}

/**
 * Panneau 100 % Components V2 (flag IS_COMPONENTS_V2, pas d’embeds).
 * @param {{ pingUserId?: string }} [opts]
 */
function buildSalonVerificationMessage(opts = {}) {
  const v = config.welcomeVerify;
  const regId = v?.reglementChannelId || DEFAULT_REGLEMENT_CHANNEL_ID;
  const repId = v?.repertoireChannelId || DEFAULT_REPERTOIRE_CHANNEL_ID;
  const infoId = v?.informationChannelId || DEFAULT_INFO_CHANNEL_ID;

  const head = opts.pingUserId ? `<@${opts.pingUserId}>\n\n` : "";
  const banner = resolveVerificationBanner();

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${head}## Vérification pour les nouveaux membres`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Pour avoir accès au reste du serveur, il est nécessaire d\'appuyer sur le bouton ci-dessous et prendre ceci en considération :'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `Le règlement du serveur <#${regId}>`,
          "",
          `Les rôles présents sur le serveur et leur utilité <#${repId}>`,
          "",
          'S\'assurer de cocher la case "Montrer tous les salons" pour avoir accès à tous les salons présents sur le serveur',
          `<#${infoId}>`,
          "",
          "Avoir rempli la condition nécessaire (numéro de téléphone vérifié) pour pouvoir rejoindre le serveur",
          `<#${infoId}>`
        ].join("\n")
      )
    );

  if (banner) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(`attachment://${VERIFICATION_BANNER_NAME}`)
        )
      );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(VERIFICATION_BUTTON_CUSTOM_ID)
        .setLabel("Accéder au serveur")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
    )
  );

  return {
    files: banner ? [banner] : [],
    components: [container],
    flags: COMPONENTS_V2_FLAGS,
    embeds: []
  };
}

async function syncWelcomeVerifyCategoryAccess(guild) {
  const v = config.welcomeVerify;
  if (!v?.enabled) return;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return;

  const rU = v.roleUnverifiedId;
  const rV = v.roleVerifiedId;
  if (!rU || !rV) return;
  if (!v.testCategoryId && !v.mainCategoryId) return;

  const testCat = await guild.channels.fetch(v.testCategoryId).catch(() => null);
  const mainCat = await guild.channels.fetch(v.mainCategoryId).catch(() => null);

  if (testCat?.type === ChannelType.GuildCategory) {
    await testCat.permissionOverwrites
      .edit(rU, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true })
      .catch(() => null);
    await testCat.permissionOverwrites.edit(rV, { ViewChannel: false }).catch(() => null);
  }

  if (mainCat?.type === ChannelType.GuildCategory) {
    await mainCat.permissionOverwrites.edit(rU, { ViewChannel: false }).catch(() => null);
    await mainCat.permissionOverwrites
      .edit(rV, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true })
      .catch(() => null);
  }
}

/** Anciens IDs « nouveau / non vérifié » à retirer même si la config pointe ailleurs. */
const LEGACY_UNVERIFIED_ROLE_IDS = ["1486095572501926099"];

/**
 * @param {import("discord.js").Guild} guild
 * @param {string} roleId
 */
function botCanManageRole(guild, roleId) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return { ok: false, reason: "no_manage_roles" };
  const role = guild.roles.cache.get(roleId) || null;
  if (!role) return { ok: false, reason: "role_missing", roleId };
  if (role.managed) return { ok: false, reason: "role_managed", roleId };
  if (me.roles.highest.position <= role.position) {
    return { ok: false, reason: "hierarchy", roleId, roleName: role.name };
  }
  return { ok: true, role };
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {string[]} roleIds
 * @returns {string|null} message d'erreur lisible
 */
function describeRoleManageBlock(guild, roleIds) {
  for (const roleId of roleIds) {
    const check = botCanManageRole(guild, roleId);
    if (!check.ok) {
      if (check.reason === "no_manage_roles") {
        return "SimBot n'a pas la permission **Gérer les rôles** sur ce serveur.";
      }
      if (check.reason === "role_missing") {
        return `Rôle introuvable (\`${roleId}\`) — vérifie la config \`welcomeVerify\`.`;
      }
      if (check.reason === "role_managed") {
        return `Le rôle \`${roleId}\` est géré par une intégration (non modifiable).`;
      }
      if (check.reason === "hierarchy") {
        return (
          `SimBot ne peut pas toucher au rôle **${check.roleName}** : place le rôle du bot **au-dessus** ` +
          `de « ${check.roleName} » et des rôles nouveau / vérifié dans les paramètres du serveur.`
        );
      }
    }
  }
  return null;
}

/**
 * Liste des rôles à retirer à la validation (config + legacy + env WELCOME_EXTRA_UNVERIFIED_ROLE_IDS).
 * @returns {string[]}
 */
function getWelcomeUnverifiedRoleIdsToStrip() {
  const v = config.welcomeVerify;
  const main = v?.roleUnverifiedId ? [v.roleUnverifiedId] : [];
  const fromEnv = String(process.env.WELCOME_EXTRA_UNVERIFIED_ROLE_IDS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((id) => /^\d{17,22}$/.test(id));
  return [...new Set([...main, ...LEGACY_UNVERIFIED_ROLE_IDS, ...fromEnv])];
}

/**
 * Retire les rôles non vérifiés (rafraîchit le membre pour limiter les faux négatifs du cache).
 * @param {import("discord.js").Guild} guild
 * @param {string} userId
 * @param {{ passes?: number }} [opts]
 */
async function stripWelcomeUnverifiedRoles(guild, userId, opts = {}) {
  const passes = opts.passes ?? 2;
  const ids = getWelcomeUnverifiedRoleIdsToStrip();
  if (!ids.length || passes < 1) return;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;

  for (let p = 0; p < passes; p++) {
    const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
    if (!member) return;
    for (const roleId of ids) {
      if (!member.roles.cache.has(roleId)) continue;
      // eslint-disable-next-line no-await-in-loop
      await member.roles.remove(roleId).catch((e) => {
        console.warn("[welcomeVerify] strip remove failed", roleId, e?.message || e);
      });
    }
  }
}

/**
 * Flux bouton validation : retire toujours les rôles « nouveau », ajoute le vérifié si besoin, 2e passe strip.
 * @param {import("discord.js").Guild} guild
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, alreadyVerified?: boolean, error?: string, removed?: string[], added?: string|null }>}
 */
async function completeWelcomeVerification(guild, userId) {
  const v = config.welcomeVerify;
  if (!v?.enabled) {
    return { ok: false, error: "Le système de vérification est désactivé dans la config du bot." };
  }

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, error: "SimBot n'a pas la permission **Gérer les rôles**." };
  }

  let member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  if (!member) {
    return { ok: false, error: "Membre introuvable sur ce serveur." };
  }
  if (member.pending) {
    return {
      ok: false,
      error:
        "Ton compte est encore en **attente de validation Discord** (règles du serveur / téléphone). " +
        "Termine d'abord l'écran de bienvenue Discord, puis réessaie."
    };
  }

  const ids = getWelcomeUnverifiedRoleIdsToStrip();
  const rolesToCheck = [...ids];
  if (v.roleVerifiedId) rolesToCheck.push(v.roleVerifiedId);
  const blockMsg = describeRoleManageBlock(guild, rolesToCheck);
  if (blockMsg) {
    return { ok: false, error: blockMsg };
  }

  const alreadyVerified = v.roleVerifiedId && member.roles.cache.has(v.roleVerifiedId);
  const removed = [];

  const removeUnverifiedFrom = async (m) => {
    for (const roleId of ids) {
      if (!m.roles.cache.has(roleId)) continue;
      // eslint-disable-next-line no-await-in-loop
      const ok = await m.roles.remove(roleId).then(() => true).catch(() => false);
      if (ok) removed.push(roleId);
    }
  };

  await removeUnverifiedFrom(member);

  let added = null;
  if (v.roleVerifiedId && !member.roles.cache.has(v.roleVerifiedId)) {
    const ok = await member.roles.add(v.roleVerifiedId).then(() => true).catch(() => false);
    if (ok) added = v.roleVerifiedId;
    else {
      return {
        ok: false,
        error: describeRoleManageBlock(guild, [v.roleVerifiedId]) || "Impossible d'ajouter le rôle membre vérifié."
      };
    }
  }

  member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  if (member) await removeUnverifiedFrom(member);

  await syncWelcomeVerifyCategoryAccess(guild);

  member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  const stillUnverified = ids.some((id) => member?.roles.cache.has(id));
  const hasVerified = v.roleVerifiedId && member?.roles.cache.has(v.roleVerifiedId);

  if (stillUnverified || (v.roleVerifiedId && !hasVerified)) {
    return {
      ok: false,
      error:
        describeRoleManageBlock(guild, rolesToCheck) ||
        "Les rôles n'ont pas pu être mis à jour. Vérifie la hiérarchie des rôles du bot.",
      removed,
      added
    };
  }

  return { ok: true, alreadyVerified: Boolean(alreadyVerified && !added), removed, added };
}

/**
 * Bouton « Accéder au serveur » — ack immédiat + retour utilisateur.
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleWelcomeVerifyButtonInteraction(interaction) {
  const v = config.welcomeVerify;
  if (!v?.enabled) return false;

  const isVerifyButton =
    interaction.customId === VERIFICATION_BUTTON_CUSTOM_ID || interaction.customId === "welcome_phone_verify";
  if (!isVerifyButton) return false;

  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) {
    await interaction
      .reply({ content: "Action impossible hors serveur.", flags: MessageFlags.Ephemeral })
      .catch(() => null);
    return true;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  try {
    const result = await completeWelcomeVerification(guild, interaction.user.id);

    if (result.ok) {
      if (result.alreadyVerified) {
        await interaction
          .editReply({
            content: "Tu es **déjà vérifié** — tu devrais voir le reste du serveur. Pense à **Montrer tous les salons**."
          })
          .catch(() => null);
      } else {
        await interaction
          .editReply({
            content:
              "✅ **Accès débloqué.** Bienvenue sur le serveur — consulte le règlement et le répertoire si ce n'est pas déjà fait."
          })
          .catch(() => null);
      }
      return true;
    }

    await interaction
      .editReply({
        content: `❌ ${result.error || "Impossible de terminer la vérification."}`
      })
      .catch(() => null);
  } catch (e) {
    console.warn("[welcomeVerify] interaction", e?.message || e);
    await interaction
      .editReply({ content: "Erreur interne pendant la vérification. Réessaie ou ouvre un ticket accueil." })
      .catch(() => null);
  }
  return true;
}

async function assignUnverifiedRole(member) {
  const v = config.welcomeVerify;
  if (!v?.enabled || !v.roleUnverifiedId) return;
  await member.roles.add(v.roleUnverifiedId).catch(() => null);
}

async function postRulesForMember(member) {
  const v = config.welcomeVerify;
  if (!v?.enabled || !v.rulesChannelId) return null;

  const ch = await member.guild.channels.fetch(v.rulesChannelId).catch(() => null);
  if (!ch?.isTextBased?.()) return null;

  const payload = buildSalonVerificationMessage({
    pingUserId: member.id,
    guildId: member.guild.id
  });
  return ch.send({
    ...payload,
    allowedMentions: { parse: [], users: [member.id] }
  });
}

module.exports = {
  VERIFICATION_BUTTON_CUSTOM_ID,
  buildSalonVerificationMessage,
  syncWelcomeVerifyCategoryAccess,
  getWelcomeUnverifiedRoleIdsToStrip,
  stripWelcomeUnverifiedRoles,
  completeWelcomeVerification,
  handleWelcomeVerifyButtonInteraction,
  assignUnverifiedRole,
  postRulesForMember
};
