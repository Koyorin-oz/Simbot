"use strict";

const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("fs");

const execFileAsync = promisify(execFile);
const config = require("../config");
const lavalink = require("./lavalinkService");

let voiceMod = null;
/** Lecture / recherche YouTube via play-dl (flux audio + decipher separes de ytdl-core). */
let play = null;
/** Secours si play-dl echoue (403, etc.). */
let ytdl = null;
let loadOk = false;
let loadErr = null;

/** Options YouTube : inclure WEB car sans lui, certains extraits n’ont aucun format (erreur « Failed to find any playable formats »). */
const YTDL_INFO_OPTIONS = {
  playerClients: ["WEB", "WEB_EMBEDDED", "IOS", "ANDROID", "TV"]
};

let cachedYtdlAgent = null;
let cachedYtdlAgentCookie = "";

/** Agent avec cookies (optionnel) pour YouTube : limite les 403 quand ytdl ne parvient pas a dechiffrer les URLs. */
function getYtdlAgent() {
  if (!ytdl) return undefined;
  const raw = String(config.music?.youtubeCookie || "").trim();
  if (!raw) {
    cachedYtdlAgent = null;
    cachedYtdlAgentCookie = "";
    return undefined;
  }
  if (cachedYtdlAgent && cachedYtdlAgentCookie === raw) return cachedYtdlAgent;
  const { CookieJar } = require("tough-cookie");
  const { addCookiesFromString } = require("@distube/ytdl-core/lib/agent");
  const jar = new CookieJar();
  addCookiesFromString(jar, raw);
  cachedYtdlAgent = ytdl.createAgent([], { cookies: { jar } });
  cachedYtdlAgentCookie = raw;
  return cachedYtdlAgent;
}

/** Options communes pour getInfo / getBasicInfo / downloadFromInfo */
function ytdlRequestOpts(extra = {}) {
  const o = {
    ...YTDL_INFO_OPTIONS,
    highWaterMark: 1 << 25,
    dlChunkSize: 0,
    ...extra
  };
  const ag = getYtdlAgent();
  if (ag) o.agent = ag;
  return o;
}

function applyPlayDlYoutubeCookie() {
  if (!play) return;
  const raw = String(config.music?.youtubeCookie || "").trim();
  if (!raw) return;
  try {
    play.setToken({ youtube: { cookie: raw } });
  } catch (e) {
    console.warn("[MUSIC] play-dl setToken", e?.message || e);
  }
}

function isYoutubeWatchUrl(u) {
  if (!play || !u) return false;
  return play.yt_validate(String(u).trim()) === "video";
}

/** youtu.be / shorts → watch?v= pour play-dl et yt-dlp. */
function normalizeYoutubeUrlInput(s) {
  const t = String(s || "").trim();
  const shorts = t.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (shorts) return `https://www.youtube.com/watch?v=${shorts[1]}`;
  const be = t.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (be) return `https://www.youtube.com/watch?v=${be[1]}`;
  return t;
}

function loadDeps() {
  if (voiceMod === false) return false;
  if (loadOk) return true;
  try {
    const ffmpegPath = require("ffmpeg-static");
    if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
    play = require("play-dl");
    ytdl = require("@distube/ytdl-core");
    voiceMod = require("@discordjs/voice");
    applyPlayDlYoutubeCookie();
    loadOk = true;
    loadErr = null;
    return true;
  } catch (e) {
    loadErr = e;
    voiceMod = false;
    loadOk = false;
    return false;
  }
}

/** @type {Map<string, { queue: Array<{ title: string, url: string, requesterId: string }>, volume: number, textChannelId: string | null, player: *, connection: *, lavalinkPlayer: import('shoukaku').Player | null, ytDlpProcess: import('child_process').ChildProcess | null, nowPlaying: { title: string, url: string, requesterId: string } | null }>} */
const guildStates = new Map();

let ytDlpMissingLogged = false;

function killActiveYtDlp(st) {
  if (!st?.ytDlpProcess) return;
  try {
    st.ytDlpProcess.removeAllListeners?.();
    st.ytDlpProcess.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  st.ytDlpProcess = null;
}

/** Binaire yt-dlp : YT_DLP_PATH ou celui installe avec youtube-dl-exec (postinstall npm). */
function resolveYtDlpBinary() {
  const custom = String(config.music?.ytDlpBinaryPath || "").trim();
  if (custom && fs.existsSync(custom)) return custom;
  try {
    const { constants } = require("youtube-dl-exec");
    if (constants?.YOUTUBE_DL_PATH && fs.existsSync(constants.YOUTUBE_DL_PATH)) {
      return constants.YOUTUBE_DL_PATH;
    }
  } catch {
    /* ignore */
  }
  if (!ytDlpMissingLogged) {
    ytDlpMissingLogged = true;
    console.warn(
      "[MUSIC] Aucun binaire yt-dlp trouve. Apres `npm install`, le paquet youtube-dl-exec place yt-dlp dans node_modules/youtube-dl-exec/bin — ou definis YT_DLP_PATH."
    );
  }
  return null;
}

/**
 * Flux audio stdout (sans passer par le wrapper youtube-dl-exec qui bufferise stdout).
 * Client Android souvent plus tolerant que le player WEB pour les 403.
 */
function spawnYtDlpAudioStdout(url) {
  const bin = resolveYtDlpBinary();
  if (!bin) return null;
  const cookie = String(config.music?.youtubeCookie || "").trim();
  const args = [
    "-f",
    "bestaudio/best/worst",
    "-o",
    "-",
    "--no-warnings",
    "--no-playlist",
    "--quiet",
    "--no-check-certificates",
    "--extractor-args",
    "youtube:player_client=android,web",
    "--socket-timeout",
    "30"
  ];
  if (cookie) {
    args.push("--add-header", `Cookie:${cookie.replace(/\r|\n/g, "")}`);
  }
  args.push(String(url).trim());
  return spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

function ytDlpCookieHeaderArgs() {
  const cookie = String(config.music?.youtubeCookie || "").trim();
  if (!cookie) return [];
  return ["--add-header", `Cookie:${cookie.replace(/\r|\n/g, "")}`];
}

/** Recherche YouTube via yt-dlp quand play-dl echoue ou ne renvoie rien d’exploitable. */
async function ytDlpSearchFirstVideo(query) {
  const bin = resolveYtDlpBinary();
  if (!bin) return null;
  const q = String(query || "").trim();
  if (!q) return null;
  const args = [
    ...ytDlpCookieHeaderArgs(),
    "-J",
    "--flat-playlist",
    "--playlist-items",
    "1",
    "--no-warnings",
    "--socket-timeout",
    "25",
    "--extractor-args",
    "youtube:player_client=android,web",
    `ytsearch10:${q}`
  ];
  try {
    const { stdout } = await execFileAsync(bin, args, {
      maxBuffer: 6 * 1024 * 1024,
      timeout: 40_000,
      windowsHide: true
    });
    let j = JSON.parse(stdout);
    if (j._type === "playlist" && Array.isArray(j.entries) && j.entries.length) {
      j = j.entries[0];
    }
    const id = j.id;
    const title = j.title;
    const pageUrl = j.webpage_url && String(j.webpage_url);
    const url = pageUrl || (id ? `https://www.youtube.com/watch?v=${id}` : "");
    if (!url || !/^https?:\/\//i.test(url)) return null;
    return { title: title || q, url };
  } catch (e) {
    console.warn("[MUSIC] yt-dlp search", String(e?.message || e).slice(0, 180));
    return null;
  }
}

/** Metadonnees lien YouTube si play-dl ne peut pas lire la page. */
async function ytDlpProbeYoutubeUrl(pageUrl) {
  const bin = resolveYtDlpBinary();
  if (!bin) return null;
  const u = String(pageUrl || "").trim();
  if (!u) return null;
  const args = [
    ...ytDlpCookieHeaderArgs(),
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "25",
    "--extractor-args",
    "youtube:player_client=android,web",
    u
  ];
  try {
    const { stdout } = await execFileAsync(bin, args, {
      maxBuffer: 6 * 1024 * 1024,
      timeout: 40_000,
      windowsHide: true
    });
    const j = JSON.parse(stdout);
    const id = j.id;
    const title = j.title;
    const wp = j.webpage_url && String(j.webpage_url);
    const outUrl = wp || (id ? `https://www.youtube.com/watch?v=${id}` : "");
    if (!outUrl || !/^https?:\/\//i.test(outUrl)) return null;
    return { title: title || "YouTube", url: outUrl };
  } catch {
    return null;
  }
}

let spotifyToken = null;
let spotifyTokenExp = 0;

function isEnabled() {
  return Boolean(config.music?.enabled);
}

function getState(guildId) {
  const id = String(guildId);
  if (!guildStates.has(id)) {
    guildStates.set(id, {
      queue: [],
      volume: 100,
      textChannelId: null,
      player: null,
      connection: null,
      lavalinkPlayer: null,
      ytDlpProcess: null,
      nowPlaying: null
    });
  }
  return guildStates.get(id);
}

const VOLUME_MIN = 5;
const VOLUME_MAX = 100;
const VOLUME_NUDGE = 10;

function applyVolumeToActivePlayback(st) {
  const vol01 = Math.min(1, Math.max(0, st.volume / 100));
  if (st.lavalinkPlayer?.track) {
    st.lavalinkPlayer
      .setGlobalVolume(Math.min(1000, Math.max(0, Math.round(st.volume * 10))))
      .catch(() => null);
  }
  if (loadOk && voiceMod && st.player) {
    const { AudioPlayerStatus } = voiceMod;
    const s = st.player.state.status;
    if (
      s === AudioPlayerStatus.Playing ||
      s === AudioPlayerStatus.Paused ||
      s === AudioPlayerStatus.Buffering
    ) {
      const res = st.player.state.resource;
      if (res?.volume) res.volume.setVolume(vol01);
    }
  }
}

function pauseGuild(guildId) {
  const st = getState(guildId);
  if (st.lavalinkPlayer) {
    if (!st.lavalinkPlayer.track) return { error: "Rien en lecture." };
    if (st.lavalinkPlayer.paused) return { error: "Deja en pause." };
    st.lavalinkPlayer.setPaused(true).catch(() => null);
    return { ok: true };
  }
  if (!loadOk || !voiceMod) return { error: "Musique inactive." };
  const { AudioPlayerStatus } = voiceMod;
  if (!st.player) return { error: "Rien en lecture." };
  const status = st.player.state.status;
  if (status !== AudioPlayerStatus.Playing && status !== AudioPlayerStatus.Buffering) {
    return { error: "Rien a mettre en pause (ou deja en pause)." };
  }
  const ok = st.player.pause();
  return ok ? { ok: true } : { error: "Pause impossible." };
}

function resumeGuild(guildId) {
  const st = getState(guildId);
  if (st.lavalinkPlayer) {
    if (!st.lavalinkPlayer.track) return { error: "Rien en lecture." };
    if (!st.lavalinkPlayer.paused) return { error: "La lecture n'est pas en pause." };
    st.lavalinkPlayer.setPaused(false).catch(() => null);
    return { ok: true };
  }
  if (!loadOk || !voiceMod) return { error: "Musique inactive." };
  const { AudioPlayerStatus } = voiceMod;
  if (!st.player) return { error: "Rien en lecture." };
  if (st.player.state.status !== AudioPlayerStatus.Paused) {
    return { error: "La lecture n'est pas en pause." };
  }
  st.player.unpause();
  return { ok: true };
}

async function restartCurrentTrackGuild(guildId) {
  const st = getState(guildId);
  if (!st.nowPlaying?.url) return { error: "Aucun morceau en cours." };
  if (st.lavalinkPlayer?.track) {
    try {
      await st.lavalinkPlayer.seekTo(0);
      return { ok: true };
    } catch (e) {
      return { error: `Impossible de revenir au debut : ${e?.message || e}` };
    }
  }
  if (!loadOk || !voiceMod || !st.player) return { error: "Musique inactive." };
  const { AudioPlayerStatus } = voiceMod;
  const status = st.player.state.status;
  if (
    status !== AudioPlayerStatus.Playing &&
    status !== AudioPlayerStatus.Paused &&
    status !== AudioPlayerStatus.Buffering
  ) {
    return { error: "Rien en lecture." };
  }
  killActiveYtDlp(st);
  st.queue.unshift({
    title: st.nowPlaying.title,
    url: st.nowPlaying.url,
    requesterId: st.nowPlaying.requesterId || "0"
  });
  st.player.stop(true);
  return { ok: true };
}

function setGuildVolume(guildId, percent) {
  const st = getState(guildId);
  const n = Number(percent);
  if (!Number.isFinite(n)) return { error: "Nombre invalide." };
  const v = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(n)));
  st.volume = v;
  applyVolumeToActivePlayback(st);
  return { ok: true, volume: v };
}

function nudgeGuildVolume(guildId, delta) {
  const st = getState(guildId);
  const v = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, st.volume + delta));
  st.volume = v;
  applyVolumeToActivePlayback(st);
  return { ok: true, volume: v };
}

function getGuildVolume(guildId) {
  return getState(guildId).volume;
}

function wireLavalinkPlayer(guild, player) {
  player.removeAllListeners("end");
  player.removeAllListeners("exception");
  player.on("end", (ev) => {
    if (ev.reason === "replaced") return;
    playNext(guild).catch(() => null);
  });
  player.on("exception", (ev) => {
    console.error("[MUSIC] Lavalink exception", ev?.exception?.message || ev);
    playNext(guild).catch(() => null);
  });
}

function isPlaybackIdle(st) {
  if (st.lavalinkPlayer) {
    return !st.lavalinkPlayer.track;
  }
  if (!loadOk || !voiceMod) return true;
  const { AudioPlayerStatus } = voiceMod;
  const status = st.player?.state?.status;
  return !st.player || status === AudioPlayerStatus.Idle;
}

function getVoiceChannelForMember(member) {
  const ch = member?.voice?.channel;
  if (!ch?.isVoiceBased?.()) return { error: "Tu dois etre dans un **salon vocal**." };
  return { channel: ch };
}

/**
 * Depuis le panneau vocal prive : le membre doit etre dans le salon session (si defini).
 */
function getVoiceForPrivatePanel(member, client, guildId, ownerId) {
  const base = getVoiceChannelForMember(member);
  if (base.error) return base;
  const s = client.privateRoomSessions?.get(`${guildId}:${ownerId}`);
  if (s?.voiceChannelId && base.channel.id !== s.voiceChannelId) {
    return {
      error: "Connecte-toi dans **ton** salon vocal prive pour utiliser la musique depuis ce panneau."
    };
  }
  return base;
}

/**
 * Vocal enregistre comme salon prive (session bot) → retourne l’userId owner.
 */
function getPrivateRoomOwnerIdForVoiceChannel(client, guildId, voiceChannelId) {
  if (!client?.privateRoomSessions || !voiceChannelId) return null;
  const g = String(guildId);
  const vc = String(voiceChannelId);
  for (const [key, s] of client.privateRoomSessions.entries()) {
    if (!key.startsWith(`${g}:`)) continue;
    if (String(s?.voiceChannelId || "") !== vc) continue;
    const ownerId = key.slice(g.length + 1);
    if (/^\d{17,20}$/.test(ownerId)) return ownerId;
  }
  return null;
}

function memberHasPrivateRoomMusicBypass(member) {
  const roleId = String(config.music?.privateRoomStaffBypassRoleId || "").trim();
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

/**
 * Si le membre est dans un vocal prive du bot : owner ou staff bypass uniquement.
 */
function assertPrivateRoomMusicAccess(member, client, guildId, channel) {
  if (!member || !channel?.id) return { ok: true };
  if (memberHasPrivateRoomMusicBypass(member)) return { ok: true };
  const ownerId = getPrivateRoomOwnerIdForVoiceChannel(client, guildId, channel.id);
  if (!ownerId) return { ok: true };
  if (member.id === ownerId) return { ok: true };
  return {
    error:
      "Seul le **proprietaire** de ce salon vocal prive peut lancer la musique ici. Les **membres staff** (role configure) peuvent aussi, sans limite."
  };
}

async function getSpotifyToken() {
  const cid = config.music?.spotifyClientId;
  const sec = config.music?.spotifyClientSecret;
  if (!cid || !sec) return null;
  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExp - 30_000) return spotifyToken;
  const auth = Buffer.from(`${cid}:${sec}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[MUSIC] Spotify token refusé HTTP", res.status, t.slice(0, 220));
    return null;
  }
  const j = await res.json();
  spotifyToken = j.access_token;
  spotifyTokenExp = now + (j.expires_in || 3600) * 1000;
  return spotifyToken;
}

async function spotifyFetch(path) {
  const token = await getSpotifyToken();
  if (!token) return { error: "Spotify API non configuree (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET dans .env)." };
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { error: `Spotify: ${res.status} ${t.slice(0, 120)}` };
  }
  return { data: await res.json() };
}

async function spotifyFetchAbsolute(fullUrl) {
  const token = await getSpotifyToken();
  if (!token) return { error: "Spotify API non configuree (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET dans .env)." };
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { error: `Spotify: ${res.status} ${t.slice(0, 120)}` };
  }
  return { data: await res.json() };
}

function spotifyMetaFromTrack(tr) {
  if (!tr || tr.is_local) return null;
  const name = tr.name;
  const artist = tr.artists?.[0]?.name || "";
  if (!name) return null;
  return { title: `${artist} — ${name}`, searchQuery: `${artist} ${name}`.trim() };
}

async function youtubeSearchOne(query) {
  const q = String(query || "").trim();
  if (!q) return { error: "Recherche vide." };
  applyPlayDlYoutubeCookie();
  let videos;
  try {
    videos = await play.search(q, { limit: 12, source: { youtube: "video" } });
  } catch (e) {
    console.warn("[MUSIC] play-dl search", e?.message || e);
    const ytd = await ytDlpSearchFirstVideo(q);
    if (ytd?.url) return ytd;
    return { error: `YouTube : ${String(e.message || e).slice(0, 180)}` };
  }
  if (!videos?.length) {
    const ytd = await ytDlpSearchFirstVideo(q);
    if (ytd?.url) return ytd;
    return { error: `Aucun resultat YouTube pour : ${q.slice(0, 80)}` };
  }
  const pick =
    videos.find((v) => v?.url && isYoutubeWatchUrl(v.url) && !v.live) ||
    videos.find((v) => v?.url && isYoutubeWatchUrl(v.url)) ||
    null;
  if (!pick?.url) {
    const ytd = await ytDlpSearchFirstVideo(q);
    if (ytd?.url) return ytd;
    return { error: `Aucun resultat YouTube pour : ${q.slice(0, 80)}` };
  }
  return { title: pick.title || q, url: pick.url };
}

/**
 * @returns {Promise<{ tracks?: Array<{ title: string, url: string }>, error?: string }>}
 */
async function resolveQueryToYoutubeTracks(query, guild = null) {
  let raw = normalizeYoutubeUrlInput(String(query || "").trim());
  if (!raw) return { error: "Texte vide." };

  const maxPl = config.music?.maxPlaylistTracks ?? 25;
  if (guild?.client) {
    const fromLl = await lavalink.tryResolveQueryWithLavalink(guild.client, raw, maxPl);
    if (fromLl?.tracks?.length) {
      return { tracks: fromLl.tracks };
    }
  }

  if (isYoutubeWatchUrl(raw)) {
    applyPlayDlYoutubeCookie();
    let info;
    try {
      info = await play.video_basic_info(raw);
    } catch (e) {
      console.warn("[MUSIC] play-dl video_basic_info", e?.message || e);
      const probe = await ytDlpProbeYoutubeUrl(raw);
      if (probe?.url) return { tracks: [{ title: probe.title, url: probe.url }] };
      return { error: `Lien YouTube invalide ou indisponible : ${e.message || e}` };
    }
    const title = info?.video_details?.title || "YouTube";
    return { tracks: [{ title, url: raw }] };
  }

  const spotifyPlaylist = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/);
  if (spotifyPlaylist) {
    const id = spotifyPlaylist[1];
    const max = config.music?.maxPlaylistTracks ?? 25;
    const out = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`;
    while (nextUrl && out.length < max) {
      const page = await spotifyFetchAbsolute(nextUrl);
      if (page.error) return { error: page.error };
      const items = page.data.items || [];
      for (const it of items) {
        const tr = it.track;
        const meta = spotifyMetaFromTrack(tr);
        if (!meta) continue;
        const y = await youtubeSearchOne(meta.searchQuery);
        if (!y.error) out.push({ title: y.title, url: y.url });
        if (out.length >= max) break;
      }
      nextUrl = out.length < max && page.data.next ? page.data.next : null;
    }
    if (!out.length) return { error: "Playlist Spotify vide ou introuvable (ou pas de morceaux resolvables)." };
    return { tracks: out };
  }

  const spotifyAlbum = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/);
  if (spotifyAlbum) {
    const id = spotifyAlbum[1];
    const max = config.music?.maxPlaylistTracks ?? 25;
    const alb = await spotifyFetch(`/albums/${id}`);
    if (alb.error) return { error: alb.error };
    const tracks = alb.data.tracks?.items || [];
    const out = [];
    for (const tr of tracks) {
      const meta = spotifyMetaFromTrack(tr);
      if (!meta) continue;
      const y = await youtubeSearchOne(meta.searchQuery);
      if (!y.error) out.push({ title: y.title, url: y.url });
      if (out.length >= max) break;
    }
    if (!out.length) return { error: "Album Spotify vide ou introuvable." };
    return { tracks: out };
  }

  const spotifyTrack = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/);
  if (spotifyTrack) {
    const id = spotifyTrack[1];
    const tr = await spotifyFetch(`/tracks/${id}`);
    if (tr.error) return { error: tr.error };
    const meta = spotifyMetaFromTrack(tr.data);
    if (!meta) return { error: "Morceau Spotify introuvable." };
    const y = await youtubeSearchOne(meta.searchQuery);
    if (y.error) return { error: y.error };
    return { tracks: [{ title: y.title, url: y.url }] };
  }

  const y = await youtubeSearchOne(raw);
  if (y.error) return { error: y.error };
  return { tracks: [{ title: y.title, url: y.url }] };
}

function isDirectPlayQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return false;
  if (/open\.spotify\.com\//i.test(q)) return true;
  const norm = normalizeYoutubeUrlInput(q);
  if (loadDeps() && (isYoutubeWatchUrl(norm) || isYoutubeWatchUrl(q))) return true;
  return false;
}

/**
 * @returns {Promise<Array<{ kind: string, title: string, url?: string, spotifySearch?: string }>>}
 */
async function searchMixedCandidates(query) {
  if (!loadDeps()) return [];
  const q = String(query || "").trim();
  if (!q) return [];
  const out = [];
  try {
    applyPlayDlYoutubeCookie();
    const videos = await play.search(q, { limit: 5, source: { youtube: "video" } });
    for (const v of videos) {
      if (v?.url && isYoutubeWatchUrl(v.url)) {
        out.push({ kind: "youtube", title: v.title || "Video", url: v.url });
      }
    }
  } catch (e) {
    console.error("[MUSIC] youtube search", e?.message || e);
    const ytd = await ytDlpSearchFirstVideo(q);
    if (ytd?.url) {
      out.push({ kind: "youtube", title: ytd.title, url: ytd.url });
    }
  }
  const token = await getSpotifyToken();
  if (token) {
    try {
      const enc = encodeURIComponent(q);
      const res = await fetch(`https://api.spotify.com/v1/search?q=${enc}&type=track&limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const j = await res.json();
        for (const tr of j.tracks?.items || []) {
          const meta = spotifyMetaFromTrack(tr);
          if (meta) {
            out.push({
              kind: "spotify",
              title: meta.title,
              spotifySearch: meta.searchQuery
            });
          }
        }
      }
    } catch (e) {
      console.error("[MUSIC] spotify search", e?.message || e);
    }
  }
  return out;
}

/**
 * @param {{ kind: string, title: string, url?: string, spotifySearch?: string }} choice
 */
async function resolveCandidateChoice(choice) {
  if (!loadDeps()) return { error: "Module musique indisponible." };
  if (choice.url && isYoutubeWatchUrl(choice.url)) {
    return {
      title: choice.title,
      url: choice.url,
      source: choice.kind === "spotify" ? "spotify_pick" : "youtube_pick"
    };
  }
  if (choice.spotifySearch) {
    const y = await youtubeSearchOne(choice.spotifySearch);
    if (y.error) return { error: y.error };
    return { title: y.title, url: y.url, source: "spotify_resolve" };
  }
  return { error: "Choix invalide." };
}

function guessSourceFromQuery(q) {
  const s = String(q || "");
  if (/open\.spotify\.com\/.*playlist/i.test(s)) return "spotify_playlist";
  if (/open\.spotify\.com\/.*album/i.test(s)) return "spotify_album";
  if (/open\.spotify\.com\/.*track/i.test(s)) return "spotify_track";
  if (/youtube\.com|youtu\.be/i.test(s) && /playlist\?|list=/i.test(s)) return "youtube_playlist";
  return "youtube";
}

async function recordPlayHistory(prisma, guildId, userId, tracks) {
  if (!prisma?.musicPlayHistory?.createMany || !tracks.length) return;
  try {
    await prisma.musicPlayHistory.createMany({
      data: tracks.map((t) => ({
        guildId,
        userId,
        title: String(t.title).slice(0, 400),
        url: String(t.url).slice(0, 400),
        source: String(t.source || "youtube").slice(0, 40)
      }))
    });
  } catch (e) {
    console.error("[MUSIC] recordPlayHistory", e?.message || e);
  }
}

async function getUserPlayHistoryUnique(prisma, guildId, userId, limit = 25) {
  const rows = await prisma.musicPlayHistory.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(120, limit * 5)
  });
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({ title: r.title, url: r.url, source: r.source });
    if (out.length >= limit) break;
  }
  return out;
}

async function playNextLavalink(guild, failDepth = 0) {
  if (failDepth > 12) return;
  const st = getState(guild.id);
  const player = st.lavalinkPlayer;
  if (!player) return;
  const next = st.queue.shift();
  if (!next) {
    st.nowPlaying = null;
    try {
      await player.stopTrack();
    } catch {
      /* ignore */
    }
    return;
  }
  let res;
  try {
    res = await player.node.rest.resolve(next.url);
  } catch (e) {
    console.error("[MUSIC] Lavalink resolve (file)", e?.message || e);
    await playNextLavalink(guild, failDepth + 1);
    return;
  }
  const encoded = lavalink.extractEncodedFromResolve(res);
  if (!encoded) {
    await playNextLavalink(guild, failDepth + 1);
    return;
  }
  try {
    await player.playTrack({
      track: { encoded },
      volume: Math.min(1000, Math.max(0, Math.round(st.volume * 10)))
    });
    st.nowPlaying = {
      title: next.title,
      url: next.url,
      requesterId: next.requesterId || "0"
    };
    try {
      const musicPlaylist = require("./musicPlaylistService");
      void musicPlaylist.autoAppendPlayedTrack(
        guild.client?.prisma,
        guild.id,
        next.requesterId || "0",
        next.title,
        next.url
      );
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.error("[MUSIC] Lavalink playTrack", e?.message || e);
    await playNextLavalink(guild, failDepth + 1);
  }
}

async function playNext(guild, failDepth = 0) {
  if (failDepth > 12) return;
  const st = getState(guild.id);
  if (st.lavalinkPlayer && lavalink.isLavalinkUsable(guild.client)) {
    await playNextLavalink(guild, failDepth);
    return;
  }
  if (!loadOk || !voiceMod || !play || !ytdl) return;
  if (!st.player || !st.connection) return;
  const next = st.queue.shift();
  killActiveYtDlp(st);
  if (!next) {
    st.nowPlaying = null;
    return;
  }

  applyPlayDlYoutubeCookie();

  const markPlaying = () => {
    st.nowPlaying = {
      title: next.title,
      url: next.url,
      requesterId: next.requesterId || "0"
    };
    try {
      const musicPlaylist = require("./musicPlaylistService");
      void musicPlaylist.autoAppendPlayedTrack(
        guild.client?.prisma,
        guild.id,
        next.requesterId || "0",
        next.title,
        next.url
      );
    } catch {
      /* ignore */
    }
  };

  try {
    try {
      const proc = spawnYtDlpAudioStdout(next.url);
      if (proc?.stdout) {
        st.ytDlpProcess = proc;
        proc.stderr?.on("data", (buf) => {
          const line = buf.toString().trim().split("\n").pop();
          if (line && !/^\[download\]/.test(line)) {
            console.warn("[MUSIC] yt-dlp stderr:", line.slice(0, 220));
          }
        });
        proc.on("error", (err) => {
          console.error("[MUSIC] yt-dlp", err?.message || err);
          if (st.ytDlpProcess === proc) st.ytDlpProcess = null;
        });
        proc.on("exit", (code, sig) => {
          if (code && code !== 0 && sig !== "SIGKILL") {
            console.warn("[MUSIC] yt-dlp exit", code, sig || "");
          }
          if (st.ytDlpProcess === proc) st.ytDlpProcess = null;
        });
        const resource = voiceMod.createAudioResource(proc.stdout, {
          inputType: voiceMod.StreamType.Arbitrary,
          inlineVolume: true
        });
        if (resource.volume) resource.volume.setVolume(Math.min(1, Math.max(0, st.volume / 100)));
        st.player.play(resource);
        markPlaying();
        return;
      }
    } catch (ytDlpErr) {
      console.warn("[MUSIC] playNext yt-dlp (1er essai)", ytDlpErr?.message || ytDlpErr);
      killActiveYtDlp(st);
    }

    try {
      const src = await play.stream(next.url, { discordPlayerCompatibility: true });
      const body = src.stream;
      const t = String(src.type || "arbitrary");
      const inputType =
        t === "webm/opus"
          ? voiceMod.StreamType.WebmOpus
          : t === "ogg/opus"
            ? voiceMod.StreamType.OggOpus
            : voiceMod.StreamType.Arbitrary;
      const resource = voiceMod.createAudioResource(body, {
        inputType,
        inlineVolume: true
      });
      if (resource.volume) resource.volume.setVolume(Math.min(1, Math.max(0, st.volume / 100)));
      st.player.play(resource);
      markPlaying();
      return;
    } catch (playDlErr) {
      console.warn("[MUSIC] playNext play-dl a echoue -> ytdl-core :", playDlErr?.message || playDlErr);
    }

    const dlBase = ytdlRequestOpts();
    const formatStrategies = [
      { label: "audioandvideo+lowest", opts: { filter: "audioandvideo", quality: "lowest" } },
      { label: "audioandvideo+highest", opts: { filter: "audioandvideo", quality: "highest" } },
      { label: "audio+highestaudio", opts: { filter: "audio", quality: "highestaudio" } },
      { label: "audioonly+highestaudio", opts: { filter: "audioonly", quality: "highestaudio" } },
      { label: "any+highest", opts: { quality: "highest" } }
    ];

    let info;
    try {
      info = await ytdl.getInfo(next.url, dlBase);
    } catch (e) {
      console.error("[MUSIC] playNext getInfo (fallback)", e?.message || e);
      await playNext(guild, failDepth + 1);
      return;
    }

    let lastAttemptErr = null;
    for (let i = 0; i < formatStrategies.length; i++) {
      const { label, opts } = formatStrategies[i];
      let format;
      try {
        format = ytdl.chooseFormat(info.formats, opts);
      } catch (e) {
        lastAttemptErr = e;
        continue;
      }
      if (!format?.url) continue;

      try {
        const raw = ytdl.downloadFromInfo(info, { ...dlBase, format });
        let stream;
        let inputType;
        try {
          const probed = await voiceMod.demuxProbe(raw);
          stream = probed.stream;
          inputType = probed.type;
        } catch (probeErr) {
          try {
            raw.destroy?.();
          } catch {
            /* ignore */
          }
          console.warn("[MUSIC] playNext demuxProbe -> Arbitrary", label, probeErr?.message || probeErr);
          stream = ytdl.downloadFromInfo(info, { ...dlBase, format });
          inputType = voiceMod.StreamType.Arbitrary;
        }

        if (i > 0) {
          console.warn("[MUSIC] playNext format strategy (ytdl)", label);
        }

        const resource = voiceMod.createAudioResource(stream, {
          inputType,
          inlineVolume: true
        });
        if (resource.volume) resource.volume.setVolume(Math.min(1, Math.max(0, st.volume / 100)));
        st.player.play(resource);
        markPlaying();
        return;
      } catch (e) {
        lastAttemptErr = e;
        console.warn("[MUSIC] playNext ytdl strategy failed", label, e?.message || e);
      }
    }

    console.error("[MUSIC] playNext no playable strategy", lastAttemptErr?.message || lastAttemptErr);
    await playNext(guild, failDepth + 1);
  } catch (e) {
    console.error("[MUSIC] playNext", e?.message || e);
    await playNext(guild, failDepth + 1);
  }
}

function ensurePlayer(guild) {
  const st = getState(guild.id);
  if (st.player) return st.player;
  const { createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior } = voiceMod;
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });
  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guild).catch(() => null);
  });
  player.on("error", (err) => {
    console.error("[MUSIC] player error", err?.message || err);
    playNext(guild).catch(() => null);
  });
  st.player = player;
  return player;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').VoiceBasedChannel} channel
 * @param {{ member?: import('discord.js').GuildMember, client?: import('discord.js').Client }} [options]
 */
async function joinChannel(guild, channel, options = {}) {
  const { member, client } = options;
  if (member && client) {
    const gate = assertPrivateRoomMusicAccess(member, client, guild.id, channel);
    if (gate.error) return { error: gate.error };
  }

  if (lavalink.isLavalinkConfigured() && client?.shoukaku && !lavalink.isLavalinkUsable(client)) {
    console.warn(
      "[MUSIC] Lavalink configure mais noeud hors ligne ou non pret — connexion vocale en mode natif (play-dl / yt-dlp). Ajoute MUSIC_FORCE_NATIVE=true pour ignorer Lavalink."
    );
  }

  if (lavalink.isLavalinkUsable(client)) {
    if (loadOk && voiceMod) {
      try {
        voiceMod.getVoiceConnection(guild.id)?.destroy();
      } catch {
        /* ignore */
      }
    }
    const stLl = getState(guild.id);
    if (stLl.player) {
      try {
        stLl.player.stop(true);
        stLl.player.removeAllListeners();
      } catch {
        /* ignore */
      }
      stLl.player = null;
    }
    stLl.connection = null;

    const sh = client.shoukaku;
    const existingConn = sh.connections.get(guild.id);
    if (existingConn && existingConn.channelId === channel.id) {
      const existingPlayer = sh.players.get(guild.id);
      if (existingPlayer) {
        stLl.lavalinkPlayer = existingPlayer;
        wireLavalinkPlayer(guild, existingPlayer);
        return { ok: true, connection: null };
      }
    }
    if (sh.connections.has(guild.id) || sh.players.has(guild.id)) {
      await sh.leaveVoiceChannel(guild.id).catch(() => {});
    }
    stLl.lavalinkPlayer = null;

    const shardId = guild.shardId ?? 0;
    try {
      const player = await sh.joinVoiceChannel({
        guildId: guild.id,
        shardId,
        channelId: channel.id,
        deaf: true,
        mute: false
      });
      stLl.lavalinkPlayer = player;
      wireLavalinkPlayer(guild, player);
      return { ok: true, connection: null };
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[MUSIC] Lavalink join", msg);
      return {
        error: `Lavalink : impossible de rejoindre le vocal (${msg.slice(0, 140)}). Verifie que le serveur Lavalink est demarre et joignable depuis ce bot.`
      };
    }
  }

  if (!loadDeps()) {
    return { error: loadErr?.message ? `Module musique indisponible : ${loadErr.message}` : "Module musique indisponible." };
  }

  const st0 = getState(guild.id);
  if (client?.shoukaku && (client.shoukaku.players.has(guild.id) || client.shoukaku.connections.has(guild.id))) {
    await client.shoukaku.leaveVoiceChannel(guild.id).catch(() => {});
  }
  st0.lavalinkPlayer = null;

  const {
    joinVoiceChannel,
    getVoiceConnection,
    VoiceConnectionStatus,
    entersState
  } = voiceMod;

  const existing = getVoiceConnection(guild.id);
  if (existing && existing.joinConfig.channelId === channel.id) {
    const st = getState(guild.id);
    const player = ensurePlayer(guild);
    try {
      existing.subscribe(player);
    } catch {
      /* ignore */
    }
    st.connection = existing;
    return { ok: true, connection: existing };
  }
  if (existing) {
    try {
      existing.destroy();
    } catch {
      /* ignore */
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (e) {
    try {
      connection.destroy();
    } catch {
      /* ignore */
    }
    return { error: `Connexion vocal impossible : ${e.message || e}` };
  }

  const st = getState(guild.id);
  const player = ensurePlayer(guild);
  connection.subscribe(player);
  st.connection = connection;

  connection.on("stateChange", (a, b) => {
    if (b.status === VoiceConnectionStatus.Disconnected) {
      try {
        connection.destroy();
      } catch {
        /* ignore */
      }
      const cur = getState(guild.id);
      if (cur.connection === connection) cur.connection = null;
    }
  });

  return { ok: true, connection };
}

function leaveGuild(guildId, client = null) {
  const gid = String(guildId);
  const st = guildStates.get(gid);
  if (client?.shoukaku && (st?.lavalinkPlayer || client.shoukaku.players.has(gid))) {
    client.shoukaku.leaveVoiceChannel(gid).catch(() => {});
  }
  if (st) st.lavalinkPlayer = null;
  if (loadOk && voiceMod) {
    try {
      voiceMod.getVoiceConnection(gid)?.destroy();
    } catch {
      /* ignore */
    }
  }
  killActiveYtDlp(st);
  if (st?.player) {
    try {
      st.player.stop(true);
    } catch {
      /* ignore */
    }
    try {
      st.player.removeAllListeners();
    } catch {
      /* ignore */
    }
    st.player = null;
  }
  if (st) {
    st.queue = [];
    st.connection = null;
    st.nowPlaying = null;
  }
}

function skipGuild(guildId) {
  const st = getState(guildId);
  if (st.lavalinkPlayer) {
    if (!st.lavalinkPlayer.track) return { error: "Rien en lecture." };
    st.lavalinkPlayer.stopTrack().catch(() => null);
    return { ok: true };
  }
  if (!loadOk || !voiceMod) return { error: "Musique inactive." };
  const { AudioPlayerStatus } = voiceMod;
  if (!st.player) return { error: "Rien en lecture." };
  const s = st.player.state.status;
  if (s !== AudioPlayerStatus.Playing && s !== AudioPlayerStatus.Buffering) {
    return { error: "Rien en lecture." };
  }
  try {
    st.player.stop(true);
  } catch (e) {
    return { error: e.message || String(e) };
  }
  return { ok: true };
}

function stopGuild(guildId) {
  const st = getState(guildId);
  st.queue = [];
  st.nowPlaying = null;
  killActiveYtDlp(st);
  if (st.lavalinkPlayer) {
    st.lavalinkPlayer.stopTrack().catch(() => null);
    return { ok: true };
  }
  if (!loadOk || !voiceMod) return { error: "Musique inactive." };
  try {
    st.player?.stop(true);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

function formatQueue(guildId, limit = 10) {
  const st = getState(guildId);
  const lines = st.queue.slice(0, limit).map((t, i) => `${i + 1}. ${t.title}`);
  const extra = st.queue.length > limit ? `\n... et ${st.queue.length - limit} autre(s).` : "";
  if (!lines.length) return "File d'attente vide.";
  return lines.join("\n") + extra;
}

/**
 * Coupe (ou enchaine si rien ne joue) pour lancer tout de suite une piste depuis la playlist.
 * @param {import('discord.js').Guild} guild
 * @param {{ title: string, url: string }} item
 * @param {string} requesterId
 */
async function playPlaylistItemNow(guild, item, requesterId) {
  if (!isEnabled()) return { error: "La musique est desactivee sur ce bot." };
  if (!loadDeps()) {
    return { error: loadErr?.message ? `Module musique : ${loadErr.message}` : "Module musique indisponible." };
  }
  const st = getState(guild.id);
  const rid = String(requesterId || "0");
  st.queue.unshift({
    title: item.title,
    url: item.url,
    requesterId: rid
  });

  if (st.lavalinkPlayer && lavalink.isLavalinkUsable(guild.client)) {
    if (st.lavalinkPlayer.track) {
      await st.lavalinkPlayer.stopTrack().catch(() => null);
      return { ok: true };
    }
    await playNext(guild);
    return { ok: true };
  }

  if (!loadOk || !voiceMod) return { error: "Musique inactive." };

  if (!st.player) {
    await playNext(guild);
    return { ok: true };
  }

  const { AudioPlayerStatus } = voiceMod;
  const s = st.player.state.status;
  if (
    s === AudioPlayerStatus.Playing ||
    s === AudioPlayerStatus.Buffering ||
    s === AudioPlayerStatus.Paused
  ) {
    try {
      st.player.stop(true);
    } catch (e) {
      return { error: e.message || String(e) };
    }
    return { ok: true };
  }

  await playNext(guild);
  return { ok: true };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {Array<{ title: string, url: string, source?: string }>} tracks
 * @param {string} requesterId
 */
async function enqueueDirectTracks(guild, tracks, requesterId, prisma = null) {
  if (!isEnabled()) return { error: "La musique est desactivee sur ce bot." };
  if (!loadDeps()) {
    return { error: loadErr?.message ? `Module musique : ${loadErr.message}` : "Module musique indisponible." };
  }
  if (!tracks.length) return { error: "Aucun morceau." };
  const st = getState(guild.id);
  for (const t of tracks) {
    st.queue.push({ title: t.title, url: t.url, requesterId });
  }
  const idle = isPlaybackIdle(st);
  if (idle) await playNext(guild);
  if (prisma) {
    await recordPlayHistory(
      prisma,
      guild.id,
      requesterId,
      tracks.map((t) => ({ title: t.title, url: t.url, source: t.source || "youtube" }))
    );
  }
  return {
    ok: true,
    added: tracks.length,
    firstTitle: tracks[0]?.title,
    queueLen: st.queue.length
  };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} query
 * @param {string} requesterId
 */
async function enqueueQuery(guild, query, requesterId, prisma = null) {
  if (!isEnabled()) return { error: "La musique est desactivee sur ce bot." };
  if (!loadDeps()) {
    return { error: loadErr?.message ? `Module musique : ${loadErr.message}` : "Module musique indisponible." };
  }
  const raw = String(query || "").trim();
  const resolved = await resolveQueryToYoutubeTracks(raw, guild);
  if (resolved.error) return { error: resolved.error };
  const src = guessSourceFromQuery(raw);
  const tracks = resolved.tracks.map((t) => ({ title: t.title, url: t.url, source: src }));
  return enqueueDirectTracks(guild, tracks, requesterId, prisma);
}

function destroyAllConnections(client) {
  if (client?.shoukaku) {
    const ids = new Set([...guildStates.keys(), ...client.shoukaku.players.keys()]);
    for (const gid of ids) {
      client.shoukaku.leaveVoiceChannel(gid).catch(() => {});
    }
  }
  if (!loadOk || !voiceMod) {
    guildStates.clear();
    return;
  }
  const { getVoiceConnection } = voiceMod;
  for (const gid of [...guildStates.keys()]) {
    try {
      getVoiceConnection(gid)?.destroy();
    } catch {
      /* ignore */
    }
    const st = guildStates.get(gid);
    killActiveYtDlp(st);
    if (st?.player) {
      try {
        st.player.stop(true);
        st.player.removeAllListeners();
      } catch {
        /* ignore */
      }
      st.player = null;
    }
  }
  guildStates.clear();
}

module.exports = {
  isEnabled,
  loadDeps,
  getVoiceChannelForMember,
  getVoiceForPrivatePanel,
  assertPrivateRoomMusicAccess,
  joinChannel,
  leaveGuild,
  skipGuild,
  stopGuild,
  formatQueue,
  enqueueQuery,
  enqueueDirectTracks,
  resolveQueryToYoutubeTracks,
  isDirectPlayQuery,
  searchMixedCandidates,
  resolveCandidateChoice,
  getUserPlayHistoryUnique,
  recordPlayHistory,
  destroyAllConnections,
  getState,
  pauseGuild,
  resumeGuild,
  restartCurrentTrackGuild,
  setGuildVolume,
  nudgeGuildVolume,
  getGuildVolume,
  VOLUME_MIN,
  VOLUME_MAX,
  VOLUME_NUDGE,
  playPlaylistItemNow
};
