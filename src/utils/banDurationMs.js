const ms = require("ms");

const MIN_TEMP_BAN_MS = 60 * 1000;
const MAX_TEMP_BAN_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Duree ban temporaire : syntaxe `ms` (1h, 7d, 1y, 2 weeks) puis style giveaway (30m, 2j, 1mois, 1h30m).
 * @param {string} input
 * @returns {{ ok: true, ms: number } | { ok: false, error: string }}
 */
function parseBanDurationMs(input) {
  const t = String(input || "").trim();
  if (!t) return { ok: false, error: "Duree vide." };

  const fromPkg = ms(t);
  if (typeof fromPkg === "number" && Number.isFinite(fromPkg)) {
    if (fromPkg < MIN_TEMP_BAN_MS) {
      return { ok: false, error: "Minimum **1 minute**." };
    }
    if (fromPkg > MAX_TEMP_BAN_MS) {
      return { ok: false, error: "Maximum **10 ans**." };
    }
    return { ok: true, ms: fromPkg };
  }

  const raw = t.toLowerCase().replace(/\s+/g, "");
  const re = /(\d+)(mois|mo|j|h|m|s)/g;
  let match;
  let total = 0;
  let consumed = "";

  while ((match = re.exec(raw))) {
    const value = Number(match[1]);
    const unit = match[2];
    consumed += match[0];
    if (!Number.isFinite(value) || value <= 0) continue;
    if (unit === "s") total += value * 1000;
    else if (unit === "m") total += value * 60_000;
    else if (unit === "h") total += value * 3_600_000;
    else if (unit === "j") total += value * 86_400_000;
    else total += value * 2_592_000_000;
  }

  if (!total || consumed.length !== raw.length) {
    return {
      ok: false,
      error: "Duree invalide. Ex. `12h`, `7j`, `1mois`, `1y`, `2 weeks`."
    };
  }

  if (total < MIN_TEMP_BAN_MS) {
    return { ok: false, error: "Minimum **1 minute**." };
  }
  if (total > MAX_TEMP_BAN_MS) {
    return { ok: false, error: "Maximum **10 ans**." };
  }
  return { ok: true, ms: total };
}

module.exports = { parseBanDurationMs, MIN_TEMP_BAN_MS, MAX_TEMP_BAN_MS };
