/**
 * Polices Noto Sans embarquées (assets/fonts) pour un rendu identique
 * Windows / Linux (Pebble sans Segoe ni fontconfig utile).
 */
const fs = require("node:fs");
const path = require("node:path");
const { registerFont } = require("@napi-rs/canvas");

const FAM = {
  reg: "CarminaSans",
  bold: "CarminaSansBold",
  italic: "CarminaSansItalic"
};

let _ready = false;

function ensureCanvasFonts() {
  if (_ready) return;
  _ready = true;
  const base = path.join(process.cwd(), "assets", "fonts");
  const files = [
    ["NotoSans-Regular.ttf", FAM.reg],
    ["NotoSans-Bold.ttf", FAM.bold],
    ["NotoSans-Italic.ttf", FAM.italic]
  ];
  for (const [name, family] of files) {
    const p = path.join(base, name);
    try {
      if (fs.existsSync(p)) registerFont(p, { family });
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {number} sizePx
 * @param {{ bold?: boolean, italic?: boolean, weight?: number }} [opts]
 *   weight >= 600 → graisse bold (proche Segoe 600/700)
 */
function canvasFont(sizePx, opts = {}) {
  ensureCanvasFonts();
  const w = opts.weight;
  const useBold = opts.bold === true || (typeof w === "number" && w >= 600);
  const useItalic = opts.italic === true;

  if (useItalic) {
    return `italic ${sizePx}px ${FAM.italic}, sans-serif`;
  }
  if (useBold) {
    return `${sizePx}px ${FAM.bold}, sans-serif`;
  }
  return `${sizePx}px ${FAM.reg}, sans-serif`;
}

module.exports = { ensureCanvasFonts, canvasFont, FAM };
