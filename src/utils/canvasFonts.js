/**
 * Sans (UI) : Segoe UI sur Windows, Inter embarquée sur Linux/Pebble.
 * Serif (carte profil — titres / chiffres) : Georgia sur Windows, Noto Serif embarquée ailleurs.
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

const FAM_SERIF = {
  reg: "CarminaSerif",
  bold: "CarminaSerifBold"
};

let _ready = false;

function ensureCanvasFonts() {
  if (_ready) return;
  _ready = true;
  if (USE_WIN_SEGOE) return;

  const base = path.join(process.cwd(), "assets", "fonts");
  const sans = [
    ["Inter-Regular.ttf", FAM.reg],
    ["Inter-Medium.ttf", FAM.med],
    ["Inter-SemiBold.ttf", FAM.semi],
    ["Inter-Bold.ttf", FAM.bold],
    ["Inter-Italic.ttf", FAM.italic]
  ];
  const serif = [
    ["NotoSerif-Regular.ttf", FAM_SERIF.reg],
    ["NotoSerif-Bold.ttf", FAM_SERIF.bold]
  ];
  for (const [name, family] of [...sans, ...serif]) {
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

/**
 * Texte principal carte profil (empattements), aligné sur une typo “display” Windows.
 * @param {number} sizePx
 * @param {{ bold?: boolean, weight?: number }} [opts]
 */
function canvasSerifFont(sizePx, opts = {}) {
  ensureCanvasFonts();

  const w = opts.weight;

  if (USE_WIN_SEGOE) {
    let weight = 400;
    if (opts.bold === true) weight = 700;
    else if (typeof w === "number" && Number.isFinite(w)) {
      weight = Math.min(900, Math.max(100, Math.round(w)));
    }
    return `${weight} ${sizePx}px Georgia, "Times New Roman", serif`;
  }

  if (opts.bold === true) {
    return `${sizePx}px ${FAM_SERIF.bold}, serif`;
  }
  if (typeof w === "number" && w >= 600) {
    return `${sizePx}px ${FAM_SERIF.bold}, serif`;
  }
  return `${sizePx}px ${FAM_SERIF.reg}, serif`;
}

module.exports = { ensureCanvasFonts, canvasFont, canvasSerifFont, FAM, FAM_SERIF };
