/**
 * Logs terminal : par défaut une seule ligne (évite les pavés JSON API / Groq).
 * Détail : `BOT_VERBOSE_LOGS=1` dans `.env` puis redémarrage.
 */
function isVerboseLogs() {
  return String(process.env.BOT_VERBOSE_LOGS || "").trim() === "1";
}

/**
 * @param {string} tag
 * @param {unknown} err
 * @param {{ maxDetailChars?: number }} [opts]
 */
function logApiError(tag, err, opts = {}) {
  const max = opts.maxDetailChars ?? 600;
  const raw = String(err?.message || err || "").trim();
  const first = raw.split(/\r?\n/)[0].slice(0, 180);
  console.error(`[${tag}]`, first || "(erreur sans message)");
  if (isVerboseLogs() && raw.length > first.length) {
    console.error(`[${tag}] détail:\n${raw.slice(0, max)}${raw.length > max ? "…" : ""}`);
  }
}

function logVerboseWarn(...args) {
  if (isVerboseLogs()) console.warn(...args);
}

module.exports = {
  isVerboseLogs,
  logApiError,
  logVerboseWarn
};
