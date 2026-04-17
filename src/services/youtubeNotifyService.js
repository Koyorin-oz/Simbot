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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Depuis certains hebergeurs, YouTube repond 404/403/5xx sans flux ; en-tetes « navigateur » + repli d’hote + retries. */
function youtubeRssHeaders() {
  return {
    "User-Agent": YT_UA,
    Accept: "application/atom+xml,application/xml,text/xml;q=0.9,text/html;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9,fr-FR,fr;q=0.8",
    Referer: "https://www.youtube.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "no-cache"
  };
}

const RSS_URL_BUILDERS = [
  (channelId) =>
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
  (channelId) => `https://youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
];

/** @type {Map<string, { lastLog: number; suppressed: number }>} */
const rssErrorThrottle = new Map();

function rssErrorLogIntervalMs() {
  return Math.max(5, Number(config.youtubeNotify?.rssErrorLogMinutes) || 30) * 60 * 1000;
}

function clearRssErrorThrottle(sourceKey) {
  rssErrorThrottle.delete(sourceKey);
}

function logRssErrorThrottled(sourceKey, displayName, message) {
  const now = Date.now();
  const prev = rssErrorThrottle.get(sourceKey);
  if (!prev || now - prev.lastLog >= rssErrorLogIntervalMs()) {
    const extra = prev?.suppressed ? ` (${prev.suppressed} echecs precedents non affiches)` : "";
    console.warn(`[YOUTUBE_NOTIFY] RSS ${displayName} (${sourceKey}): ${message}${extra}`);
    rssErrorThrottle.set(sourceKey, { lastLog: now, suppressed: 0 });
  } else {
    rssErrorThrottle.set(sourceKey, {
      lastLog: prev.lastLog,
      suppressed: (prev.suppressed || 0) + 1
    });
  }
}

/** Seules ces chaines (@handle sans @, minuscules) declenchent des notifs — pas de channelId arbitraire. */
const ALLOWED_NOTIFY_HANDLES = new Set(["carmineoff", "carminator.officiel"]);

/**
 * Jamais de notifs pour ces UC / handles (ex. https://www.youtube.com/@keketos = "kekos", deja confondu avec Carmine par erreur de scrape).
 */
const BLOCKED_NOTIFY_CHANNEL_IDS = new Set(["UCm-QUW51xALsYPv_DnUc40A"]);
const BLOCKED_NOTIFY_HANDLES = new Set(["keketos", "kekos"]);

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
    const pubM = block.match(/<published>([^<]+)<\/published>/);
    let publishedAt = null;
    if (pubM) {
      const d = new Date(String(pubM[1]).trim());
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }
    entries.push({ id: videoId, title, publishedAt });
  }
  return entries;
}

function youtubeChannelPageHeaders() {
  return {
    "User-Agent": YT_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr-FR,fr;q=0.8",
    Referer: "https://www.youtube.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1"
  };
}

/** Page HTML (@handle, etc.) — pas les memes Accept que le flux RSS. */
async function fetchText(url) {
  const res = await fetch(url, { headers: youtubeChannelPageHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/**
 * Telecharge le flux Atom RSS d’une chaine (UC…). Plusieurs URL + retries pour limiter 404/500 cote hebergeur.
 * @param {string} channelId
 */
async function fetchYoutubeRssXml(channelId) {
  const id = String(channelId || "").trim();
  if (!/^UC[\w-]{22}$/.test(id)) {
    throw new Error(`channelId RSS invalide: ${id}`);
  }

  const delaysMs = [0, 700, 1800, 4000];
  const retryable = (status) =>
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 504);

  let lastErr = "RSS YouTube: aucune reponse valide";

  for (let bi = 0; bi < RSS_URL_BUILDERS.length; bi++) {
    if (bi > 0) await sleep(900);
    const buildUrl = RSS_URL_BUILDERS[bi];
    const url = buildUrl(id);
    for (let attempt = 0; attempt < delaysMs.length; attempt++) {
      if (attempt > 0) await sleep(delaysMs[attempt]);
      try {
        const res = await fetch(url, { headers: youtubeRssHeaders() });
        const text = await res.text();
        if (res.ok) {
          if (text.includes("<entry") || (text.includes("<feed") && text.includes("yt:videoId"))) {
            return text;
          }
          lastErr = `HTTP ${res.status} corps invalide (pas Atom attendu)`;
          continue;
        }
        lastErr = `HTTP ${res.status} ${url}`;
        if (!retryable(res.status)) break;
      } catch (e) {
        lastErr = `${e?.message || e}`;
        await sleep(500);
      }
    }
  }

  throw new Error(lastErr);
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
  // Premier browseId = la page @handle consultee (le premier "channelId" peut etre une autre chaine du sidebar).
  const browseFirst = html.match(/"browseId":"(UC[\w-]{22})"/);
  if (browseFirst) return browseFirst[1];

  const patterns = [
    /"channelId":"(UC[\w-]{22})"/,
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
  const xml = await fetchYoutubeRssXml(sourceKey);
  clearRssErrorThrottle(sourceKey);
  const entries = parseYoutubeAtomEntries(xml);
  return entries.length ? entries[0] : null;
}

/** Resolve toutes les sources en { sourceKey, displayName } — uniquement handles autorises. */
async function resolveSources(sources) {
  const out = [];
  for (const s of sources) {
    const handleRaw = s.handle ? String(s.handle).replace(/^@/, "").trim() : "";
    const handleNorm = handleRaw.toLowerCase();

    if (!handleRaw) {
      if (s.channelId) {
        console.warn(
          "[YOUTUBE_NOTIFY] Source ignoree : `channelId` seul n'est pas autorise. Ajoute le handle @Carmineoff ou @Carminator.officiel."
        );
      }
      continue;
    }

    if (BLOCKED_NOTIFY_HANDLES.has(handleNorm)) {
      console.warn(`[YOUTUBE_NOTIFY] Handle @${handleRaw} sur liste noire — pas de notifs.`);
      continue;
    }

    if (!handleNorm || !ALLOWED_NOTIFY_HANDLES.has(handleNorm)) {
      console.warn(
        `[YOUTUBE_NOTIFY] Handle @${handleRaw} ignore — seules @Carmineoff et @Carminator.officiel sont autorisees.`
      );
      continue;
    }

    const explicit = String(s.channelId || "").trim();
    const id =
      explicit && /^UC[\w-]{22}$/.test(explicit)
        ? explicit
        : await resolveChannelIdFromHandle(handleRaw).catch(() => null);
    if (!id) {
      console.error(`[YOUTUBE_NOTIFY] Impossible de resoudre le handle @${handleRaw}`);
      continue;
    }
    if (!/^UC[\w-]{22}$/.test(id)) {
      console.error(`[YOUTUBE_NOTIFY] channelId invalide apres resolution @${handleRaw}`);
      continue;
    }
    if (BLOCKED_NOTIFY_CHANNEL_IDS.has(id)) {
      console.error(
        `[YOUTUBE_NOTIFY] channelId ${id} sur liste noire (@keketos / kekos) — source @${handleRaw} ignoree.`
      );
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
  let xml;
  try {
    xml = await fetchYoutubeRssXml(sourceKey);
    clearRssErrorThrottle(sourceKey);
  } catch (e) {
    logRssErrorThrottled(sourceKey, displayName, e?.message || String(e));
    return;
  }
  const entries = parseYoutubeAtomEntries(xml);
  if (!entries.length) return;

  const newestId = entries[0].id;
  const state = await prisma.youTubeNotifyState.findUnique({ where: { sourceKey } });

  const maxAgeMs =
    (Number(config.youtubeNotify?.maxVideoAgeHours) || 40) * 60 * 60 * 1000;
  const now = Date.now();

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
  /**
   * Si lastVideoId n'est plus dans le flux (RSS tronque), l'ancien code prenait entries[0] comme "nouveau"
   * et renvoyait une notif pour la derniere video du flux — souvent une video deja vieille (ex. hier).
   * On resynchronise le curseur sans notifier.
   */
  const toPost = idx === -1 ? [] : entries.slice(0, idx).reverse();
  if (idx === -1) {
    console.warn(
      `[YOUTUBE_NOTIFY] lastVideoId absent du flux (${displayName}, ${sourceKey}) — resync sans notif vers ${newestId}`
    );
  }

  for (const e of toPost) {
    if (isFrozen()) break;
    if (e.publishedAt && now - e.publishedAt.getTime() > maxAgeMs) {
      console.log(
        `[YOUTUBE_NOTIFY] Skip notif (publie il y a ${Math.round((now - e.publishedAt.getTime()) / 3600000)}h, max ${Math.round(maxAgeMs / 3600000)}h) ${displayName} ${e.id}`
      );
      continue;
    }
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
      console.error(`[YOUTUBE_NOTIFY] Poll ${src.displayName} (interne):`, err?.message || err);
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
