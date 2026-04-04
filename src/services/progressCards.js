const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("node:path");
const config = require("../config");
const { getLpNeeded, getRankFromSp } = require("./economyService");

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawProgressBar(ctx, x, y, w, h, pct, gradientStops) {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();

  const fillW = Math.max(12, (w * Math.min(100, Math.max(0, pct))) / 100);
  const g = ctx.createLinearGradient(x, y, x + w, y);
  for (const [stop, color] of gradientStops) {
    g.addColorStop(stop, color);
  }
  roundRect(ctx, x, y, fillW, h, 14);
  ctx.fillStyle = g;
  ctx.fill();
}

/**
 * Thème proche de /profil (chaud / lion).
 * @param {import("discord.js").GuildMember} member
 * @param {{ level: number, levelPoints: number }} userData
 */
async function buildLevelUpCard(member, userData) {
  const width = 1000;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#2a0f0f");
  bg.addColorStop(0.45, "#5b1a14");
  bg.addColorStop(1, "#a3321d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, 20, 20, width - 40, height - 40, 22);
  ctx.fill();

  const avatar = await loadImage(member.displayAvatarURL({ extension: "png", size: 256 }));
  const cx = 130;
  const cy = 180;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 72, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, cx - 72, cy - 72, 144, 144);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,220,180,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.stroke();

  const level = Number(userData.level) || 1;
  const needed = getLpNeeded(level);
  const lp = Number(userData.levelPoints) || 0;
  const pct = needed > 0 ? Math.min(100, Math.max(0, (lp / needed) * 100)) : 0;

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px sans-serif";
  ctx.fillText(`Niveau ${level}`, 240, 95);
  ctx.font = "24px sans-serif";
  ctx.fillStyle = "rgba(255,235,220,0.9)";
  ctx.fillText(`Progression vers le niveau ${level + 1}`, 240, 132);
  ctx.font = "20px sans-serif";
  ctx.fillText(`${lp.toLocaleString("fr-FR")} / ${needed.toLocaleString("fr-FR")} LP  ·  ${pct.toFixed(1)}%`, 240, 165);

  const barX = 240;
  const barY = 200;
  const barW = 720;
  const barH = 28;
  drawProgressBar(ctx, barX, barY, barW, barH, pct, [
    [0, "#ffb347"],
    [0.55, "#ff6a3d"],
    [1, "#e3311f"]
  ]);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Carte palier niveau — La Carminauté", barX, 290);

  const lionPath = path.join(process.cwd(), "assets", "lion-top-right.png");
  try {
    const lion = await loadImage(lionPath);
    ctx.save();
    roundRect(ctx, width - 168, 36, 132, 96, 14);
    ctx.clip();
    ctx.drawImage(lion, width - 168, 36, 132, 96);
    ctx.restore();
  } catch {
    /* ignore */
  }

  return canvas.toBuffer("image/png");
}

function getTierIndex(rankKey) {
  return config.rankSystem.thresholds.findIndex((t) => t.key === rankKey);
}

/**
 * Thème bleu — progression SP vers le prochain rang.
 * @param {import("discord.js").GuildMember} member
 * @param {{ simbaPoints: number }} userData
 * @param {string} rankKey
 */
async function buildRankUpCard(member, userData, rankKey) {
  const width = 1000;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0a1628");
  bg.addColorStop(0.4, "#132a46");
  bg.addColorStop(0.75, "#1e4976");
  bg.addColorStop(1, "#2563eb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, 20, 20, width - 40, height - 40, 22);
  ctx.fill();

  const avatar = await loadImage(member.displayAvatarURL({ extension: "png", size: 256 }));
  const cx = 130;
  const cy = 180;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 72, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, cx - 72, cy - 72, 144, 144);
  ctx.restore();

  ctx.strokeStyle = "rgba(147, 197, 253, 0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.stroke();

  const sp = Number(userData.simbaPoints) || 0;
  const thresholds = config.rankSystem.thresholds;
  const idx = getTierIndex(rankKey);
  const currentTier = idx >= 0 ? thresholds[idx] : getRankFromSp(sp);
  const nextTier = idx >= 0 && idx < thresholds.length - 1 ? thresholds[idx + 1] : null;

  let pct = 100;
  let subline = "Rang maximal atteint sur cette échelle";
  if (nextTier && currentTier) {
    const span = nextTier.minSp - currentTier.minSp;
    const gained = sp - currentTier.minSp;
    pct = span > 0 ? Math.min(100, Math.max(0, (gained / span) * 100)) : 0;
    subline = `${sp.toLocaleString("fr-FR")} SP · prochain : ${nextTier.name} (${nextTier.minSp.toLocaleString("fr-FR")} SP)`;
  }

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText("Rang Simba", 240, 95);
  ctx.font = "26px sans-serif";
  ctx.fillStyle = "rgba(191, 219, 254, 0.95)";
  ctx.fillText(currentTier?.name ? String(currentTier.name) : rankKey, 240, 138);
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
  ctx.fillText(subline, 240, 172);

  const barX = 240;
  const barY = 200;
  const barW = 720;
  const barH = 28;
  drawProgressBar(ctx, barX, barY, barW, barH, pct, [
    [0, "#38bdf8"],
    [0.5, "#3b82f6"],
    [1, "#1d4ed8"]
  ]);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Progression vers le prochain palier de rang — ${pct.toFixed(1)}%`, barX, 290);

  return canvas.toBuffer("image/png");
}

module.exports = { buildLevelUpCard, buildRankUpCard };
