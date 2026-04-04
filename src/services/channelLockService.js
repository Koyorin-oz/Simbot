const fs = require("node:fs");
const path = require("node:path");
const { ChannelType } = require("discord.js");

const STATE_PATH = path.join(process.cwd(), "data", "channel-lock-state.json");

function ensureStateDir() {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  ensureStateDir();
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeState(obj) {
  ensureStateDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

/**
 * @param {string} guildId
 * @param {string} channelId
 */
function getLockState(guildId, channelId) {
  const s = readState();
  return s[guildId]?.[channelId] || null;
}

/**
 * @param {string} guildId
 * @param {string} channelId
 * @param {object} payload
 */
function setLockState(guildId, channelId, payload) {
  const s = readState();
  if (!s[guildId]) s[guildId] = {};
  s[guildId][channelId] = payload;
  writeState(s);
}

/**
 * @param {string} guildId
 * @param {string} channelId
 */
function clearLockState(guildId, channelId) {
  const s = readState();
  if (!s[guildId]) return;
  delete s[guildId][channelId];
  if (Object.keys(s[guildId]).length === 0) delete s[guildId];
  writeState(s);
}

/**
 * @param {import("discord.js").GuildChannel} channel
 */
function snapshotChannelOverwrites(channel) {
  if (!channel.permissionOverwrites?.cache) return [];
  return channel.permissionOverwrites.cache.map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow.bitfield.toString(),
    deny: ow.deny.bitfield.toString()
  }));
}

/**
 * @param {import("discord.js").GuildChannel} channel
 */
function isTextLikeLockable(channel) {
  const t = channel.type;
  return (
    t === ChannelType.GuildText ||
    t === ChannelType.GuildAnnouncement ||
    t === ChannelType.GuildForum ||
    t === ChannelType.PublicThread ||
    t === ChannelType.PrivateThread ||
    t === ChannelType.AnnouncementThread
  );
}

/**
 * @param {import("discord.js").GuildChannel} channel
 * @param {string} staffRoleId
 * @param {string} actorTag
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function lockChannel(channel, staffRoleId, actorTag) {
  const guildId = channel.guild.id;
  const channelId = channel.id;
  if (getLockState(guildId, channelId)) {
    return { ok: false, code: "already_locked" };
  }
  if (!channel.permissionOverwrites) {
    return { ok: false, code: "no_overwrites" };
  }

  const overwrites = snapshotChannelOverwrites(channel);
  const reason = `Salon verrouillé par ${actorTag}`;
  const everyoneId = channel.guild.roles.everyone.id;

  if (channel.isVoiceBased()) {
    await channel.permissionOverwrites.edit(everyoneId, { Speak: false }, { reason });
    await channel.permissionOverwrites.edit(staffRoleId, { Speak: true }, { reason });
  } else if (isTextLikeLockable(channel)) {
    /** @type {import("discord.js").PermissionOverwriteOptions} */
    const denyEveryone = {
      SendMessages: false,
      SendMessagesInThreads: false
    };
    /** @type {import("discord.js").PermissionOverwriteOptions} */
    const allowStaff = {
      SendMessages: true,
      SendMessagesInThreads: true
    };
    if (channel.type === ChannelType.GuildForum) {
      denyEveryone.CreatePublicThreads = false;
      denyEveryone.CreatePrivateThreads = false;
      allowStaff.CreatePublicThreads = true;
      allowStaff.CreatePrivateThreads = true;
    }
    await channel.permissionOverwrites.edit(everyoneId, denyEveryone, { reason });
    await channel.permissionOverwrites.edit(staffRoleId, allowStaff, { reason });
  } else {
    return { ok: false, code: "unsupported" };
  }

  setLockState(guildId, channelId, {
    mode: "messagerie",
    staffRoleId,
    lockedAt: new Date().toISOString(),
    lockedByTag: actorTag,
    overwrites
  });

  return { ok: true };
}

/**
 * Ferme le salon : @everyone ne voit plus le salon ; le rôle staff garde accès (comme mode maintenance, mais un seul salon).
 * @param {import("discord.js").GuildChannel} channel
 * @param {string} staffRoleId
 * @param {string} actorTag
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function closeChannelVisually(channel, staffRoleId, actorTag) {
  const guildId = channel.guild.id;
  const channelId = channel.id;
  if (getLockState(guildId, channelId)) {
    return { ok: false, code: "already_locked" };
  }
  if (!channel.permissionOverwrites) {
    return { ok: false, code: "no_overwrites" };
  }

  const overwrites = snapshotChannelOverwrites(channel);
  const reason = `Salon fermé (masqué) par ${actorTag}`;
  const everyoneId = channel.guild.roles.everyone.id;

  await channel.permissionOverwrites.edit(
    everyoneId,
    { ViewChannel: false, CreateInstantInvite: false },
    { reason }
  );

  /** @type {import("discord.js").PermissionOverwriteOptions} */
  const staffAllow = {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    Connect: true,
    Speak: true,
    UseApplicationCommands: true,
    SendMessagesInThreads: true,
    CreatePublicThreads: true,
    CreatePrivateThreads: true,
    CreateInstantInvite: true
  };

  await channel.permissionOverwrites.edit(staffRoleId, staffAllow, { reason });

  setLockState(guildId, channelId, {
    mode: "ferme",
    staffRoleId,
    lockedAt: new Date().toISOString(),
    lockedByTag: actorTag,
    overwrites
  });

  return { ok: true };
}

/**
 * @param {import("discord.js").GuildChannel} channel
 * @param {string} actorTag
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function unlockChannel(channel, actorTag) {
  const guildId = channel.guild.id;
  const channelId = channel.id;
  const state = getLockState(guildId, channelId);
  if (!state) {
    return { ok: false, code: "not_locked" };
  }
  if (!channel.permissionOverwrites) {
    return { ok: false, code: "no_overwrites" };
  }

  const normalized = state.overwrites.map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: BigInt(ow.allow),
    deny: BigInt(ow.deny)
  }));

  await channel.permissionOverwrites.set(normalized, `Salon déverrouillé par ${actorTag}`);
  clearLockState(guildId, channelId);
  return { ok: true };
}

module.exports = {
  getLockState,
  lockChannel,
  closeChannelVisually,
  unlockChannel
};
