const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");
const config = require("../config");
const { isFrozen } = require("./simbotRuntimeService");

const TIKTOK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function tiktokHeaders() {
  return {
    "User-Agent": TIKTOK_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://www.tiktok.com/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  };
}

function profileUrl(username) {
  return `https://www.tiktok.com/@${encodeURIComponent(username)}`;
}

function liveUrl(username) {
  return `https://www.tiktok.com/@${encodeURIComponent(username)}/live`;
}

function decodeEscapedString(input) {
  return String(input || "")
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
}

function unescapeHtml(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeImageUrl(url) {
  const raw = decodeEscapedString(url || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return null;
}

async function fetchProfileHtml(username) {
  const res = await fetch(profileUrl(username), { headers: tiktokHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseLiveInfoFromHtml(html, username) {
  const decoded = decodeEscapedString(html);
  const hasLiveBadge =
    /"isLive"\s*:\s*true/i.test(decoded) ||
    /"liveRoom"\s*:\s*\{[\s\S]*?"status"\s*:\s*2/i.test(decoded) ||
    /\/@[^/"]+\/live/i.test(decoded);

  const roomIdMatch =
    decoded.match(/"liveRoomId"\s*:\s*"(\d{6,})"/) ||
    decoded.match(/"roomId"\s*:\s*"(\d{6,})"/) ||
    decoded.match(/"id"\s*:\s*"(\d{6,})"\s*,\s*"status"\s*:\s*2/);
  const roomId = roomIdMatch ? roomIdMatch[1] : null;

  const titleMatch =
    decoded.match(/"title"\s*:\s*"([^"]{1,220})"/) ||
    decoded.match(/"liveTitle"\s*:\s*"([^"]{1,220})"/);
  const rawTitle = titleMatch ? unescapeHtml(decodeEscapedString(titleMatch[1])) : "";

  const imageMatch =
    decoded.match(/"cover"\s*:\s*"([^"]+)"/) ||
    decoded.match(/"dynamicCover"\s*:\s*"([^"]+)"/) ||
    decoded.match(/"avatarLarger"\s*:\s*"([^"]+)"/);
  const imageUrl = imageMatch ? normalizeImageUrl(imageMatch[1]) : null;

  return {
    isLive: Boolean(hasLiveBadge && roomId),
    roomId: roomId || null,
    title: rawTitle || `Live TikTok de @${username}`,
    url: liveUrl(username),
    imageUrl
  };
}

function buildTiktokNotificationPayload(source, liveInfo) {
  const mention = "@here";
  const short = liveInfo.url;
  const content = `${mention}\n**${source.displayName}** est en live sur TikTok ! 🔵\n${short}`;

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setAuthor({ name: "TikTok" })
    .setDescription(`**${source.displayName}**\n\n[${liveInfo.title}](${liveInfo.url})`);

  if (liveInfo.imageUrl) embed.setImage(liveInfo.imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Watch Live").setStyle(ButtonStyle.Link).setURL(liveInfo.url)
  );

  return {
    content,
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: ["here"] }
  };
}

async function sendTiktokNotification(channel, source, liveInfo) {
  const payload = buildTiktokNotificationPayload(source, liveInfo);
  await channel.send(payload);
}

async function pollOneSource(client, channel, source) {
  if (isFrozen()) return;
  const key = source.username.toLowerCase();
  const state = client.tiktokNotifyState?.get(key) || { wasLive: false, lastRoomId: null };
  let liveInfo;

  try {
    const html = await fetchProfileHtml(source.username);
    liveInfo = parseLiveInfoFromHtml(html, source.username);
  } catch (err) {
    console.warn(`[TIKTOK_NOTIFY] Erreur @${source.username}:`, err?.message || err);
    return;
  }

  if (!liveInfo.isLive) {
    if (state.wasLive) {
      client.tiktokNotifyState.set(key, { wasLive: false, lastRoomId: state.lastRoomId });
      console.log(`[TIKTOK_NOTIFY] @${source.username} n'est plus en live.`);
    }
    return;
  }

  const isNewLive = !state.wasLive || (liveInfo.roomId && state.lastRoomId !== liveInfo.roomId);
  if (!isNewLive) return;

  try {
    await sendTiktokNotification(channel, source, liveInfo);
    client.tiktokNotifyState.set(key, { wasLive: true, lastRoomId: liveInfo.roomId || state.lastRoomId });
    console.log(`[TIKTOK_NOTIFY] Notif envoyee pour @${source.username} (room ${liveInfo.roomId || "?"}).`);
  } catch (err) {
    console.error(`[TIKTOK_NOTIFY] Echec envoi @${source.username}:`, err?.message || err);
  }
}

async function runTiktokNotifyPoll(client) {
  if (client.tiktokNotifyPollRunning) return;
  client.tiktokNotifyPollRunning = true;
  try {
    const tn = config.tiktokNotify;
    if (!tn?.enabled) return;

    if (!client.tiktokNotifyState) client.tiktokNotifyState = new Map();

    const guild = await client.guilds.fetch(tn.guildId).catch(() => null);
    if (!guild) {
      console.warn(`[TIKTOK_NOTIFY] Guilde introuvable : ${tn.guildId}`);
      return;
    }

    const channel = await guild.channels.fetch(tn.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
      console.warn(`[TIKTOK_NOTIFY] Salon texte introuvable : ${tn.channelId}`);
      return;
    }

    const me = guild.members.me;
    if (!me) return;
    const perms = channel.permissionsFor(me);
    if (
      !perms?.has(PermissionFlagsBits.ViewChannel) ||
      !perms?.has(PermissionFlagsBits.SendMessages) ||
      !perms?.has(PermissionFlagsBits.EmbedLinks) ||
      !perms?.has(PermissionFlagsBits.MentionEveryone)
    ) {
      console.warn(
        "[TIKTOK_NOTIFY] Permissions bot insuffisantes (ViewChannel, SendMessages, EmbedLinks, MentionEveryone)."
      );
      return;
    }

    for (const source of tn.sources || []) {
      // eslint-disable-next-line no-await-in-loop
      await pollOneSource(client, channel, source);
    }
  } finally {
    client.tiktokNotifyPollRunning = false;
  }
}

function startTiktokNotifyPoller(client) {
  stopTiktokNotifyPoller(client);
  const tn = config.tiktokNotify;
  if (!tn?.enabled) return;

  const ms = Math.max(1, Number(tn.pollIntervalMinutes) || 2) * 60 * 1000;
  client.tiktokNotifyInterval = setInterval(() => {
    runTiktokNotifyPoll(client).catch(() => null);
  }, ms);

  setTimeout(() => {
    runTiktokNotifyPoll(client).catch(() => null);
  }, 20_000);

  console.log(`[TIKTOK_NOTIFY] Poller actif toutes les ${Math.max(1, Number(tn.pollIntervalMinutes) || 2)} min.`);
}

function stopTiktokNotifyPoller(client) {
  if (!client.tiktokNotifyInterval) return;
  clearInterval(client.tiktokNotifyInterval);
  client.tiktokNotifyInterval = null;
}

module.exports = {
  startTiktokNotifyPoller,
  stopTiktokNotifyPoller,
  runTiktokNotifyPoll,
  buildTiktokNotificationPayload
};
