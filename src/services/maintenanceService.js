const fs = require("node:fs");
const path = require("node:path");

const STATE_PATH = path.join(process.cwd(), "data", "maintenance-state.json");

function readState() {
  ensureStateDir();
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  ensureStateDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function getGuildState(guildId) {
  const state = readState();
  return state[guildId] || null;
}

function setGuildState(guildId, value) {
  const state = readState();
  state[guildId] = value;
  writeState(state);
}

function clearGuildState(guildId) {
  const state = readState();
  delete state[guildId];
  writeState(state);
}

function ensureStateDir() {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function snapshotGuildOverwrites(guild, staffRoleId) {
  const channels = {};
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    channels[channel.id] = {
      overwrites: channel.permissionOverwrites.cache.map((ow) => ({
        id: ow.id,
        type: ow.type,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString()
      }))
    };
  }

  return {
    guildId: guild.id,
    staffRoleId,
    createdAt: new Date().toISOString(),
    channels
  };
}

async function enableMaintenanceMode(guild, staffRoleId, actorTag = "system") {
  const snapshot = snapshotGuildOverwrites(guild, staffRoleId);
  setGuildState(guild.id, snapshot);

  const everyoneRoleId = guild.roles.everyone.id;
  let updatedChannels = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites.edit(
      everyoneRoleId,
      {
        ViewChannel: false,
        CreateInstantInvite: false
      },
      { reason: `Mode maintenance active par ${actorTag}` }
    );
    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites.edit(
      staffRoleId,
      {
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
      },
      { reason: `Mode maintenance active par ${actorTag}` }
    );
    updatedChannels += 1;
  }

  let deletedInvites = 0;
  const invites = await guild.invites.fetch().catch(() => null);
  if (invites) {
    for (const invite of invites.values()) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await invite.delete(`Mode maintenance active par ${actorTag}`).then(() => true).catch(() => false);
      if (ok) deletedInvites += 1;
    }
  }

  return { updatedChannels, deletedInvites };
}

async function disableMaintenanceMode(guild, actorTag = "system") {
  const state = getGuildState(guild.id);
  if (!state) return null;

  let restoredChannels = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites) continue;
    const snapshot = state.channels[channel.id];
    if (!snapshot) continue;

    const normalized = snapshot.overwrites.map((ow) => ({
      id: ow.id,
      type: ow.type,
      allow: BigInt(ow.allow),
      deny: BigInt(ow.deny)
    }));

    // eslint-disable-next-line no-await-in-loop
    await channel.permissionOverwrites.set(normalized, `Mode maintenance desactive par ${actorTag}`);
    restoredChannels += 1;
  }

  clearGuildState(guild.id);
  return { restoredChannels, staffRoleId: state.staffRoleId };
}

module.exports = {
  getGuildState,
  enableMaintenanceMode,
  disableMaintenanceMode
};
