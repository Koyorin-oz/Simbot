/**
 * Rendu proche Segoe UI (comme sur ta capture Windows) :
 * - Windows : "Segoe UI" via la police système.
 * - Linux / Pebble : Inter embarquée (assets/fonts), très proche visuellement, licence SIL OFL.
 */
const fs = require("node:fs");
const path = require("node:path");
const { registerFont } = require("@napi-rs/canvas");

const USE_WIN_SEGOE = process.platform === "win32";

const FAM = {
  reg: "CarminaSans",
  med: "CarminaSansMed",
  semi: "CarminaSansSemi",
  bold: "CarminaSansBold",
  italic: "CarminaSansItalic"
};

let _ready = false;

function ensureCanvasFonts() {
  if (_ready) return;
  _ready = true;
  if (USE_WIN_SEGOE) return;

  const base = path.join(process.cwd(), "assets", "fonts");
  const files = [
    ["Inter-Regular.ttf", FAM.reg],
    ["Inter-Medium.ttf", FAM.med],
    ["Inter-SemiBold.ttf", FAM.semi],
    ["Inter-Bold.ttf", FAM.bold],
    ["Inter-Italic.ttf", FAM.italic]
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
 *   bold → 700 · weight 500–599 → Medium · 600–699 → SemiBold (proche Segoe Semibold)
 */
function canvasFont(sizePx, opts = {}) {
  ensureCanvasFonts();

  const w = opts.weight;
  const useItalic = opts.italic === true;

  if (USE_WIN_SEGOE) {
    let weight = 400;
    if (opts.bold === true) weight = 700;
    else if (typeof w === "number" && Number.isFinite(w)) {
      weight = Math.min(900, Math.max(100, Math.round(w)));
    }
    const style = useItalic ? "italic " : "";
    return `${style}${weight} ${sizePx}px "Segoe UI", sans-serif`;
  }

  if (useItalic) {
    return `italic ${sizePx}px ${FAM.italic}, sans-serif`;
  }
  if (opts.bold === true) {
    return `${sizePx}px ${FAM.bold}, sans-serif`;
  }
  if (typeof w === "number" && w >= 600) {
    return `${sizePx}px ${FAM.semi}, sans-serif`;
  }
  if (typeof w === "number" && w >= 500) {
    return `${sizePx}px ${FAM.med}, sans-serif`;
  }
  return `${sizePx}px ${FAM.reg}, sans-serif`;
}

module.exports = { ensureCanvasFonts, canvasFont, FAM };
