const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const TOGGLE_PREFIX = "ping_role_toggle:";

/**
 * @param {string | undefined} styleRaw
 * @returns {import("discord.js").ButtonStyle}
 */
function resolveButtonStyle(styleRaw) {
  const n = String(styleRaw || "").toLowerCase();
  if (n === "danger" || n === "red" || n === "rouge") return ButtonStyle.Danger;
  if (n === "success" || n === "green" || n === "vert") return ButtonStyle.Success;
  /** Discord n'a pas de bouton orange natif : Primary = bleu « accent » côté client. */
  if (n === "primary" || n === "orange" || n === "bleu") return ButtonStyle.Primary;
  return ButtonStyle.Secondary;
}

/**
 * @param {{ id: string, label: string, emoji?: string, style?: string, slot: string }[]} rawRoles
 */
function normalizePingRoles(rawRoles) {
  const out = [];
  const seenSlots = new Set();
  for (const r of rawRoles || []) {
    const id = String(r.id || "").trim();
    const slot = String(r.slot || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    if (!/^\d{17,22}$/.test(id) || !slot || seenSlots.has(slot)) continue;
    seenSlots.add(slot);
    const label = String(r.label || "Ping").trim().slice(0, 80);
    const emoji = r.emoji ? String(r.emoji).trim() : undefined;
    out.push({
      id,
      slot,
      label,
      emoji,
      style: resolveButtonStyle(r.style)
    });
  }
  return out;
}

/**
 * @param {string} customId
 * @returns {{ roleId: string, slot: string | null } | null}
 */
function parsePingRoleToggleCustomId(customId) {
  const full = String(customId || "");
  if (!full.startsWith(TOGGLE_PREFIX)) return null;
  const rest = full.slice(TOGGLE_PREFIX.length);
  const m = rest.match(/^(\d{17,22})(?::([a-zA-Z0-9_-]+))?$/);
  if (!m) return null;
  return { roleId: m[1], slot: m[2] || null };
}

function buildToggleCustomId(roleId, slot) {
  return `${TOGGLE_PREFIX}${roleId}:${slot}`;
}

/**
 * IDs autorises (tous les roleId declares dans la config).
 * @param {object} cfg
 */
function getAllowedPingRoleIds(cfg) {
  const raw = cfg?.pingRolesPanel?.roles || [];
  return new Set(
    raw.map((r) => String(r.id || "").trim()).filter((id) => /^\d{17,22}$/.test(id))
  );
}

/**
 * Message embed + boutons (toggle role) pour le salon annonces ping.
 */
function buildPingRolesPanelPayload() {
  const cfg = require("../config");
  const roles = normalizePingRoles(cfg.pingRolesPanel?.roles);

  const bullets =
    roles.length > 0
      ? roles.map((r) => `• ${r.emoji ? `${r.emoji} ` : ""}**${r.label}**`).join("\n")
      : "_(Aucun rôle configuré.)_";

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("🔔 Choisis tes notifications")
    .setDescription(
      [
        "Coche les **pings** qui t'intéressent : **un clic** pour recevoir le rôle, **un second** pour le retirer.",
        "",
        "**Au programme**",
        bullets,
        "",
        "_Tu peux cumuler plusieurs rôles._"
      ].join("\n")
    )
    .setFooter({ text: "La Carminauté — pings optionnels" });

  const rows = [];
  let currentRow = new ActionRowBuilder();
  for (const r of roles) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    const btn = new ButtonBuilder()
      .setCustomId(buildToggleCustomId(r.id, r.slot))
      .setLabel(r.label.slice(0, 80))
      .setStyle(r.style);
    if (r.emoji) {
      try {
        btn.setEmoji(r.emoji);
      } catch {
        /* ignore */
      }
    }
    currentRow.addComponents(btn);
  }
  if (currentRow.components.length) rows.push(currentRow);

  return { embeds: [embed], components: rows };
}

module.exports = {
  TOGGLE_PREFIX,
  parsePingRoleToggleCustomId,
  buildToggleCustomId,
  normalizePingRoles,
  getAllowedPingRoleIds,
  buildPingRolesPanelPayload
};
