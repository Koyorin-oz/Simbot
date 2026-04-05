const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { ensureCanvasFonts, canvasFont } = require("../utils/canvasFonts");

const WIDTH = 1200;
const HEIGHT = 520;
const AVATAR_SIZE = 380;
const TEXT_LEFT = 460;
const TEXT_RIGHT_PAD = 56;
const MAX_QUOTE_FONT = 44;
const MIN_QUOTE_FONT = 22;

async function buildQuoteCard(avatarUrl, quoteRaw, displayName, username) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#060608");
  bg.addColorStop(0.45, "#0e0e12");
  bg.addColorStop(1, "#14141c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const accent = ctx.createLinearGradient(TEXT_LEFT - 2, 0, TEXT_LEFT + 4, HEIGHT);
  accent.addColorStop(0, "#5c1428");
  accent.addColorStop(0.5, "#d92d56");
  accent.addColorStop(1, "#5c1428");
  ctx.fillStyle = accent;
  ctx.fillRect(TEXT_LEFT - 6, 48, 4, HEIGHT - 96);

  const cx = 200;
  const cy = HEIGHT / 2;
  const r = AVATAR_SIZE / 2;

  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.filter = "grayscale(100%) contrast(1.08)";
    ctx.drawImage(avatar, cx - r, cy - r, AVATAR_SIZE, AVATAR_SIZE);
    ctx.filter = "none";
    ctx.restore();

    const fade = ctx.createLinearGradient(cx + r * 0.2, 0, TEXT_LEFT + 20, 0);
    fade.addColorStop(0, "rgba(6,6,8,0)");
    fade.addColorStop(0.55, "rgba(6,6,8,0.65)");
    fade.addColorStop(1, "rgba(6,6,8,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, TEXT_LEFT + 40, HEIGHT);
  } catch {
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = canvasFont(120);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.stroke();

  const quote = sanitizeQuote(quoteRaw);
  const maxW = WIDTH - TEXT_LEFT - TEXT_RIGHT_PAD;
  let fontSize = MAX_QUOTE_FONT;
  let lines = wrapLines(ctx, quote, maxW, fontSize);
  while (lines.length > 7 && fontSize > MIN_QUOTE_FONT) {
    fontSize -= 2;
    lines = wrapLines(ctx, quote, maxW, fontSize);
  }
  if (lines.length > 8) {
    lines = lines.slice(0, 8);
    const last = lines[7];
    lines[7] = last.length > 3 ? `${last.slice(0, last.length - 3)}…` : "…";
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#f4f4f8";
  ctx.font = canvasFont(fontSize, { weight: 500 });
  let y = HEIGHT / 2 - (lines.length * (fontSize * 1.25)) / 2 + fontSize * 0.35;
  for (const line of lines) {
    ctx.fillText(line, TEXT_LEFT, y);
    y += fontSize * 1.28;
  }

  const nameY = Math.min(y + 36, HEIGHT - 120);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = canvasFont(26, { italic: true });
  ctx.fillText(`— ${truncate(displayName, 40)}`, TEXT_LEFT, nameY);

  ctx.fillStyle = "rgba(180,180,195,0.85)";
  ctx.font = canvasFont(22);
  ctx.fillText(`@${truncate(username, 32)}`, TEXT_LEFT, nameY + 34);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font = canvasFont(13);
  ctx.textAlign = "right";
  ctx.fillText("LA CARMINAUTE · citation", WIDTH - 28, HEIGHT - 22);

  return canvas.toBuffer("image/png");
}

function sanitizeQuote(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "_(Ce message ne contient pas de texte.)_";
  return s.length > 900 ? `${s.slice(0, 897)}…` : s;
}

function truncate(str, max) {
  const t = String(str || "");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function wrapLines(ctx, text, maxWidth, fontSize) {
  ctx.font = canvasFont(fontSize, { weight: 500 });
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
      if (ctx.measureText(w).width > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          const t2 = chunk + ch;
          if (ctx.measureText(t2).width <= maxWidth) chunk = t2;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

module.exports = { buildQuoteCard };
