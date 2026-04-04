/** Fuseau utilisé pour les resets « au jour » (récompenses quotidiennes, etc.). */
const PARIS_TZ = "Europe/Paris";

/**
 * Date calendaire (YYYY-MM-DD) dans le fuseau Europe/Paris, pour comparaisons stables.
 * @param {Date | string | number} input
 * @returns {string}
 */
function getParisCalendarYmd(input) {
  const d = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

/**
 * @param {Date | string | number | null | undefined} lastClaimAt
 * @param {Date} [now]
 * @returns {boolean} true si une réclamation « daily » compte pour le même jour calendaire à Paris que `now`
 */
function isDailyAlreadyClaimedParisDay(lastClaimAt, now = new Date()) {
  if (lastClaimAt == null) return false;
  const t = new Date(lastClaimAt).getTime();
  if (!Number.isFinite(t) || t <= 0) return false;
  return getParisCalendarYmd(lastClaimAt) === getParisCalendarYmd(now);
}

module.exports = { PARIS_TZ, getParisCalendarYmd, isDailyAlreadyClaimedParisDay };
