const fs = require("node:fs");
const path = require("node:path");
const { AttachmentBuilder } = require("discord.js");

const SHOP_BANNER_FILENAME = "shop-banner.png";

/** Chemin portable (Windows / Linux) vers la bannière boutique. */
function getShopBannerPath() {
  return path.join(process.cwd(), "assets", SHOP_BANNER_FILENAME);
}

/**
 * @returns {{ attachment: import("discord.js").AttachmentBuilder | null, hasFile: boolean }}
 */
function readShopBannerAttachment() {
  const p = getShopBannerPath();
  if (!fs.existsSync(p)) {
    return { attachment: null, hasFile: false };
  }
  try {
    const buffer = fs.readFileSync(p);
    return {
      attachment: new AttachmentBuilder(buffer, { name: SHOP_BANNER_FILENAME }),
      hasFile: true
    };
  } catch {
    return { attachment: null, hasFile: false };
  }
}

module.exports = { getShopBannerPath, readShopBannerAttachment, SHOP_BANNER_FILENAME };
