const { AttachmentBuilder } = require("discord.js");
const config = require("../config");
const { buildLevelUpCard, buildRankUpCard } = require("./progressCards");
const { buildStyledRankName } = require("./rankRoleService");
const { logApiError } = require("../utils/botLogger");

/** Salon par défaut des annonces niveau / rang (La Carminauté). Surcharge : `ECONOMY_MILESTONE_CHANNEL_ID`. */
const DEFAULT_MILESTONE_CHANNEL_ID = "1488214951867842652";

function getTierByKey(key) {
  return config.rankSystem.thresholds.find((t) => t.key === key);
}

/**
 * Uniquement le salon dédié (`ECONOMY_MILESTONE_CHANNEL_ID` ou défaut La Carminauté).
 * Aucun autre salon : si introuvable ou pas texte, retourne `null`.
 * @param {import("discord.js").Guild} guild
 */
async function resolveMilestoneChannel(guild) {
  const id = String(process.env.ECONOMY_MILESTONE_CHANNEL_ID || DEFAULT_MILESTONE_CHANNEL_ID).trim();
  if (!id) return null;
  const ch = await guild.channels.fetch(id).catch(() => null);
  if (ch && "send" in ch && ch.isTextBased()) return ch;
  return null;
}

/**
 * @param {import("discord.js").Client} client
 * @param {object} opts
 */
async function announceLevelUp(client, { guild, member, userRow, prevLevel }) {
  const ch = await resolveMilestoneChannel(guild);
  if (!ch) return;
  try {
    const buf = await buildLevelUpCard(member, userRow);
    const file = new AttachmentBuilder(buf, { name: `niveau-${member.id}.png` });
    const lvl = Number(userRow.level) || 1;
    const prev = Number(prevLevel);
    const bridge =
      Number.isFinite(prev) && prev < lvl ? ` Tu es passé du niveau **${prev}** au **niveau ${lvl}** !` : ` Tu atteins le **niveau ${lvl}** !`;
    await ch.send({
      content: `🎉 <@${member.id}> **Félicitations !**${bridge}`,
      files: [file],
      allowedMentions: { users: [member.id] }
    });
  } catch (e) {
    logApiError("LEVEL_UP_ANNOUNCE", e, { maxDetailChars: 400 });
  }
}

/**
 * @param {import("discord.js").Client} client
 * @param {object} opts
 */
function sanitizeForMessage(s) {
  return String(s || "").replace(/[\n\r*`_]/g, "").trim() || "—";
}

async function announceRankUp(client, { guild, member, userRow, rankKey, roleId }) {
  const ch = await resolveMilestoneChannel(guild);
  if (!ch) return;
  try {
    const tier = getTierByKey(rankKey);
    const baseName = tier?.name || rankKey;
    const displayRank = buildStyledRankName(rankKey, baseName);
    const buf = await buildRankUpCard(member, userRow, rankKey);
    const file = new AttachmentBuilder(buf, { name: `rang-${member.id}.png` });

    let roleLabel = "";
    if (roleId) {
      const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
      roleLabel = role?.name ? sanitizeForMessage(role.name) : sanitizeForMessage(displayRank);
    }
    const rolePart = roleLabel ? ` Tu obtiens le rôle **${roleLabel}** !` : "";

    await ch.send({
      content:
        `🏆 <@${member.id}> **Toutes nos félicitations !** Tu as passé le rang **${displayRank}** !${rolePart}`,
      files: [file],
      allowedMentions: { users: [member.id] }
    });
  } catch (e) {
    logApiError("RANK_UP_ANNOUNCE", e, { maxDetailChars: 400 });
  }
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").GuildMember|null} member
 * @param {object} updated Prisma user + optional _gainMeta
 * @param {{ ok: boolean, changed?: boolean, rankKey?: string, roleId?: string }} syncStatus
 */
async function maybeAnnounceEconomyMilestones(client, guild, member, updated, syncStatus) {
  if (!member || member.user?.bot) return;
  const meta = updated._gainMeta;
  if (!meta) return;
  delete updated._gainMeta;

  if (meta.leveledUp) {
    await announceLevelUp(client, {
      guild,
      member,
      userRow: updated,
      prevLevel: meta.prevLevel
    });
  }

  if (meta.rankKeyChanged && syncStatus?.ok && Boolean(syncStatus.roleId)) {
    await announceRankUp(client, {
      guild,
      member,
      userRow: updated,
      rankKey: syncStatus.rankKey || updated.rankKey,
      roleId: syncStatus.roleId
    });
  }
}

module.exports = {
  resolveMilestoneChannel,
  announceLevelUp,
  announceRankUp,
  maybeAnnounceEconomyMilestones
};
