/**
 * Panneau vocal privé — aligné sur BLZbot (mêmes titres, boutons, customId).
 * Rôle staff : config Carmina puis env PRIVATE_ROOM_STAFF_ROLE_ID.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const config = require("../config");

const PREFIX_BTN = "pvr";

function getPanelEmbedColor() {
  const raw = String(process.env.PRIVATE_ROOM_PANEL_COLOR || "2b2d31").replace(/^#/, "");
  const n = parseInt(raw, 16);
  if (!Number.isNaN(n) && n >= 0 && n <= 0xffffff) return n;
  return 0x2b2d31;
}

/** Rôle staff panneau restreint (IDs Carmina en priorité). */
function getPrivateRoomStaffRoleId() {
  const fromConfig = String(config.music?.privateRoomStaffBypassRoleId || "").trim();
  if (/^\d{17,22}$/.test(fromConfig)) return fromConfig;
  const id = String(process.env.PRIVATE_ROOM_STAFF_ROLE_ID || "").trim();
  if (/^\d{17,22}$/.test(id)) return id;
  return "";
}

function panelButton(customId, label, emoji, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(style)
    .setEmoji(emoji)
    .setLabel(String(label).slice(0, 80));
}

/**
 * @param {string} voiceChannelId
 * @param {'restricted' | 'public' | 'public_ephemeral'} panelMode
 */
function buildPrivateVoicePanelPayload(voiceChannelId, panelMode) {
  const m = panelMode === "restricted" ? "r" : panelMode === "public_ephemeral" ? "e" : "p";
  const cid = (action) => `${PREFIX_BTN}:${m}:${voiceChannelId}:${action}`;
  const color = getPanelEmbedColor();

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("Panneau — salon vocal privé")
    .setDescription(
      "Cette interface peut être utilisée pour éditer votre salon vocal temporaire.\n\n" +
        "D’autres réglages sont disponibles via le salon (clic droit → **Modifier le salon**)."
    )
    .setFooter({
      text:
        panelMode === "restricted"
          ? "Réservé au créateur et au staff"
          : panelMode === "public_ephemeral"
            ? "Visible uniquement par toi — pas besoin d’être en vocal"
            : "Panneau public — tout le monde peut utiliser les boutons"
    });

  const secondary = ButtonStyle.Secondary;
  const danger = ButtonStyle.Danger;

  const row1 = new ActionRowBuilder().addComponents(
    panelButton(cid("rename"), "Renommer", "✏️", secondary),
    panelButton(cid("limit"), "Limite", "👥", secondary),
    panelButton(cid("lock"), "Verrouiller", "🛡️", secondary),
    panelButton(cid("timer"), "Minuteur", "⏱️", secondary),
    panelButton(cid("unlock"), "Déverr.", "🔓", secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    panelButton(cid("invite"), "Inviter", "➕", secondary),
    panelButton(cid("permit"), "Autoriser", "✅", secondary),
    panelButton(cid("ring"), "Appeler", "📞", secondary),
    panelButton(cid("disconnect_others"), "Déco. autres", "📵", secondary),
    panelButton(cid("region"), "Région", "🌐", secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    panelButton(cid("kick"), "Expulser", "🔇", secondary),
    panelButton(cid("ban_room"), "Ban salon", "⛔", secondary),
    panelButton(cid("transfer"), "Transférer", "👑", secondary),
    panelButton(cid("claim"), "Récupérer", "📌", secondary),
    panelButton(cid("delete"), "Supprimer", "🗑️", danger)
  );

  return {
    embeds: [embed],
    components: [row1, row2, row3]
  };
}

const PREFIX_OPEN = "pvropen";

function buildVocPanelOpenerPayload(voiceChannelId) {
  const selfMode = !voiceChannelId;
  const embed = new EmbedBuilder()
    .setColor(getPanelEmbedColor())
    .setTitle("Panneau vocal privé")
    .setDescription(
      selfMode
        ? "Clique sur **Ouvrir mon panneau** pour gérer **ton** salon vocal privé (nom, limite, etc.), **depuis n’importe quel salon texte**, sans être connecté au vocal.\n\n" +
            "Si tu n’as pas encore de salon, rejoins d’abord le lobby **Crée ton vocal**."
        : "Clique sur **Ouvrir le panneau** pour gérer **ce** salon vocal (réservé au créateur et au staff).\n" +
            "L’interface ne s’affichera **que pour toi**."
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(selfMode ? `${PREFIX_OPEN}:self` : `${PREFIX_OPEN}:${voiceChannelId}`)
      .setLabel(selfMode ? "Ouvrir mon panneau" : "Ouvrir le panneau")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎛️")
  );
  return { embeds: [embed], components: [row] };
}

function parseVoicePanelButtonId(customId) {
  if (!customId.startsWith(`${PREFIX_BTN}:`)) return null;
  const parts = customId.split(":");
  if (parts.length !== 4) return null;
  const [, mode, voiceChannelId, action] = parts;
  if ((mode !== "r" && mode !== "p" && mode !== "e") || !/^\d{17,22}$/.test(voiceChannelId)) return null;
  return { restricted: mode === "r", voiceChannelId, action, mode };
}

function parseVoicePanelModalId(customId) {
  if (!customId.startsWith("pvrm:")) return null;
  const parts = customId.split(":");
  if (parts.length !== 4) return null;
  const [, mode, voiceChannelId, kind] = parts;
  if ((mode !== "r" && mode !== "p" && mode !== "e") || !/^\d{17,22}$/.test(voiceChannelId)) return null;
  return { restricted: mode === "r", voiceChannelId, kind, mode };
}

function parseVocPanelOpenId(customId) {
  if (!customId.startsWith(`${PREFIX_OPEN}:`)) return null;
  const rest = customId.slice(PREFIX_OPEN.length + 1);
  if (rest === "self") return { kind: "self" };
  if (/^\d{17,22}$/.test(rest)) return { kind: "channel", channelId: rest };
  return null;
}

module.exports = {
  getPrivateRoomStaffRoleId,
  getPanelEmbedColor,
  buildPrivateVoicePanelPayload,
  buildVocPanelOpenerPayload,
  parseVoicePanelButtonId,
  parseVoicePanelModalId,
  parseVocPanelOpenId,
  PREFIX_BTN,
  PREFIX_OPEN
};
