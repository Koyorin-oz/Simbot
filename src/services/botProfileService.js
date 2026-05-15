const { EmbedBuilder, ActivityType } = require("discord.js");

const SETTINGS_ID = 1;

const DEFAULT_SETTINGS = {
  presenceActivityType: "WATCHING",
  presenceActivityName: "SimBot",
  presenceStatus: "online",
  presenceStreamUrl: "",
  botAvatarUrl: "",
  embedTitle: "",
  embedDescription: "",
  embedAuthorName: "",
  embedAuthorIconUrl: "",
  embedFooterText: "",
  embedFooterIconUrl: "",
  embedImageUrl: "",
  embedThumbnailUrl: "",
  embedColor: 0x5865f2
};

async function ensureSettingsRow(prisma) {
  await prisma.botRuntimeSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {}
  });
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 */
async function getBotRuntimeSettings(prisma) {
  await ensureSettingsRow(prisma);
  return prisma.botRuntimeSettings.findUnique({ where: { id: SETTINGS_ID } });
}

function resolveActivityTypeKey(raw) {
  const k = String(raw || "WATCHING").toUpperCase();
  if (k in ActivityType) return /** @type {keyof typeof ActivityType} */ (k);
  return "WATCHING";
}

function normalizePresenceStatus(raw) {
  const s = String(raw || "online").toLowerCase();
  if (s === "idle" || s === "dnd" || s === "invisible" || s === "online") return s;
  return "online";
}

/**
 * Applique la présence Discord du bot (activité + statut).
 * @param {import("discord.js").Client} client
 */
async function applyBotPresence(client) {
  if (!client?.user) return;
  const s = await getBotRuntimeSettings(client.prisma);
  if (!s) return;

  let typeKey = resolveActivityTypeKey(s.presenceActivityType);
  let type = ActivityType[typeKey];
  if (type === undefined) type = ActivityType.Watching;

  const name = String(s.presenceActivityName || "SimBot").slice(0, 128);
  const status = normalizePresenceStatus(s.presenceStatus);

  /** @type {{ name: string; type: number; url?: string }} */
  const activity = { name, type };

  if (type === ActivityType.Streaming) {
    const url = String(s.presenceStreamUrl || "").trim();
    if (url) {
      activity.url = url;
    } else {
      type = ActivityType.Watching;
      activity.type = ActivityType.Watching;
      console.warn("[BOT_PROFILE] STREAMING sans URL — repli sur WATCHING.");
    }
  }

  await client.user.setPresence({
    activities: [activity],
    status
  });
}

function isHttpImageUrl(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u) || /cdn\.discordapp\.com|media\.discordapp\.net/i.test(u);
}

/**
 * Telecharge une image (URL publique ou piece jointe Discord).
 * @param {string} url
 */
async function fetchImageBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SimBot/1.0)" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = String(res.headers.get("content-type") || "");
  if (ct && !ct.startsWith("image/")) {
    throw new Error("La reponse n'est pas une image.");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 128) throw new Error("Image trop petite ou invalide.");
  if (buf.length > 8 * 1024 * 1024) throw new Error("Image trop lourde (max ~8 Mo).");
  return buf;
}

/**
 * Applique la photo de profil du bot depuis `botAvatarUrl` (DB).
 * @param {import("discord.js").Client} client
 * @param {{ remove?: boolean }} [opts] remove=true -> avatar Discord par defaut
 */
async function applyBotAvatar(client, opts = {}) {
  if (!client?.user) return;
  const s = await getBotRuntimeSettings(client.prisma);
  if (!s) return;

  if (opts.remove) {
    await client.user.setAvatar(null);
    return;
  }

  const url = String(s.botAvatarUrl || "").trim();
  if (!url) return;

  const buf = await fetchImageBuffer(url);
  await client.user.setAvatar(buf);
}

function parseHexColor(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;
  const hex = s.startsWith("#") ? s.slice(1) : s;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

/**
 * Construit un embed à partir des réglages (pour aperçu — pas lié à la présence du bot).
 * @param {import("@prisma/client").BotRuntimeSettings} s
 */
function buildPreviewEmbed(s) {
  const embed = new EmbedBuilder().setColor(Number.isFinite(s.embedColor) ? s.embedColor : DEFAULT_SETTINGS.embedColor);

  const title = String(s.embedTitle || "").trim();
  const desc = String(s.embedDescription || "").trim();
  if (title) embed.setTitle(title.slice(0, 256));
  if (desc) embed.setDescription(desc.slice(0, 4096));
  else if (!title && !desc)
    embed.setDescription(
      "_Aperçu : ajoute un titre ou une description avec `/bot-apparence embed`. La présence du bot (Regarde / Joue à…) est réglée avec `/bot-apparence activite`._"
    );

  const authorName = String(s.embedAuthorName || "").trim();
  const authorIcon = String(s.embedAuthorIconUrl || "").trim();
  if (authorName || authorIcon) {
    embed.setAuthor({
      name: authorName.slice(0, 256) || "Auteur",
      iconURL: authorIcon || undefined
    });
  }

  const footerText = String(s.embedFooterText || "").trim();
  const footerIcon = String(s.embedFooterIconUrl || "").trim();
  if (footerText || footerIcon) {
    embed.setFooter({
      text: footerText.slice(0, 2048) || "Footer",
      iconURL: footerIcon || undefined
    });
  }

  const img = String(s.embedImageUrl || "").trim();
  const thumb = String(s.embedThumbnailUrl || "").trim();
  if (img) embed.setImage(img);
  if (thumb) embed.setThumbnail(thumb);

  embed.setTimestamp(new Date());
  return embed;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {"presence"|"embed"|"avatar"|"tout"} section
 */
async function resetBotRuntimeSection(prisma, section) {
  await ensureSettingsRow(prisma);
  if (section === "tout") {
    await prisma.botRuntimeSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        presenceActivityType: "WATCHING",
        presenceActivityName: "SimBot",
        presenceStatus: "online",
        presenceStreamUrl: "",
        botAvatarUrl: "",
        embedTitle: "",
        embedDescription: "",
        embedAuthorName: "",
        embedAuthorIconUrl: "",
        embedFooterText: "",
        embedFooterIconUrl: "",
        embedImageUrl: "",
        embedThumbnailUrl: "",
        embedColor: 5793266,
        iaPingTone: "auto"
      }
    });
    return;
  }
  if (section === "presence") {
    await prisma.botRuntimeSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        presenceActivityType: "WATCHING",
        presenceActivityName: "SimBot",
        presenceStatus: "online",
        presenceStreamUrl: ""
      }
    });
    return;
  }
  if (section === "avatar") {
    await prisma.botRuntimeSettings.update({
      where: { id: SETTINGS_ID },
      data: { botAvatarUrl: "" }
    });
    return;
  }
  if (section === "embed") {
    await prisma.botRuntimeSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        embedTitle: "",
        embedDescription: "",
        embedAuthorName: "",
        embedAuthorIconUrl: "",
        embedFooterText: "",
        embedFooterIconUrl: "",
        embedImageUrl: "",
        embedThumbnailUrl: "",
        embedColor: 5793266
      }
    });
  }
}

module.exports = {
  SETTINGS_ID,
  DEFAULT_SETTINGS,
  ensureSettingsRow,
  getBotRuntimeSettings,
  applyBotPresence,
  applyBotAvatar,
  fetchImageBuffer,
  isHttpImageUrl,
  parseHexColor,
  buildPreviewEmbed,
  resolveActivityTypeKey,
  normalizePresenceStatus,
  resetBotRuntimeSection
};
