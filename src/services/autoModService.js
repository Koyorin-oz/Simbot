/**
 * Auto-modération configurable par serveur : catégories + listes de termes (JSON en base).
 */

/**
 * @typedef {{
 *   enabled: boolean,
 *   categories: { id: number, name: string, terms: string[] }[],
 *   linkAllowlistTerms: string[]
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
    const arr = JSON.parse(json || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_WORDS_PER_CATEGORY);
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
    name: r.name,
    terms: safeParseWordsJson(r.words)
  }));

  const catsClean = categories.map((c) => ({
    id: c.id,
    name: c.name,
    terms: c.terms.filter(Boolean)
  }));

  const linkAllowlistTerms = catsClean
    .filter((c) => isLinkAllowlistCategoryName(c.name))
    .flatMap((c) => c.terms);

  const payload = {
    enabled: Boolean(guildRow?.enabled),
    categories: catsClean,
    linkAllowlistTerms
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
    create: { guildId, enabled },
    update: { enabled }
  });
  invalidateGuildCache(guildId);
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
  invalidateGuildCache,
  isAutoModExemptMember,
  isLinkAllowlistCategoryName,
  MAX_CATEGORIES_PER_GUILD,
  MAX_WORDS_PER_CATEGORY
};
