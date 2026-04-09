const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");
const config = require("../config");
const { isFrozen } = require("./simbotRuntimeService");

const YT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const RSS_BY_CHANNEL = (channelId) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

/** Seules ces chaines (@handle sans @, minuscules) declenchent des notifs — pas de channelId arbitraire. */
const ALLOWED_NOTIFY_HANDLES = new Set(["carmineoff", "carminator.officiel"]);

function decodeXmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Extrait les entrees du flux Atom YouTube (plus recent en premier). */
function parseYoutubeAtomEntries(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const vid = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!vid) continue;
    const videoId = vid[1].trim();
    const titleM = block.match(/<title(?:[^>]*)>([^<]*)<\/title>/);
    let title = titleM ? titleM[1].trim() : "Nouvelle video";
    title = decodeXmlEntities(title);
    entries.push({ id: videoId, title });
  }
  return entries;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": YT_UA, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/**
 * Resolve @handle -> channelId UC... (page chaine YouTube).
 */
async function resolveChannelIdFromHandle(handle) {
  const h = String(handle || "")
    .replace(/^@/, "")
    .trim();
  if (!h) return null;
  const url = `https://www.youtube.com/@${encodeURIComponent(h)}`;
  const html = await fetchText(url);
  const patterns = [
    /"channelId":"(UC[\w-]{22})"/,
    /"browseId":"(UC[\w-]{22})"/,
    /channel_id=(UC[\w-]{22})/,
    /\\"externalId\\":\\"(UC[\w-]{22})\\"/
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

function escapeForMarkdownLinkTitle(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\]/g, "\\]")
    .replace(/\[/g, "\\[")
    .slice(0, 220);
}

function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function youtuBeUrl(videoId) {
  return `https://youtu.be/${videoId}`;
}

function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Meme structure que NotifEye : texte + embed rouge (auteur YouTube, nom chaine, titre cliquable) + bouton.
 */
function buildYoutubeNotificationPayload(displayName, videoId, title) {
  const url = watchUrl(videoId);
  const short = youtuBeUrl(videoId);
  const content = `@everyone\n**${displayName}** vient de sortir une nouvelle vidéo ! ALLEZ LA VOIR, c'est un banger. 🤩\n${short}`;

  const titleSafe = escapeForMarkdownLinkTitle(title);
  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setAuthor({ name: "YouTube" })
    .setDescription(`**${displayName}**\n\n[${titleSafe}](${url})`)
    .setImage(thumbnailUrl(videoId));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Watch Video").setStyle(ButtonStyle.Link).setURL(url)
  );

  return {
    content,
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: ["everyone"] }
  };
}

async function sendYoutubeNotification(channel, displayName, videoId, title) {
  const payload = buildYoutubeNotificationPayload(displayName, videoId, title);
  await channel.send(payload);
}

/** Derniere video du flux RSS pour un channelId UC... */
async function fetchLatestVideoForSourceKey(sourceKey) {
  const xml = await fetchText(RSS_BY_CHANNEL(sourceKey));
  const entries = parseYoutubeAtomEntries(xml);
  return entries.length ? entries[0] : null;
}

/** Resolve toutes les sources en { sourceKey, displayName } — uniquement handles autorises. */
async function resolveSources(sources) {
  const out = [];
  for (const s of sources) {
    const handleRaw = s.handle ? String(s.handle).replace(/^@/, "").trim() : "";
    const handleNorm = handleRaw.toLowerCase();

    if (s.channelId && !handleRaw) {
      console.warn(
        "[YOUTUBE_NOTIFY] Source ignoree : `channelId` seul n'est pas autorise. Utilise @Carmineoff ou @Carminator.officiel (handle dans la config)."
      );
      continue;
    }

    if (!handleNorm || !ALLOWED_NOTIFY_HANDLES.has(handleNorm)) {
      if (handleRaw) {
        console.warn(
          `[YOUTUBE_NOTIFY] Handle @${handleRaw} ignore — seules @Carmineoff et @Carminator.officiel sont autorisees.`
        );
      }
      continue;
    }

    const id = await resolveChannelIdFromHandle(handleRaw).catch(() => null);
    if (!id) {
      console.error(`[YOUTUBE_NOTIFY] Impossible de resoudre le handle @${handleRaw}`);
      continue;
    }
    if (!/^UC[\w-]{22}$/.test(id)) {
      console.error(`[YOUTUBE_NOTIFY] channelId invalide apres resolution @${handleRaw}`);
      continue;
    }
    out.push({
      sourceKey: id,
      displayName: String(s.displayName || "YouTube").slice(0, 80)
    });
  }
  return out;
}

async function pollOneSource(client, prisma, channel, source) {
  const { sourceKey, displayName } = source;
  const xml = await fetchText(RSS_BY_CHANNEL(sourceKey));
  const entries = parseYoutubeAtomEntries(xml);
  if (!entries.length) return;

  const newestId = entries[0].id;
  const state = await prisma.youTubeNotifyState.findUnique({ where: { sourceKey } });

  if (!state?.lastVideoId) {
    await prisma.youTubeNotifyState.upsert({
      where: { sourceKey },
      create: { sourceKey, lastVideoId: newestId },
      update: { lastVideoId: newestId }
    });
    console.log(`[YOUTUBE_NOTIFY] Amorcage ${displayName} (${sourceKey}) -> ${newestId} (pas de notif)`);
    return;
  }

  if (state.lastVideoId === newestId) return;

  const idx = entries.findIndex((e) => e.id === state.lastVideoId);
  const toPost = idx === -1 ? [entries[0]] : entries.slice(0, idx).reverse();

  for (const e of toPost) {
    if (isFrozen()) break;
    await sendYoutubeNotification(channel, displayName, e.id, e.title).catch((err) => {
      console.error(`[YOUTUBE_NOTIFY] Envoi echoue (${displayName} ${e.id}):`, err?.message || err);
    });
  }

  await prisma.youTubeNotifyState.update({
    where: { sourceKey },
    data: { lastVideoId: newestId }
  });
}

async function runYoutubeNotifyPoll(client) {
  const yn = config.youtubeNotify;
  if (!yn?.enabled) return;

  const guild = await client.guilds.fetch(yn.guildId).catch(() => null);
  if (!guild) {
    console.warn(`[YOUTUBE_NOTIFY] Guilde introuvable : ${yn.guildId}`);
    return;
  }

  const channel = await guild.channels.fetch(yn.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.warn(`[YOUTUBE_NOTIFY] Salon texte introuvable : ${yn.channelId}`);
    return;
  }

  const me = guild.members.me;
  if (!me) return;
  const perms = channel.permissionsFor(me);
  if (
    !perms?.has(PermissionFlagsBits.ViewChannel) ||
    !perms?.has(PermissionFlagsBits.SendMessages) ||
    !perms?.has(PermissionFlagsBits.EmbedLinks)
  ) {
    console.warn("[YOUTUBE_NOTIFY] Permissions bot insuffisantes sur le salon notif.");
    return;
  }

  if (!perms?.has(PermissionFlagsBits.MentionEveryone)) {
    console.warn(
      "[YOUTUBE_NOTIFY] Donne au bot **Mentionner @everyone** sur le salon notif, sinon les messages @everyone peuvent echouer."
    );
  }

  const resolved = await resolveSources(yn.sources || []);
  if (!resolved.length) return;

  for (const src of resolved) {
    await pollOneSource(client, client.prisma, channel, src).catch((err) => {
      console.error(`[YOUTUBE_NOTIFY] Poll ${src.displayName}:`, err?.message || err);
    });
  }
}

function startYoutubeNotifyPoller(client) {
  stopYoutubeNotifyPoller(client);
  const yn = config.youtubeNotify;
  if (!yn?.enabled) return;

  const ms = yn.pollIntervalMinutes * 60 * 1000;
  client.youtubeNotifyInterval = setInterval(() => {
    runYoutubeNotifyPoll(client).catch(() => null);
  }, ms);

  setTimeout(() => {
    runYoutubeNotifyPoll(client).catch(() => null);
  }, 15_000);

  console.log(
    `[YOUTUBE_NOTIFY] Poller actif toutes les ${yn.pollIntervalMinutes} min -> salon ${yn.channelId}`
  );
}

function stopYoutubeNotifyPoller(client) {
  if (!client.youtubeNotifyInterval) return;
  clearInterval(client.youtubeNotifyInterval);
  client.youtubeNotifyInterval = null;
}

module.exports = {
  startYoutubeNotifyPoller,
  stopYoutubeNotifyPoller,
  runYoutubeNotifyPoll,
  resolveChannelIdFromHandle,
  buildYoutubeNotificationPayload,
  resolveYoutubeNotifySources: resolveSources,
  fetchLatestVideoForSourceKey
};
