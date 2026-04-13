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
 */
async function completeWelcomeVerification(guild, userId) {
  const v = config.welcomeVerify;
  if (!v?.enabled) return;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;

  let member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  if (!member || member.pending) return;

  const ids = getWelcomeUnverifiedRoleIdsToStrip();
  const removeUnverifiedFrom = async (m) => {
    for (const roleId of ids) {
      if (!m.roles.cache.has(roleId)) continue;
      // eslint-disable-next-line no-await-in-loop
      await m.roles.remove(roleId).catch((e) => {
        console.warn("[welcomeVerify] complete remove", roleId, e?.message || e);
      });
    }
  };

  await removeUnverifiedFrom(member);

  if (v.roleVerifiedId && !member.roles.cache.has(v.roleVerifiedId)) {
    await member.roles.add(v.roleVerifiedId).catch((e) => {
      console.warn("[welcomeVerify] add verified failed", e?.message || e);
    });
  }

  member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  if (member) await removeUnverifiedFrom(member);

  await syncWelcomeVerifyCategoryAccess(guild);
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
  assignUnverifiedRole,
  postRulesForMember
};
