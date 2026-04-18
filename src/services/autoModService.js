/**
 * Auto-modération configurable par serveur : catégories + listes de termes (JSON en base).
 */

/**
 * @typedef {{
 *   enabled: boolean,
 *   categories: { id: number, name: string, terms: string[] }[],
 *   linkAllowlistTerms: string[],
 *   ignoredChannelIds: string[]
 * }} GuildAutoModPayload
 */

const CACHE_MS = 20_000;
/** @type {Map<string, { at: number, payload: GuildAutoModPayload }>} */
const cache = new Map();

const MAX_WORD_LEN = 120;
const MAX_WORDS_PER_CATEGORY = 400;
const MAX_CATEGORIES_PER_GUILD = 40;

function invalidateGuildCache(guildId) {
  cache.delete(guildId);
}

function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Découpe une saisie utilisateur : retours/lignes, virgules, points-virgules.
 * @param {string} raw
 * @returns {string[]}
 */
function parseWordsInput(raw) {
  const text = String(raw || "");
  const parts = text.split(/[\n,;|]+/);
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    const w = p.trim();
    if (!w) continue;
    const clipped = w.length > MAX_WORD_LEN ? w.slice(0, MAX_WORD_LEN) : w;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= MAX_WORDS_PER_CATEGORY) break;
  }
  return out;
}

function safeParseWordsJson(json) {
  try {
    const raw = String(json || "");
    if (raw.length > 2_000_000) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const cap = Math.min(arr.length, MAX_WORDS_PER_CATEGORY + 100);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < cap; i++) {
      let x = String(arr[i]).trim();
      if (!x) continue;
      if (x.length > MAX_WORD_LEN) x = x.slice(0, MAX_WORD_LEN);
      const key = x.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
      if (out.length >= MAX_WORDS_PER_CATEGORY) break;
    }
    return out;
  } catch {
    return [];
  }
}

const MAX_IGNORED_CHANNELS = 100;
const SNOWFLAKE_RE = /^\d{17,20}$/;

function parseIgnoredChannelIdsJson(raw) {
  try {
    const s = String(raw || "[]");
    if (s.length > 50_000) return [];
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const x of arr.slice(0, MAX_IGNORED_CHANNELS + 20)) {
      const id = String(x).trim();
      if (!SNOWFLAKE_RE.test(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_IGNORED_CHANNELS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Catégorie spéciale : liste **blanche** de motifs d’URL (domaines, morceaux de lien).
 * Nom reconnu sans tenir compte des accents / casse (ex. « LIEN autorise », « Liens autorisés »).
 * @param {string} name
 */
function isLinkAllowlistCategoryName(name) {
  const n = normalizeForMatch(String(name || "").trim());
  if (!n) return false;
  return (
    n === "lien autorise" ||
    n === "liens autorise" ||
    n === "lien autorises" ||
    n === "liens autorises" ||
    n === "liens autorisees"
  );
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @returns {Promise<GuildAutoModPayload>}
 */
async function getGuildAutoModPayload(prisma, guildId) {
  const now = Date.now();
  const hit = cache.get(guildId);
  if (hit && now - hit.at < CACHE_MS) return hit.payload;

  const guildRow = await prisma.autoModGuild.findUnique({ where: { guildId } }).catch(() => null);
  const rows = await prisma.autoModCategory.findMany({ where: { guildId } }).catch(() => []);

  const categories = rows.map((r) => ({
    id: r.id,
    name: String(r.name || "").slice(0, 80),
    terms: safeParseWordsJson(r.words)
  }));

  const catsClean = categories.map((c) => ({
    id: c.id,
    name: c.name.slice(0, 80),
    terms: c.terms.filter(Boolean)
  }));

  const linkAllowlistTerms = catsClean
    .filter((c) => isLinkAllowlistCategoryName(c.name))
    .flatMap((c) => c.terms);

  const ignoredChannelIds = parseIgnoredChannelIdsJson(guildRow?.ignoredChannelIds);

  const payload = {
    enabled: Boolean(guildRow?.enabled),
    categories: catsClean,
    linkAllowlistTerms,
    ignoredChannelIds
  };

  cache.set(guildId, { at: now, payload });
  return payload;
}

/**
 * @param {string} normalizedMessage
 * @param {GuildAutoModPayload} payload
 * @returns {{ categoryName: string, term: string } | null}
 */
function findViolation(normalizedMessage, payload) {
  if (!payload.enabled || !normalizedMessage) return null;
  for (const cat of payload.categories) {
    if (isLinkAllowlistCategoryName(cat.name)) continue;
    for (const term of cat.terms) {
      const nt = normalizeForMatch(term);
      if (!nt) continue;
      if (normalizedMessage.includes(nt)) {
        return { categoryName: cat.name, term };
      }
    }
  }
  return null;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @param {string} displayName
 * @param {string[]} words
 */
async function upsertCategoryWords(prisma, guildId, displayName, words) {
  const trimmed = String(displayName || "").trim();
  if (!trimmed || trimmed.length > 80) {
    throw new Error("Nom de catégorie invalide (1–80 caractères).");
  }
  const all = await prisma.autoModCategory.findMany({ where: { guildId } });
  if (all.length >= MAX_CATEGORIES_PER_GUILD) {
    const existing = all.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!existing) {
      throw new Error(`Limite de ${MAX_CATEGORIES_PER_GUILD} catégories atteinte. Supprime-en une avant.`);
    }
  }

  const existing = all.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const wordsJson = JSON.stringify(words);

  if (existing) {
    const updated = await prisma.autoModCategory.update({
      where: { id: existing.id },
      data: { words: wordsJson, name: trimmed }
    });
    invalidateGuildCache(guildId);
    return updated;
  }

  const created = await prisma.autoModCategory.create({
    data: { guildId, name: trimmed, words: wordsJson }
  });
  invalidateGuildCache(guildId);
  return created;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @param {string} categoryName
 */
async function deleteCategoryByName(prisma, guildId, categoryName) {
  const key = String(categoryName || "").trim().toLowerCase();
  if (!key) return { deleted: 0 };
  const all = await prisma.autoModCategory.findMany({ where: { guildId } });
  const existing = all.find((c) => c.name.toLowerCase() === key);
  if (!existing) return { deleted: 0 };
  await prisma.autoModCategory.delete({ where: { id: existing.id } });
  invalidateGuildCache(guildId);
  return { deleted: 1 };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @param {boolean} enabled
 */
async function setGuildAutoModEnabled(prisma, guildId, enabled) {
  await prisma.autoModGuild.upsert({
    where: { guildId },
    create: { guildId, enabled, ignoredChannelIds: "[]" },
    update: { enabled }
  });
  invalidateGuildCache(guildId);
}

/**
 * Remplace la liste des salons exclus (auto-mod mots + liens).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @param {string[]} channelIds
 */
async function setGuildAutoModIgnoredChannelIds(prisma, guildId, channelIds) {
  const unique = [];
  const seen = new Set();
  for (const id of channelIds) {
    const x = String(id || "").trim();
    if (!SNOWFLAKE_RE.test(x)) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    unique.push(x);
    if (unique.length >= MAX_IGNORED_CHANNELS) break;
  }
  const json = JSON.stringify(unique);
  await prisma.autoModGuild.upsert({
    where: { guildId },
    create: { guildId, enabled: false, ignoredChannelIds: json },
    update: { ignoredChannelIds: json }
  });
  invalidateGuildCache(guildId);
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @param {string} channelId
 */
async function addAutoModIgnoredChannel(prisma, guildId, channelId) {
  const payload = await getGuildAutoModPayload(prisma, guildId);
  const set = new Set(payload.ignoredChannelIds);
  if (set.has(channelId)) return { added: false, count: set.size };
  if (set.size >= MAX_IGNORED_CHANNELS) {
    throw new Error(`Limite de ${MAX_IGNORED_CHANNELS} salons exclus atteinte. Retire-en un avant.`);
  }
  set.add(channelId);
  await setGuildAutoModIgnoredChannelIds(prisma, guildId, [...set]);
  return { added: true, count: set.size };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} guildId
 * @param {string} channelId
 */
async function removeAutoModIgnoredChannel(prisma, guildId, channelId) {
  const payload = await getGuildAutoModPayload(prisma, guildId);
  const set = new Set(payload.ignoredChannelIds);
  const had = set.delete(channelId);
  await setGuildAutoModIgnoredChannelIds(prisma, guildId, [...set]);
  return { removed: Boolean(had), count: set.size };
}

const { PermissionFlagsBits } = require("discord.js");

/**
 * @param {import("discord.js").GuildMember | null} member
 */
function isAutoModExemptMember(member) {
  if (!member) return true;
  const p = member.permissions;
  if (!p?.has) return false;
  if (p.has(PermissionFlagsBits.Administrator)) return true;
  if (p.has(PermissionFlagsBits.ManageMessages)) return true;
  if (p.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (p.has(PermissionFlagsBits.ManageGuild)) return true;
  return false;
}

module.exports = {
  normalizeForMatch,
  parseWordsInput,
  getGuildAutoModPayload,
  findViolation,
  upsertCategoryWords,
  deleteCategoryByName,
  setGuildAutoModEnabled,
  setGuildAutoModIgnoredChannelIds,
  addAutoModIgnoredChannel,
  removeAutoModIgnoredChannel,
  invalidateGuildCache,
  isAutoModExemptMember,
  isLinkAllowlistCategoryName,
  MAX_CATEGORIES_PER_GUILD,
  MAX_WORDS_PER_CATEGORY,
  MAX_IGNORED_CHANNELS
};
