const ms = require("ms");

/** @type {Record<string, number>} */
const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  j: 86_400_000,
  d: 86_400_000,
  sem: 7 * 86_400_000,
  semaine: 7 * 86_400_000,
  semaines: 7 * 86_400_000,
  mo: 30 * 86_400_000,
  mois: 30 * 86_400_000
};

const FRENCH_UNIT_RE = /(\d+)(mois|semaines|semaine|sem|mo|j|d|h|m|s)/gi;

/**
 * Parse une duree style francais : 10m, 1h, 2j, 1sem, 1mois, 1h30m…
 * @param {string} input
 * @param {{ minMs?: number, maxMs?: number, examples?: string }} [opts]
 * @returns {{ ok: true, ms: number } | { ok: false, error: string }}
 */
function parseFrenchDurationMs(input, opts = {}) {
  const minMs = opts.minMs ?? 1000;
  const maxMs = opts.maxMs ?? Number.POSITIVE_INFINITY;
  const examples = opts.examples ?? "`10m`, `1h`, `2j`, `1sem`, `1mois`, `1h30m`";

  const t = String(input || "").trim();
  if (!t) return { ok: false, error: "Durée vide." };

  const fromPkg = ms(t);
  if (typeof fromPkg === "number" && Number.isFinite(fromPkg)) {
    if (fromPkg < minMs) {
      return { ok: false, error: `Minimum **${Math.ceil(minMs / 60_000)} minute(s)**.` };
    }
    if (fromPkg > maxMs) {
      return { ok: false, error: `Maximum **${formatMaxDurationFr(maxMs)}**.` };
    }
    return { ok: true, ms: fromPkg };
  }

  const raw = t.toLowerCase().replace(/\s+/g, "");
  let match;
  let total = 0;
  let consumed = "";

  FRENCH_UNIT_RE.lastIndex = 0;
  while ((match = FRENCH_UNIT_RE.exec(raw))) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    consumed += match[0];
    if (!Number.isFinite(value) || value <= 0) continue;
    const mul = UNIT_MS[unit];
    if (mul) total += value * mul;
  }

  if (!total || consumed.length !== raw.length) {
    return { ok: false, error: `Durée invalide. Exemples : ${examples}.` };
  }

  if (total < minMs) {
    return { ok: false, error: `Minimum **${Math.ceil(minMs / 60_000)} minute(s)**.` };
  }
  if (total > maxMs) {
    return { ok: false, error: `Maximum **${formatMaxDurationFr(maxMs)}** (limite Discord pour un timeout).` };
  }
  return { ok: true, ms: total };
}

function formatMaxDurationFr(maxMs) {
  if (maxMs >= 28 * 86_400_000 && maxMs < 29 * 86_400_000) return "28 jours";
  if (maxMs >= 7 * 86_400_000 && maxMs % (7 * 86_400_000) === 0) {
    return `${maxMs / (7 * 86_400_000)} semaine(s)`;
  }
  if (maxMs >= 86_400_000) return `${Math.round(maxMs / 86_400_000)} jour(s)`;
  if (maxMs >= 3_600_000) return `${Math.round(maxMs / 3_600_000)} heure(s)`;
  return `${Math.round(maxMs / 60_000)} minute(s)`;
}

module.exports = { parseFrenchDurationMs, UNIT_MS };
