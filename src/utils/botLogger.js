/**
 * Logs console du bot : niveaux + messages uniques / limites pour Pebble.
 * BOT_LOG_LEVEL=error|warn|info|debug (defaut: info)
 */

const LEVEL_RANK = { error: 0, warn: 1, info: 2, debug: 3 };

function minLevel() {
  const raw = String(process.env.BOT_LOG_LEVEL || "info").trim().toLowerCase();
  return LEVEL_RANK[raw] ?? LEVEL_RANK.info;
}

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatLine(level, tag, message) {
  const icon = { error: "✖", warn: "⚠", info: "●", debug: "…" }[level] || "•";
  const pad = String(tag || "BOT").padEnd(14).slice(0, 14);
  return `${ts()} ${icon} ${pad} ${message}`;
}

function shouldLog(level) {
  return LEVEL_RANK[level] <= minLevel();
}

/** @type {Set<string>} */
const onceKeys = new Set();
/** @type {Map<string, number>} */
const throttleUntil = new Map();

/**
 * @param {"error"|"warn"|"info"|"debug"} level
 * @param {string} tag
 * @param {string} message
 */
function log(level, tag, message) {
  if (!shouldLog(level)) return;
  const line = formatLine(level, tag, message);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function logOnce(key, level, tag, message) {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  log(level, tag, message);
}

function logThrottled(key, intervalMs, level, tag, message) {
  const now = Date.now();
  const until = throttleUntil.get(key) || 0;
  if (now < until) return;
  throttleUntil.set(key, now + Math.max(1000, intervalMs));
  log(level, tag, message);
}

/**
 * Bloc de demarrage lisible (une seule fois).
 * @param {string[]} lines
 */
function logBanner(lines) {
  if (!shouldLog("info")) return;
  const w = 52;
  console.log(`\n${"═".repeat(w)}`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log(`${"═".repeat(w)}\n`);
}

/**
 * Log erreur API / handler (tag + message tronque).
 * @param {string} tag
 * @param {unknown} err
 * @param {{ maxDetailChars?: number }} [opts]
 */
function logApiError(tag, err, opts = {}) {
  const max = Math.max(80, Number(opts.maxDetailChars) || 400);
  let msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err?.message || String(err);
  if (err && typeof err === "object" && Array.isArray(err.failures) && err.failures.length) {
    const details = err.failures
      .map((f) => {
        const st = f.status != null ? `HTTP ${f.status}` : "?";
        const m = String(f.message || "").slice(0, 160);
        return `${f.provider || "?"} ${st}${m ? ` ${m}` : ""}`;
      })
      .join(" | ");
    msg = `${msg} :: ${details}`;
  }
  log("error", tag, String(msg || "Erreur inconnue").slice(0, max));
}

/** Logs IA / repli modèle — uniquement si BOT_VERBOSE_LOGS=1 ou niveau debug. */
function logVerboseWarn(message) {
  const verbose = String(process.env.BOT_VERBOSE_LOGS || "").trim() === "1";
  if (!verbose && !shouldLog("debug")) return;
  log("warn", "IA", String(message || ""));
}

module.exports = {
  log,
  logOnce,
  logThrottled,
  logBanner,
  logApiError,
  logVerboseWarn,
  error: (tag, msg) => log("error", tag, msg),
  warn: (tag, msg) => log("warn", tag, msg),
  info: (tag, msg) => log("info", tag, msg),
  debug: (tag, msg) => log("debug", tag, msg)
};
