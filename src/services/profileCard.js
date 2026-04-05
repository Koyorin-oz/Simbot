const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getLpNeeded, getRankFromSp } = require("./economyService");
const { formatSC } = require("../utils/currency");
const { ensureCanvasFonts, canvasFont } = require("../utils/canvasFonts");

async function buildProfileCard(member, userData) {
  ensureCanvasFonts();
  const width = 1150;
  const height = 440;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#2a0f0f");
  bg.addColorStop(0.5, "#5b1a14");
  bg.addColorStop(1, "#a3321d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.11)";
  roundRect(ctx, 24, 24, width - 48, height - 48, 24);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  roundRect(ctx, 48, 48, 220, 330, 18);
  ctx.fill();

  const avatar = await loadImage(member.displayAvatarURL({ extension: "png", size: 512 }));
  ctx.save();
  ctx.beginPath();
  ctx.arc(158, 170, 88, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 70, 82, 176, 176);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,220,180,0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(158, 170, 90, 0, Math.PI * 2);
  ctx.stroke();

  const rank = getRankFromSp(userData.simbaPoints);
  const needed = getLpNeeded(userData.level);
  const pct = Math.min(100, Math.max(0, (userData.levelPoints / needed) * 100));

  ctx.fillStyle = "#ffffff";
  ctx.font = canvasFont(48, { bold: true });
  ctx.fillText(truncateName(ctx, member.displayName, 840), 300, 100);
  ctx.font = canvasFont(24);
  ctx.fillStyle = "rgba(255,235,220,0.92)";
  ctx.fillText(`Membre depuis: ${new Date(member.joinedAt).toLocaleDateString("fr-FR")}`, 300, 138);

  // Petit badge lion decoratif en haut a droite.
  await drawLionBadge(ctx);

  drawStatCard(ctx, 300, 155, 255, 84, "SIMBA COINS", `${formatSC(userData.simbaCoins)} SC`);
  drawStatCard(ctx, 570, 155, 255, 84, "SIMBA POINTS", `${userData.simbaPoints.toLocaleString("fr-FR")} SP`);
  drawStatCard(ctx, 840, 155, 255, 84, "RANG ACTUEL", rank.name.toUpperCase());
  drawStatCard(ctx, 300, 250, 255, 84, "NIVEAU", `${userData.level}`);
  drawStatCard(ctx, 570, 250, 255, 84, "LEVEL POINTS", `${userData.levelPoints}/${needed}`);
  drawStatCard(ctx, 840, 250, 255, 84, "PROGRESSION", `${pct.toFixed(1)}%`);

  const barX = 300;
  const barY = 354;
  const barW = 795;
  const barH = 24;

  roundRect(ctx, barX, barY, barW, barH, 14);
  ctx.fillStyle = "rgba(255,230,200,0.24)";
  ctx.fill();

  const bar = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  bar.addColorStop(0, "#ffb347");
  bar.addColorStop(0.55, "#ff6a3d");
  bar.addColorStop(1, "#e3311f");
  roundRect(ctx, barX, barY, Math.max(10, (barW * pct) / 100), barH, 14);
  ctx.fillStyle = bar;
  ctx.fill();

  ctx.font = canvasFont(21);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(`${pct.toFixed(1)}% vers le niveau ${userData.level + 1}`, barX, 414);

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStatCard(ctx, x, y, w, h, label, value) {
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.fillStyle = "rgba(255,233,215,0.88)";
  ctx.font = canvasFont(15);
  ctx.fillText(label, x + 16, y + 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = canvasFont(41, { bold: true });
  const fitted = fitText(ctx, value, w - 24, 41, 25);
  ctx.font = canvasFont(fitted, { bold: true });
  ctx.fillText(value, x + 16, y + 64);
}

function truncateName(ctx, value, maxWidth) {
  const text = String(value);
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

function fitText(ctx, value, maxWidth, maxSize, minSize) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = canvasFont(size, { bold: true });
    if (ctx.measureText(String(value)).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

async function drawLionBadge(ctx) {
  const badgeX = 980;
  const badgeY = 44;
  const badgeW = 124;
  const badgeH = 90;

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fill();

  const lionPath = path.join(process.cwd(), "assets", "lion-top-right.png");
  try {
    const lion = await loadImage(lionPath);
    ctx.save();
    roundRect(ctx, badgeX + 8, badgeY + 8, badgeW - 16, badgeH - 16, 12);
    ctx.clip();
    ctx.drawImage(lion, badgeX + 8, badgeY + 8, badgeW - 16, badgeH - 16);
    ctx.restore();
  } catch {
    ctx.fillStyle = "rgba(255,225,170,0.9)";
    ctx.font = canvasFont(34, { bold: true });
    ctx.fillText("🦁", badgeX + 45, badgeY + 58);
  }
}

module.exports = { buildProfileCard };
