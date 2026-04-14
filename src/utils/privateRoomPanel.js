const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config");

/** Gris anthracite (style BLZ). Surcharge : PRIVATE_ROOM_PANEL_COLOR (hex sans #). */
function getPanelEmbedColor() {
  const raw = String(process.env.PRIVATE_ROOM_PANEL_COLOR || "2b2d31").replace(/^#/, "");
  const n = parseInt(raw, 16);
  if (!Number.isNaN(n) && n >= 0 && n <= 0xffffff) return n;
  return 0x2b2d31;
}

/**
 * @param {string} customId
 * @param {string} label
 * @param {string} emoji
 * @param {import("discord.js").ButtonStyle} style
 */
function panelButton(customId, label, emoji, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(style)
    .setEmoji(emoji)
    .setLabel(String(label).slice(0, 80));
}

/**
 * Panneau salons vocaux privés — embed + grilles type BLZ (IDs boutons inchangés `prv_*` pour les handlers).
 * @param {boolean} hasChannel
 * @param {string} prefsSummaryText
 * @param {string} ownerId
 * @param {{
 *   pingUser?: boolean,
 *   panelTextChannelId?: string | null,
 *   lobbyChannelId?: string | null,
 *   musicEnabled?: boolean
 * }} [opts]
 */
function buildPrivateRoomPanel(hasChannel, prefsSummaryText, ownerId, opts = {}) {
  const id = String(ownerId);
  const color = getPanelEmbedColor();

  const lobbyMention =
    opts.lobbyChannelId && /^\d{17,22}$/.test(String(opts.lobbyChannelId))
      ? `<#${opts.lobbyChannelId}>`
      : "le lobby **Créer votre salon**";
  const panelHint = opts.panelTextChannelId
    ? `Tu peux aussi suivre le fil dans <#${opts.panelTextChannelId}>.`
    : "";

  const staffRoleId = String(config.music?.privateRoomStaffBypassRoleId || "").trim();
  const staffHint =
    staffRoleId && /^\d{17,22}$/.test(staffRoleId)
      ? `Le rôle <@&${staffRoleId}> a les mêmes accès que le propriétaire.`
      : "Un rôle staff peut être configuré pour bypasser les restrictions du panneau.";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("Panneau — salon vocal privé")
    .setDescription(
      [
        opts.pingUser ? `<@${id}>\n` : "",
        "Utilise cette interface pour **nom**, **limite de places**, **listes** d’accès et **verrouillage** du salon.",
        "",
        `**Étape 1 :** rejoins ${lobbyMention} pour créer ou retrouver ton vocal.`,
        panelHint,
        "",
        hasChannel
          ? "**Statut :** salon actif — les actions s’appliquent à ce vocal."
          : "**Statut :** pas de salon mémorisé — passe par le lobby ou **Créer / Configurer**.",
        "",
        prefsSummaryText || "",
        "",
        `*${staffHint}*`
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setFooter({
      text: "D’autres options (Discord) : clic droit sur le salon → Modifier le salon"
    });

  const secondary = ButtonStyle.Secondary;
  const success = ButtonStyle.Success;
  const primary = ButtonStyle.Primary;

  const row1 = new ActionRowBuilder().addComponents(
    panelButton(`prv_rename:${id}`, "Renommer", "✏️", secondary),
    panelButton(`prv_limit:${id}`, "Limite", "👥", secondary),
    panelButton(`prv_lock:${id}`, "Verrouiller", "🛡️", secondary),
    panelButton(`prv_unlock:${id}`, "Déverr.", "🔓", secondary),
    panelButton(`prv_refresh:${id}`, "Rafraîchir", "🔄", secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    panelButton(`prv_bl:${id}`, "Liste noire", "🚫", secondary),
    panelButton(`prv_wl:${id}`, "Liste blanche", "✅", secondary),
    panelButton(`prv_create:${id}`, hasChannel ? "Configurer" : "Créer salon", "⚙️", success)
  );

  const rows = [row1, row2];

  if (opts.musicEnabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        panelButton(`prv_music_panel:${id}`, "Musique", "🎵", primary)
      )
    );
  }

  return { embeds: [embed], components: rows };
}

module.exports = { getPanelEmbedColor, buildPrivateRoomPanel };
