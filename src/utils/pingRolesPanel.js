const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const TOGGLE_PREFIX = "ping_role_toggle:";

/**
 * Fusionne les entrees avec le meme roleId en un seul bouton (libelle compose).
 * @param {{ id: string, label: string, emoji?: string }[]} rawRoles
 */
function compactPingRoles(rawRoles) {
  const map = new Map();
  for (const r of rawRoles || []) {
    const id = String(r.id || "").trim();
    if (!/^\d{17,22}$/.test(id)) continue;
    const label = String(r.label || "Rôle").trim();
    if (!map.has(id)) {
      map.set(id, { id, labels: [label], emoji: r.emoji ? String(r.emoji).trim() : null });
    } else {
      map.get(id).labels.push(label);
    }
  }
  return [...map.values()].map((x) => {
    const joined =
      x.labels.length > 1 ? x.labels.join(" · ") : x.labels[0];
    return {
      id: x.id,
      label: joined.slice(0, 80),
      emoji: x.emoji || undefined
    };
  });
}

/**
 * IDs autorises pour les boutons (liste brute config, avant fusion).
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
  const compact = compactPingRoles(cfg.pingRolesPanel?.roles);

  const bullets =
    compact.length > 0
      ? compact.map((r) => `• **${r.label}**`).join("\n")
      : "_(Aucun rôle configuré.)_";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Choisis tes notifications")
    .setDescription(
      [
        "Tu peux t'assigner des **rôles de ping** pour être notifié quand on poste dans certains canaux ou pour certains sujets.",
        "",
        "**Comment ça marche ?**",
        "• Clique sur un bouton pour **recevoir** le rôle.",
        "• Clique **à nouveau** sur le même bouton pour **te retirer** le rôle.",
        "",
        "**Rôles disponibles**",
        bullets,
        "",
        "_Tu peux en prendre plusieurs en même temps._"
      ].join("\n")
    )
    .setFooter({ text: "La Carminauté — pings optionnels" });

  const rows = [];
  let currentRow = new ActionRowBuilder();
  for (const r of compact) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    const btn = new ButtonBuilder()
      .setCustomId(`${TOGGLE_PREFIX}${r.id}`)
      .setLabel(r.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary);
    if (r.emoji) {
      try {
        btn.setEmoji(r.emoji);
      } catch {
        /* emoji custom mal forme : ignorer */
      }
    }
    currentRow.addComponents(btn);
  }
  if (currentRow.components.length) rows.push(currentRow);

  return { embeds: [embed], components: rows };
}

module.exports = {
  TOGGLE_PREFIX,
  compactPingRoles,
  getAllowedPingRoleIds,
  buildPingRolesPanelPayload
};
