const config = require("../config");

const DEFAULT_MEMBER_COUNTER_CHANNEL_ID = "1235231648048746516";

function resolveTargetChannelId() {
  return String(config.serverStats?.memberCounterChannelId || DEFAULT_MEMBER_COUNTER_CHANNEL_ID).trim();
}

function buildMemberCounterName(count) {
  return `📊 Membres : ${Number(count || 0).toLocaleString("fr-FR")}`;
}

async function updateMemberCounterChannel(guild) {
  if (!guild) return { ok: false, reason: "guild_missing" };
  const channelId = resolveTargetChannelId();
  if (!channelId) return { ok: false, reason: "channel_id_missing" };

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { ok: false, reason: "channel_not_found" };

  const nextName = buildMemberCounterName(guild.memberCount);
  if (channel.name === nextName) return { ok: true, changed: false };

  await channel.setName(nextName, "Mise à jour auto compteur membres").catch(() => null);
  return { ok: true, changed: true };
}

module.exports = { updateMemberCounterChannel };
