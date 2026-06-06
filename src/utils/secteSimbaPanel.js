const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config");

const CLAIM_PREFIX = "secte_simba_claim:";

function getSecteSimbaRoleId() {
  return String(config.secteSimba?.roleId || "").trim();
}

function buildSecteSimbaClaimCustomId() {
  return `${CLAIM_PREFIX}${getSecteSimbaRoleId()}`;
}

function parseSecteSimbaClaimCustomId(customId) {
  const full = String(customId || "");
  if (!full.startsWith(CLAIM_PREFIX)) return null;
  const roleId = full.slice(CLAIM_PREFIX.length).trim();
  if (!/^\d{17,22}$/.test(roleId)) return null;
  return roleId;
}

/** Message = uniquement le bouton (pas d’embed, pas de texte). */
function buildSecteSimbaButtonPayload() {
  const roleId = getSecteSimbaRoleId();
  const label = String(config.secteSimba?.buttonLabel || "Rejoindre la Secte Simba").trim().slice(0, 80);
  const emoji = String(config.secteSimba?.buttonEmoji || "").trim();

  const btn = new ButtonBuilder()
    .setCustomId(buildSecteSimbaClaimCustomId())
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);

  if (emoji) {
    try {
      btn.setEmoji(emoji);
    } catch {
      /* ignore */
    }
  }

  const row = new ActionRowBuilder().addComponents(btn);
  return { components: [row], allowedMentions: { parse: [] } };
}

function isAllowedSecteSimbaRoleId(roleId) {
  const expected = getSecteSimbaRoleId();
  return Boolean(expected && roleId === expected);
}

module.exports = {
  CLAIM_PREFIX,
  getSecteSimbaRoleId,
  buildSecteSimbaClaimCustomId,
  parseSecteSimbaClaimCustomId,
  buildSecteSimbaButtonPayload,
  isAllowedSecteSimbaRoleId
};
