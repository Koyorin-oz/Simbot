/**
 * Polices canvas : **Inter** (aligné BLZbot `profil-v2` / `canvas-guild-profile-v2.js`).
 *
 * Fichiers (dans `assets/fonts/`, à la racine du projet) :
 * - **Option A (recommandé, un seul fichier)** : `InterVariable.ttf` — depuis
 *   https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.ttf
 * - **Option B (comme BLZ)** : `Inter-Regular.ttf` + `Inter-Bold.ttf` avec les noms exacts.
 *
 * Sans aucun fichier : repli **Segoe UI** / **system-ui** (moins fiable pour les poids).
 */
const fs = require("node:fs");
const path = require("node:path");
const { GlobalFonts } = require("@napi-rs/canvas");

/** Noms de familles identiques à BLZbot quand les TTF statiques sont utilisés. */
const INTER = "Inter";
const INTER_BOLD = "InterBold";

const SYS_FALLBACK = '"Segoe UI", "Segoe UI Variable", system-ui, sans-serif';

/** @type {boolean} */
let _ready = false;
/** @type {"none"|"variable"|"static"} */
let _interMode = "none";

function tryRegister(p, family) {
  if (!fs.existsSync(p)) return false;
  try {
    GlobalFonts.registerFromPath(p, family);
    return true;
  } catch (e) {
    console.warn(`[canvasFonts] registerFromPath ${family}:`, e?.message || e);
    return false;
  }
}

function ensureCanvasFonts() {
  if (_ready) return;
  _ready = true;

  const base = path.join(process.cwd(), "assets", "fonts");
  const variable = path.join(base, "InterVariable.ttf");
  const reg = path.join(base, "Inter-Regular.ttf");
  const bold = path.join(base, "Inter-Bold.ttf");

  if (tryRegister(reg, INTER) && tryRegister(bold, INTER_BOLD)) {
    _interMode = "static";
    return;
  }
  if (tryRegister(variable, INTER)) {
    _interMode = "variable";
  }
}

/**
 * @param {number} sizePx
 * @param {{ bold?: boolean, italic?: boolean, weight?: number }} [opts]
 */
function canvasFont(sizePx, opts = {}) {
  ensureCanvasFonts();

  const italic = opts.italic === true;
  const w = typeof opts.weight === "number" && Number.isFinite(opts.weight) ? opts.weight : null;
  let weight = 400;
  if (opts.bold === true) weight = 700;
  else if (w != null) weight = Math.min(900, Math.max(100, Math.round(w)));

  const it = italic ? "italic " : "";

  if (_interMode === "static") {
    const useBold = opts.bold === true || weight >= 600;
    const face = useBold ? INTER_BOLD : INTER;
    return `${it}${sizePx}px ${face}, ${SYS_FALLBACK}`;
  }

  if (_interMode === "variable") {
    return `${it}${weight} ${sizePx}px ${INTER}, ${SYS_FALLBACK}`;
  }

  return `${it}${weight} ${sizePx}px ${SYS_FALLBACK}`;
}

/**
 * Même rendu que `canvasFont` (Inter partout ; le nom « Serif » est conservé pour l’API).
 * @param {number} sizePx
 * @param {{ bold?: boolean, weight?: number }} [opts]
 */
function canvasSerifFont(sizePx, opts = {}) {
  return canvasFont(sizePx, opts);
}

/** Compat imports anciens : tout pointe sur Inter. */
const FAM = { reg: INTER, med: INTER, semi: INTER, bold: INTER_BOLD, italic: INTER };
const FAM_SERIF = { reg: INTER, bold: INTER_BOLD };

module.exports = { ensureCanvasFonts, canvasFont, canvasSerifFont, FAM, FAM_SERIF, INTER, INTER_BOLD };
