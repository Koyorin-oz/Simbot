const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const { buildPrivateRoomPanel } = require("../utils/privateRoomPanel");

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function parseIdList(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  return [
    ...new Set(
      s
        .split(/[\s,;]+/)
        .map((x) => x.replace(/[<@!>]/g, ""))
        .filter((x) => /^\d{17,20}$/.test(x))
    )
  ];
}

function safeJsonParseArray(str) {
  try {
    const v = JSON.parse(str || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^\d{17,20}$/.test(x)) : [];
  } catch {
    return [];
  }
}

/** Nom vocal prive par defaut : « Salon de » + pseudo (max 100 caracteres Discord). */
function defaultPrivateRoomChannelName(member) {
  const prefix = "Salon de ";
  const raw = member?.displayName || member?.user?.username || "membre";
  const cleaned = String(raw).replace(/[\r\n\t]/g, " ").trim() || "membre";
  const maxRest = Math.max(0, 100 - prefix.length);
  return (prefix + cleaned.slice(0, maxRest)).slice(0, 100);
}

function resolvePrivateRoomDisplayName(member, explicitName) {
  const n = explicitName != null ? String(explicitName).trim() : "";
  if (n) return n.slice(0, 100);
  return defaultPrivateRoomChannelName(member);
}

/** Pref en base ou ancien defaut « Salon vocal » → nom personnalise. */
function resolvePrivateRoomNameFromPrefs(member, prefsDefaultName) {
  const saved = String(prefsDefaultName || "").trim();
  if (saved && saved !== "Salon vocal") return saved.slice(0, 100);
  return defaultPrivateRoomChannelName(member);
}

async function loadPrefs(prisma, guildId, userId) {
  return prisma.privateRoomPrefs.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId },
    update: {}
  });
}

async function savePrefs(prisma, guildId, userId, data) {
  return prisma.privateRoomPrefs.update({
    where: { guildId_userId: { guildId, userId } },
    data
  });
}

function prefsSummary(prefs) {
  const bl = safeJsonParseArray(prefs.blacklistIds);
  const wl = safeJsonParseArray(prefs.whitelistIds);
  return [
    `**Derniers reglages** : \`${prefs.defaultName}\` • max **${prefs.defaultLimit || "∞"}** • mode **${prefs.defaultMode}**`,
    bl.length ? `Liste noire : ${bl.length} id(s)` : "Liste noire : vide",
    wl.length ? `Liste blanche : ${wl.length} id(s)` : "Liste blanche : vide"
  ].join("\n");
}

async function getOrInitSession(client, guildId, userId) {
  const key = sessionKey(guildId, userId);
  if (!client.privateRoomSessions) client.privateRoomSessions = new Map();
  let s = client.privateRoomSessions.get(key);
  if (!s) {
    s = { voiceChannelId: null };
    client.privateRoomSessions.set(key, s);
  }
  return s;
}

async function buildPanelPayload(client, prisma, member, options = {}) {
  const prefs = await loadPrefs(prisma, member.guild.id, member.id);
  const s = await getOrInitSession(client, member.guild.id, member.id);
  let has = false;
  if (s.voiceChannelId) {
    const ch =
      member.guild.channels.cache.get(s.voiceChannelId) ||
      (await member.guild.channels.fetch(s.voiceChannelId).catch(() => null));
    has = Boolean(ch);
    if (!has) s.voiceChannelId = null;
  }
  const pr = config.privateRoom;
  return buildPrivateRoomPanel(has, prefsSummary(prefs), member.id, {
    pingUser: Boolean(options.pingUser),
    panelTextChannelId: pr?.panelTextChannelId || null,
    lobbyChannelId: pr?.lobbyChannelId || null,
    musicEnabled: Boolean(config.music?.enabled)
  });
}

/**
 * Overwrites pour un salon vocal prive (membre = owner).
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").GuildMember} member
 */
function buildPrivateVoiceOverwrites(guild, member, mode, blacklistIds, whitelistIds) {
  const bl = [...new Set(blacklistIds)];
  const wl = [...new Set(whitelistIds)];
  const useWhitelistBase = mode === "whitelist" || mode === "both";

  const overwrites = [];

  if (useWhitelistBase) {
    overwrites.push({
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
    });
  } else {
    overwrites.push({
      id: guild.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
    });
  }

  overwrites.push({
    id: member.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ManageChannels
    ]
  });

  for (const id of wl) {
    if (id === member.id) continue;
    overwrites.push({
      id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
    });
  }

  for (const id of bl) {
    if (id === member.id) continue;
    overwrites.push({
      id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
    });
  }

  return overwrites;
}

async function sendPanelToOwnerChannel(client, prisma, member, channel, pr) {
  const payload = await buildPanelPayload(client, prisma, member, { pingUser: true });
  const sendOpts = {
    ...payload,
    allowedMentions: { users: [member.id] }
  };

  if (channel?.isVoiceBased?.() && typeof channel.send === "function") {
    const ok = await channel.send(sendOpts).then(() => true).catch(() => false);
    if (ok) return true;
  }

  if (pr?.panelTextChannelId) {
    const tch = await member.guild.channels.fetch(pr.panelTextChannelId).catch(() => null);
    if (tch?.isTextBased?.()) {
      return tch.send(sendOpts).then(() => true).catch(() => false);
    }
  }

  return false;
}

/**
 * Applique nom, limite, overwrites et enregistre les prefs (salon existant).
 */
async function applyVoiceChannelSettings(client, prisma, member, channelId, { name, limit, mode, blacklistIds, whitelistIds }) {
  const pr = config.privateRoom;
  if (!pr?.enabled) return { ok: false, error: "Fonction desactivee." };

  const guild = member.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, error: "Le bot doit gerer les salons." };
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isVoiceBased?.()) {
    return { ok: false, error: "Salon vocal introuvable." };
  }

  if (String(channel.parentId || "") !== String(pr.voiceCategoryId || "")) {
    return { ok: false, error: "Ce salon n'est pas un vocal prive du bot." };
  }

  const userLimit = Math.max(0, Math.min(99, Number(limit) || 0));
  const bl = [...new Set(blacklistIds)];
  const wl = [...new Set(whitelistIds)];
  const overwrites = buildPrivateVoiceOverwrites(guild, member, mode, bl, wl);
  const resolvedName = resolvePrivateRoomDisplayName(member, name);

  try {
    await channel.permissionOverwrites.set(overwrites, `Salon prive — ${member.user.tag}`);
    await channel.setName(resolvedName).catch(() => null);
    await channel.setUserLimit(userLimit || 0).catch(() => null);
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }

  await savePrefs(prisma, guild.id, member.id, {
    defaultName: resolvedName,
    defaultLimit: userLimit,
    defaultMode: mode,
    blacklistIds: JSON.stringify(bl),
    whitelistIds: JSON.stringify(wl)
  });

  const key = sessionKey(guild.id, member.id);
  if (!client.privateRoomSessions) client.privateRoomSessions = new Map();
  client.privateRoomSessions.set(key, { voiceChannelId: channel.id });

  return { ok: true, channel };
}

async function createTempVoice(client, prisma, member, { name, limit, mode, blacklistIds, whitelistIds }) {
  const pr = config.privateRoom;
  if (!pr?.enabled) return { ok: false, error: "Fonction desactivee." };

  const guild = member.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels) || !me?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    return { ok: false, error: "Le bot doit gerer les salons et deplacer les membres." };
  }

  const parent = await guild.channels.fetch(pr.voiceCategoryId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    return { ok: false, error: "Categorie vocale introuvable." };
  }

  const userLimit = Math.max(0, Math.min(99, Number(limit) || 0));
  const bl = [...new Set(blacklistIds)];
  const wl = [...new Set(whitelistIds)];
  const overwrites = buildPrivateVoiceOverwrites(guild, member, mode, bl, wl);
  const resolvedName = resolvePrivateRoomDisplayName(member, name);

  const channel = await guild.channels.create({
    name: resolvedName,
    type: ChannelType.GuildVoice,
    parent,
    userLimit: userLimit || undefined,
    permissionOverwrites: overwrites,
    reason: `Salon prive de ${member.user.tag}`
  });

  const key = sessionKey(guild.id, member.id);
  if (!client.privateRoomSessions) client.privateRoomSessions = new Map();
  client.privateRoomSessions.set(key, { voiceChannelId: channel.id });

  await savePrefs(prisma, guild.id, member.id, {
    defaultName: resolvedName,
    defaultLimit: userLimit,
    defaultMode: mode,
    blacklistIds: JSON.stringify(bl),
    whitelistIds: JSON.stringify(wl)
  });

  if (member.voice?.channel) {
    await member.voice.setChannel(channel).catch(() => null);
  }

  await sendPanelToOwnerChannel(client, prisma, member, channel, pr);

  return { ok: true, channel };
}

/** Max de liens playlist enregistres par membre / serveur. */
const MAX_SAVED_SPOTIFY_PLAYLISTS = 10;

function isSpotifyPlaylistUrl(s) {
  return /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\//i.test(String(s || "").trim());
}

/** @param {{ musicSpotifyUrl?: string } | string} prefsOrRaw */
function parseSavedSpotifyPlaylistUrls(prefsOrRaw) {
  const raw =
    typeof prefsOrRaw === "string"
      ? prefsOrRaw
      : String(prefsOrRaw?.musicSpotifyUrl ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_SAVED_SPOTIFY_PLAYLISTS);
}

/** Dedup + filtre vide, respecte le plafond. */
function normalizeSavedSpotifyPlaylistLines(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const t = String(line || "").trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_SAVED_SPOTIFY_PLAYLISTS) break;
  }
  return out;
}

async function deleteIfOwnerEmpty(client, channel) {
  if (!channel?.isVoiceBased()) return;
  if (!client.privateRoomSessions) return;
  const entry = [...client.privateRoomSessions.entries()].find(([, v]) => v.voiceChannelId === channel.id);
  if (!entry) return;
  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans > 0) return;
  await channel.delete("Salon vocal prive vide").catch(() => null);
  client.privateRoomSessions.set(entry[0], { voiceChannelId: null });
}

module.exports = {
  sessionKey,
  parseIdList,
  safeJsonParseArray,
  loadPrefs,
  savePrefs,
  prefsSummary,
  getOrInitSession,
  buildPanelPayload,
  createTempVoice,
  applyVoiceChannelSettings,
  deleteIfOwnerEmpty,
  defaultPrivateRoomChannelName,
  resolvePrivateRoomDisplayName,
  resolvePrivateRoomNameFromPrefs,
  MAX_SAVED_SPOTIFY_PLAYLISTS,
  isSpotifyPlaylistUrl,
  parseSavedSpotifyPlaylistUrls,
  normalizeSavedSpotifyPlaylistLines
};
