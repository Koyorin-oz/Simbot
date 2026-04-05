const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config");
const realServerIds = require("../data/realServerIds");
const { ensureCanvasFonts, canvasFont } = require("./canvasFonts");

const WIDTH = 1600;
const HEIGHT = 560;

function formatMemberTag(n) {
  if (!Number.isFinite(n) || n <= 0) return "#?";
  return `#${n}`;
}

function getBackgroundPath() {
  const configured = String(config.welcome?.canvasBackgroundPath || "").trim();
  const fallback = path.join(
    process.env.USERPROFILE || "",
    ".cursor",
    "projects",
    "c-Users-koyor-OneDrive-Documents-Desktop-GM-CARMINABOT",
    "assets",
    "c__Users_koyor_AppData_Roaming_Cursor_User_workspaceStorage_807d0a7989207b892549e0e965b63191_images_image-5157a8ff-692c-4d44-8e8c-3200e78c7c01.png"
  );
  if (configured && fs.existsSync(configured)) return configured;
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function drawCoverImage(ctx, img, width, height) {
  const scale = Math.max(width / img.width, height / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const x = (width - drawW) / 2;
  const y = (height - drawH) / 2;
  ctx.drawImage(img, x, y, drawW, drawH);
}

function drawRoundedClip(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildWelcomeCard(member) {
  ensureCanvasFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const bgPath = getBackgroundPath();
  if (bgPath) {
    try {
      const bg = await loadImage(bgPath);
      drawCoverImage(ctx, bg, WIDTH, HEIGHT);
    } catch {
      ctx.fillStyle = "#1f1f25";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  } else {
    ctx.fillStyle = "#1f1f25";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const topOverlay = ctx.createLinearGradient(0, 0, 0, 165);
  topOverlay.addColorStop(0, "rgba(0,0,0,0.55)");
  topOverlay.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = topOverlay;
  ctx.fillRect(0, 0, WIDTH, 165);

  const bottomOverlay = ctx.createLinearGradient(0, HEIGHT - 210, 0, HEIGHT);
  bottomOverlay.addColorStop(0, "rgba(0,0,0,0.02)");
  bottomOverlay.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = bottomOverlay;
  ctx.fillRect(0, HEIGHT - 210, WIDTH, 210);

  const avatar = await loadImage(member.displayAvatarURL({ extension: "png", size: 512 }));
  const frameSize = 300;
  const frameX = WIDTH / 2 - frameSize / 2;
  const frameY = 96;

  ctx.save();
  drawRoundedClip(ctx, frameX, frameY, frameSize, frameSize, 18);
  ctx.clip();
  ctx.drawImage(avatar, frameX, frameY, frameSize, frameSize);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.74)";
  ctx.lineWidth = 4;
  drawRoundedClip(ctx, frameX, frameY, frameSize, frameSize, 18);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = canvasFont(66, { bold: true });
  ctx.fillText(`Bienvenue ${member.displayName}`, WIDTH / 2, HEIGHT - 88);

  ctx.font = canvasFont(48, { weight: 600 });
  ctx.fillText("dans la Carminauté", WIDTH / 2, HEIGHT - 34);

  ctx.font = canvasFont(46, { bold: true });
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fillText(formatMemberTag(member.guild.memberCount), WIDTH / 2, frameY - 14);

  return canvas.toBuffer("image/png");
}

function buildChannelButton(guildId, channelId, label, emoji) {
  if (channelId) {
    return new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(label)
      .setEmoji(emoji)
      .setURL(`https://discord.com/channels/${guildId}/${channelId}`);
  }
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setLabel(`${label} (bientot)`)
    .setEmoji(emoji)
    .setCustomId(`welcome_missing_${label.toLowerCase().replace(/\s+/g, "_")}`)
    .setDisabled(true);
}

/** Message de bienvenue avec carte canvas + boutons de navigation. */
async function buildJoinWelcomeMessage(member) {
  const isProdGuild = member.guild.id === realServerIds.guildId;
  const ch = realServerIds.channels || {};
  const reglementId = isProdGuild
    ? ch.reglementChannelId || config.welcomeVerify?.reglementChannelId || config.welcome?.rulesChannelId || ""
    : config.welcomeVerify?.reglementChannelId || config.welcome?.rulesChannelId || "";
  const verificationId = isProdGuild
    ? ch.verificationChannelId || config.welcomeVerify?.rulesChannelId || ""
    : config.welcomeVerify?.rulesChannelId || "";
  const repertoireId = isProdGuild
    ? ch.repertoireChannelId || config.welcomeVerify?.repertoireChannelId || ""
    : config.welcomeVerify?.repertoireChannelId || "";
  const card = await buildWelcomeCard(member);

  return {
    content: `Bienvenue à ${member} sur **La Carminauté**!!! Tu as rejoins la secte, il n'y a plus de retour en arrière possible... ✈️ 🏨`,
    files: [new AttachmentBuilder(card, { name: "welcome-card.png" })],
    components: [
      new ActionRowBuilder().addComponents(
        buildChannelButton(member.guild.id, reglementId, "Reglement", "📘"),
        buildChannelButton(member.guild.id, verificationId, "Verification", "✅"),
        buildChannelButton(member.guild.id, repertoireId, "Repertoire", "📋")
      )
    ],
    allowedMentions: { parse: [], users: [member.id] }
  };
}

/** Bienvenue Accueil (2e salon) : meme carte que Principal ; boutons Repertoire / Reglement / Ticket (sans verification). */
async function buildJoinWelcomeMessageAlt(member) {
  const wa = config.welcomeAlt || {};
  const reglementId = String(wa.reglementChannelId || "").trim();
  const repertoireId = String(wa.repertoireChannelId || "").trim();
  const ticketId = String(wa.ticketChannelId || "").trim();
  const card = await buildWelcomeCard(member);

  return {
    content: `Bienvenue à ${member} sur **La Carminauté**!!! Tu as rejoins la secte, il n'y a plus de retour en arrière possible... ✈️ 🏨`,
    files: [new AttachmentBuilder(card, { name: "welcome-card.png" })],
    components: [
      new ActionRowBuilder().addComponents(
        buildChannelButton(member.guild.id, repertoireId, "Repertoire", "📋"),
        buildChannelButton(member.guild.id, reglementId, "Reglement", "📘"),
        buildChannelButton(member.guild.id, ticketId, "Ticket", "🏷️")
      )
    ],
    allowedMentions: { parse: [], users: [member.id] }
  };
}

module.exports = { buildJoinWelcomeMessage, buildJoinWelcomeMessageAlt };
