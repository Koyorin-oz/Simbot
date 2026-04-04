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
    const ch = member.guild.channels.cache.get(s.voiceChannelId) || (await member.guild.channels.fetch(s.voiceChannelId).catch(() => null));
    has = Boolean(ch);
    if (!has) s.voiceChannelId = null;
  }
  const pr = config.privateRoom;
  return buildPrivateRoomPanel(has, prefsSummary(prefs), member.id, {
    pingUser: Boolean(options.pingUser),
    panelTextChannelId: pr?.panelTextChannelId || null,
    lobbyChannelId: pr?.lobbyChannelId || null
  });
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

  const overwrites = [];
  const useWhitelistBase = mode === "whitelist" || mode === "both";

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
    overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages] });
  }

  for (const id of bl) {
    if (id === member.id) continue;
    overwrites.push({ id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages] });
  }

  const channel = await guild.channels.create({
    name: name.slice(0, 100) || "Salon vocal",
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
    defaultName: name.slice(0, 100),
    defaultLimit: userLimit,
    defaultMode: mode,
    blacklistIds: JSON.stringify(bl),
    whitelistIds: JSON.stringify(wl)
  });

  if (member.voice?.channel) {
    await member.voice.setChannel(channel).catch(() => null);
  }

  if (channel?.isTextBased?.()) {
    const payload = await buildPanelPayload(client, prisma, member, { pingUser: true });
    await channel
      .send({
        ...payload,
        allowedMentions: { users: [member.id] }
      })
      .catch(() => null);
  }

  return { ok: true, channel };
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
  deleteIfOwnerEmpty
};
