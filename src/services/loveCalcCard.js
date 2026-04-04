const { createCanvas, loadImage } = require("@napi-rs/canvas");

async function buildLoveCalcCard(userA, userB, percent) {
  const width = 1180;
  const height = 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#3b0012");
  bg.addColorStop(0.45, "#8a1238");
  bg.addColorStop(1, "#d92d56");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  drawHeartBackground(ctx, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  roundRect(ctx, 24, 20, width - 48, height - 40, 30);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  roundRect(ctx, 34, 30, width - 68, height - 60, 26);
  ctx.stroke();

  const avatarA = await loadImage(userA.displayAvatarURL({ extension: "png", size: 512 }));
  const avatarB = await loadImage(userB.displayAvatarURL({ extension: "png", size: 512 }));
  const avatarRadius = 122;
  drawAvatarCircle(ctx, avatarA, 270, 220, avatarRadius);
  drawAvatarCircle(ctx, avatarB, width - 270, 220, avatarRadius);

  ctx.fillStyle = "#fff2f6";
  ctx.font = "bold 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`RESULTAT: ${percent}%`, width / 2, 108);

  const heartOuterSize = 182;
  const heartY = 122;
  drawHeart(ctx, width / 2, heartY, heartOuterSize, "#de6789");
  strokeHeart(ctx, width / 2, heartY, heartOuterSize, "#ffffff", 8);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff8fa";
  ctx.font = "bold 52px sans-serif";
  ctx.fillText(`${percent}%`, width / 2, 216);
  ctx.restore();

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#fff3f7";
  ctx.fillText("LOVE CALC", width / 2, 78);

  ctx.font = "24px sans-serif";
  ctx.fillStyle = "rgba(255,245,248,0.95)";
  ctx.fillText(shortName(userA.displayName), 270, 380);
  ctx.fillText(shortName(userB.displayName), width - 270, 380);

  ctx.textAlign = "left";
  return canvas.toBuffer("image/png");
}

function shortName(value) {
  const text = String(value || "");
  return text.length > 16 ? `${text.slice(0, 13)}...` : text;
}

function drawAvatarCircle(ctx, image, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(x, y + topCurveHeight);
  ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 2, x, y + size);
  ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 2, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function strokeHeart(ctx, x, y, size, color, lineWidth) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(x, y + topCurveHeight);
  ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 2, x, y + size);
  ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 2, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHeartBackground(ctx, width, height) {
  const hearts = [
    [90, 70, 18, 0.12],
    [200, 110, 14, 0.1],
    [310, 72, 22, 0.11],
    [430, 110, 16, 0.08],
    [760, 84, 20, 0.12],
    [890, 118, 15, 0.1],
    [1020, 76, 21, 0.11],
    [1080, 124, 13, 0.08],
    [130, 322, 16, 0.11],
    [280, 360, 14, 0.08],
    [390, 330, 20, 0.1],
    [735, 342, 17, 0.1],
    [875, 365, 14, 0.08],
    [1000, 330, 19, 0.11]
  ];

  for (const [x, y, size, alpha] of hearts) {
    drawHeart(ctx, x, y, size, `rgba(255, 214, 226, ${alpha})`);
  }
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

module.exports = { buildLoveCalcCard };
