/**
 * Tout le texte canvas : monospace.
 * - Windows : Consolas (système).
 * - Linux / Pebble : JetBrains Mono embarquée (SIL OFL).
 *
 * `canvasSerifFont` garde le même nom pour le profil mais utilise la même stack mono.
 */
const fs = require("node:fs");
const path = require("node:path");
const { registerFont } = require("@napi-rs/canvas");

const USE_WIN = process.platform === "win32";

/** Familles enregistrées (fichiers JetBrainsMono-*.ttf). */
const FAM = {
  reg: "CarminaMono",
  med: "CarminaMonoMed",
  semi: "CarminaMonoSemi",
  bold: "CarminaMonoBold",
  italic: "CarminaMonoItalic"
};

/** Alias pour la carte profil : mêmes glyphes que FAM (mono partout). */
const FAM_SERIF = {
  reg: FAM.reg,
  bold: FAM.bold
};

const WIN_STACK = 'Consolas, "Cascadia Mono", monospace';

let _ready = false;

function ensureCanvasFonts() {
  if (_ready) return;
  _ready = true;
  if (USE_WIN) return;

  const base = path.join(process.cwd(), "assets", "fonts");
  const files = [
    ["JetBrainsMono-Regular.ttf", FAM.reg],
    ["JetBrainsMono-Medium.ttf", FAM.med],
    ["JetBrainsMono-SemiBold.ttf", FAM.semi],
    ["JetBrainsMono-Bold.ttf", FAM.bold],
    ["JetBrainsMono-Italic.ttf", FAM.italic]
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
 */
function canvasFont(sizePx, opts = {}) {
  ensureCanvasFonts();

  const w = opts.weight;
  const useItalic = opts.italic === true;

  if (USE_WIN) {
    let weight = 400;
    if (opts.bold === true) weight = 700;
    else if (typeof w === "number" && Number.isFinite(w)) {
      weight = Math.min(900, Math.max(100, Math.round(w)));
    }
    const style = useItalic ? "italic " : "";
    return `${style}${weight} ${sizePx}px ${WIN_STACK}`;
  }

  if (useItalic) {
    return `italic ${sizePx}px ${FAM.italic}, monospace`;
  }
  if (opts.bold === true) {
    return `${sizePx}px ${FAM.bold}, monospace`;
  }
  if (typeof w === "number" && w >= 600) {
    return `${sizePx}px ${FAM.semi}, monospace`;
  }
  if (typeof w === "number" && w >= 500) {
    return `${sizePx}px ${FAM.med}, monospace`;
  }
  return `${sizePx}px ${FAM.reg}, monospace`;
}

/**
 * @param {number} sizePx
 * @param {{ bold?: boolean, weight?: number }} [opts]
 */
function canvasSerifFont(sizePx, opts = {}) {
  ensureCanvasFonts();

  const w = opts.weight;

  if (USE_WIN) {
    let weight = 400;
    if (opts.bold === true) weight = 700;
    else if (typeof w === "number" && Number.isFinite(w)) {
      weight = Math.min(900, Math.max(100, Math.round(w)));
    }
    return `${weight} ${sizePx}px ${WIN_STACK}`;
  }

  if (opts.bold === true) {
    return `${sizePx}px ${FAM.bold}, monospace`;
  }
  if (typeof w === "number" && w >= 600) {
    return `${sizePx}px ${FAM.bold}, monospace`;
  }
  return `${sizePx}px ${FAM.reg}, monospace`;
}

module.exports = { ensureCanvasFonts, canvasFont, canvasSerifFont, FAM, FAM_SERIF };
