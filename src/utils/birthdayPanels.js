const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
} = require("discord.js");
const { V2_MSG, ACCENT_COLOR } = require("./componentsV2Panels");

/**
 * @param {import("discord.js").Guild|null|undefined} guild
 * @param {string[]} userIds
 * @returns {Promise<Map<string, string>>}
 */
async function resolveDisplayNames(guild, userIds) {
  const map = new Map();
  const unique = [...new Set(userIds)];
  if (!guild) {
    for (const id of unique) map.set(id, `Utilisateur ${id}`);
    return map;
  }
  for (const id of unique) {
    let m = guild.members.cache.get(id);
    if (!m) {
      m = await guild.members.fetch(id).catch(() => null);
    }
    if (m) {
      map.set(id, m.displayName || m.user?.username || id);
      continue;
    }
    const u = await guild.client.users.fetch(id).catch(() => null);
    map.set(id, u?.username || `ID ${id}`);
  }
  return map;
}

function sanitizeLineName(name) {
  return String(name || "").replace(/[\n\r*`_]/g, "").trim() || "Membre";
}

/**
 * @param {Array<{ userId: string, day: number, month: number, daysLeft: number, turningAge?: number }>} entries
 * @param {import("discord.js").Guild|null|undefined} guild
 * @param {number} [limit]
 */
async function buildBirthdayListPanel(entries, guild, limit = 15) {
  const shown = entries.slice(0, limit);
  const nameById = await resolveDisplayNames(
    guild,
    shown.map((e) => e.userId)
  );

  const lines = shown.length
    ? shown.map((entry, index) => formatBirthdayLine(entry, index + 1, nameById.get(entry.userId)))
    : ["Aucun anniversaire enregistre pour le moment."];

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## 🎂 Prochains anniversaires"))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("🎉 Classement par anniversaire le plus proche")
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n\n")))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("✨ Utilise `/anniversaire` pour enregistrer ou mettre a jour ta date.")
    );

  return { components: [container], ...V2_MSG };
}

function formatBirthdayLine(entry, rank, displayName) {
  const label = sanitizeLineName(displayName);
  const dateLabel = `${pad2(entry.day)}/${pad2(entry.month)}`;
  const dayLabel = entry.daysLeft === 0 ? "aujourd'hui 🎊" : `dans ${entry.daysLeft} jour(s)`;

  if (entry.turningAge) {
    return `**#${rank}** 🎂 **${label}** • ${dateLabel} • ${dayLabel}\nVa avoir **${entry.turningAge} ans**`;
  }

  return `**#${rank}** 🎂 **${label}** • ${dateLabel} • ${dayLabel}\nAnniversaire en approche 🎉`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

module.exports = { buildBirthdayListPanel };
