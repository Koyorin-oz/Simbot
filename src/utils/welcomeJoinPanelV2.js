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

/**
 * Fond carte bienvenue (cover sur tout le canvas).
 * Ordre : WELCOME_CANVAS_BACKGROUND (.env, chemin absolu Pebble) → config.welcome.canvasBackgroundPath
 * → fichiers dans le repo : assets/welcome-canvas-background.png|.jpg|.webp
 *
 * Évite les chemins Windows codés en dur : sur Linux (Pebble) ils n'existent pas → fond gris.
 */
function getBackgroundPath() {
  const envPath = String(process.env.WELCOME_CANVAS_BACKGROUND || "").trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  const configured = String(config.welcome?.canvasBackgroundPath || "").trim();
  if (configured && fs.existsSync(configured)) return configured;

  const base = path.join(process.cwd(), "assets");
  const names = ["welcome-canvas-background.png", "welcome-canvas-background.jpg", "welcome-canvas-background.webp"];
  for (const name of names) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
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
