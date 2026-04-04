const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");

const PROFILE_TYPES = ["BAN", "WARN", "MUTE", "KICK"];

function normalizeType(input) {
  const t = String(input || "").toUpperCase();
  if (PROFILE_TYPES.includes(t)) return t;
  return null;
}

async function getModeratorProfileView(prisma, guildId, moderatorId, filter = "ALL") {
  const normalizedFilter = normalizeType(filter);
  const where = {
    guildId,
    moderatorId,
    ...(normalizedFilter ? { type: normalizedFilter } : { type: { in: PROFILE_TYPES } })
  };
  const sanctions = await prisma.punishment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30
  });

  const allRows = await prisma.punishment.findMany({
    where: { guildId, moderatorId, type: { in: PROFILE_TYPES } },
    select: { type: true }
  });

  const counts = { BAN: 0, WARN: 0, MUTE: 0, KICK: 0 };
  for (const row of allRows) {
    const key = normalizeType(row.type);
    if (key) counts[key] += 1;
  }

  return {
    filter: normalizedFilter || "ALL",
    total: counts.BAN + counts.WARN + counts.MUTE + counts.KICK,
    counts,
    sanctions
  };
}

async function recordNativeBanFromAudit(client, ban) {
  const entry = await fetchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  return persistNativePunishment(client, {
    guildId: ban.guild.id,
    userId: ban.user.id,
    type: "BAN",
    reason: ban.reason || entry?.reason || "Aucune raison (outil Discord natif)",
    moderatorId: entry?.executor?.id,
    createdAtMs: entry?.createdTimestamp
  });
}

async function recordNativeKickFromAudit(client, member) {
  const entry = await fetchAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
  if (!entry) return { ok: false, reason: "not_kick" };
  return persistNativePunishment(client, {
    guildId: member.guild.id,
    userId: member.id,
    type: "KICK",
    reason: entry.reason || "Aucune raison (outil Discord natif)",
    moderatorId: entry.executor?.id,
    createdAtMs: entry.createdTimestamp
  });
}

async function recordNativeMuteFromAudit(client, oldMember, newMember) {
  const oldTs = oldMember.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember.communicationDisabledUntilTimestamp || 0;
  if (!newTs || newTs <= Date.now() || newTs <= oldTs) return { ok: false, reason: "not_timeout_add" };

  const entry = await fetchAuditEntry(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id, 20_000);
  if (!entry) return { ok: false, reason: "no_audit_entry" };

  return persistNativePunishment(client, {
    guildId: newMember.guild.id,
    userId: newMember.id,
    type: "MUTE",
    reason: entry.reason || "Timeout applique (outil Discord natif)",
    moderatorId: entry.executor?.id,
    expiresAt: new Date(newTs),
    createdAtMs: entry.createdTimestamp
  });
}

async function fetchAuditEntry(guild, eventType, targetUserId, maxAgeMs = 15_000) {
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) return null;

  const logs = await guild.fetchAuditLogs({ type: eventType, limit: 6 }).catch(() => null);
  const entries = logs ? [...logs.entries.values()] : [];
  const now = Date.now();
  return (
    entries.find((entry) => {
      const targetId = entry?.target?.id || null;
      const age = now - (entry?.createdTimestamp || 0);
      return targetId === targetUserId && age >= 0 && age <= maxAgeMs;
    }) || null
  );
}

async function persistNativePunishment(client, payload) {
  const moderatorId = payload.moderatorId;
  if (!moderatorId) return { ok: false, reason: "missing_moderator" };
  if (moderatorId === client.user?.id) return { ok: false, reason: "bot_executor" };

  const nearDate = new Date(Date.now() - 20_000);
  const duplicate = await client.prisma.punishment.findFirst({
    where: {
      guildId: payload.guildId,
      userId: payload.userId,
      moderatorId,
      type: payload.type,
      createdAt: { gte: nearDate }
    },
    orderBy: { createdAt: "desc" }
  });
  if (duplicate) return { ok: false, reason: "duplicate" };

  const reason = payload.reason || "Aucune raison (outil Discord natif)";
  await client.prisma.punishment.create({
    data: {
      guildId: payload.guildId,
      userId: payload.userId,
      moderatorId,
      type: payload.type,
      reason,
      ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {})
    }
  });
  return { ok: true };
}

module.exports = {
  PROFILE_TYPES,
  getModeratorProfileView,
  recordNativeBanFromAudit,
  recordNativeKickFromAudit,
  recordNativeMuteFromAudit
};
