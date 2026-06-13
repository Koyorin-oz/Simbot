/**
 * Cooldown / salons pour le **ping IA** (Groq). `/dinguerie` : voir `iaManageAccess`.
 *
 * Variables (préférer `GROQ_PING_*` ; `GEMINI_PING_*` = alias historique) :
 * - salon membre : tout le monde ;
 * - salon staff : uniquement le rôle staff (`GROQ_PING_ROLE_ELSEWHERE`), **sans cooldown** ;
 * - **Administrateurs Discord** : ping dans **n’importe quel** salon (avec cooldown sauf staff+salon staff ci-dessus).
 * Hors de ces cas : **aucune réponse** (pas de message d’erreur).
 */
const { PermissionFlagsBits } = require("discord.js");

const DEDICATED_CHANNEL_ID = String(
  process.env.GROQ_PING_CHANNEL_ID || process.env.GEMINI_PING_CHANNEL_ID || "1488156790066778132"
).trim();
const STAFF_IA_CHANNEL_ID = String(
  process.env.GROQ_PING_STAFF_CHANNEL_ID || process.env.GEMINI_PING_STAFF_CHANNEL_ID || "735985783843979386"
).trim();
const ROLE_ELSEWHERE = String(
  process.env.GROQ_PING_ROLE_ELSEWHERE || process.env.GEMINI_PING_ROLE_ELSEWHERE || "740999121812586567"
).trim();

function memberHasRole(member, roleId) {
  if (!member?.roles?.cache || !roleId) return false;
  return member.roles.cache.has(roleId);
}

function memberIsGuildAdmin(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));
}

/**
 * ID du salon parent pour l’accès IA (un fil / post forum compte comme son salon parent).
 * @param {{ channel?: import("discord.js").Channel | null, channelId?: string }} ctx
 */
function getGeminiAccessChannelId(ctx) {
  const ch = ctx.channel;
  if (ch && "isThread" in ch && ch.isThread() && ch.parentId) return String(ch.parentId).trim();
  return String(ctx.channelId || "").trim();
}

/**
 * @param {import("discord.js").GuildMember|null} member
 * @param {string} channelId
 */
function canUseIaPing(member, channelId) {
  if (!member) return false;
  const ch = String(channelId || "").trim();
  if (memberIsGuildAdmin(member)) return true;
  if (ch === DEDICATED_CHANNEL_ID) return true;
  if (ROLE_ELSEWHERE && memberHasRole(member, ROLE_ELSEWHERE) && ch === STAFF_IA_CHANNEL_ID) return true;
  return false;
}

/**
 * Staff dans le salon staff : pas de cooldown entre deux pings IA.
 * @param {import("discord.js").GuildMember|null} member
 * @param {string} channelId
 */
function skipIaPingCooldown(member, channelId) {
  if (!member || !ROLE_ELSEWHERE) return false;
  const ch = String(channelId || "").trim();
  if (ch !== STAFF_IA_CHANNEL_ID) return false;
  return memberHasRole(member, ROLE_ELSEWHERE);
}

function getGeminiCooldownMs() {
  const n = Number(process.env.GROQ_COOLDOWN_MS || process.env.GROK_COOLDOWN_MS || process.env.GEMINI_COOLDOWN_MS);
  return Number.isFinite(n) && n >= 0 ? n : 8_000;
}

function cooldownKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function isGeminiOnCooldown(client, guildId, userId) {
  const map = client.geminiCooldownUntil;
  if (!map) return false;
  const until = map.get(cooldownKey(guildId, userId)) || 0;
  return Date.now() < until;
}

function setGeminiCooldown(client, guildId, userId) {
  if (!client.geminiCooldownUntil) client.geminiCooldownUntil = new Map();
  client.geminiCooldownUntil.set(cooldownKey(guildId, userId), Date.now() + getGeminiCooldownMs());
}

function geminiCooldownSecondsLeft(client, guildId, userId) {
  const map = client.geminiCooldownUntil;
  if (!map) return 0;
  const until = map.get(cooldownKey(guildId, userId)) || 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function stripBotMentions(content, botId) {
  return String(content || "")
    .replace(new RegExp(`<@!?${botId}>`, "g"), " ")
    .replace(/@(sim\s*bot|simbabot|simba\s*bot|simba)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let lastIaDedupPruneAt = 0;

/**
 * Réserve ce message pour un seul traitement ping IA (plusieurs processus partageant la même DB).
 * @returns {Promise<boolean>} true si ce processus doit répondre, false si une autre instance a déjà la réservation.
 */
async function claimIaPingDedupSlot(prisma, messageId, guildId) {
  const now = Date.now();
  if (now - lastIaDedupPruneAt > 3_600_000) {
    lastIaDedupPruneAt = now;
    await prisma.iaPingDedup
      .deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } })
      .catch(() => null);
  }
  try {
    await prisma.iaPingDedup.create({ data: { messageId: String(messageId), guildId: String(guildId) } });
    return true;
  } catch (e) {
    if (e?.code === "P2002") return false;
    throw e;
  }
}

module.exports = {
  DEDICATED_CHANNEL_ID,
  STAFF_IA_CHANNEL_ID,
  ROLE_ELSEWHERE,
  getGeminiAccessChannelId,
  canUseIaPing,
  skipIaPingCooldown,
  isGeminiOnCooldown,
  setGeminiCooldown,
  geminiCooldownSecondsLeft,
  getGeminiCooldownMs,
  stripBotMentions,
  claimIaPingDedupSlot
};
