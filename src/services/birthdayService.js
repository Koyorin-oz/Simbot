function parseBirthdayInput(input) {
  const raw = input.trim();
  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
  if (!match) return { ok: false, error: "Format invalide. Utilise JJ/MM ou JJ/MM/AAAA." };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : null;
  if (month < 1 || month > 12) return { ok: false, error: "Mois invalide." };

  const maxDay = getDaysInMonth(month, year || 2000);
  if (day < 1 || day > maxDay) return { ok: false, error: "Jour invalide pour ce mois." };

  const currentYear = new Date().getFullYear();
  if (year !== null && (year < 1900 || year > currentYear + 1)) {
    return { ok: false, error: "Annee de naissance invalide." };
  }

  return { ok: true, day, month, year };
}

async function upsertBirthday(prisma, guildId, userId, day, month, year) {
  await prisma.$executeRaw`
    INSERT INTO "Birthday" ("guildId", "userId", "day", "month", "year", "createdAt", "updatedAt")
    VALUES (${guildId}, ${userId}, ${day}, ${month}, ${year}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT("guildId", "userId")
    DO UPDATE SET
      "day" = excluded."day",
      "month" = excluded."month",
      "year" = excluded."year",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function listBirthdays(prisma, guildId) {
  const rows = await prisma.$queryRaw`
    SELECT "guildId", "userId", "day", "month", "year"
    FROM "Birthday"
    WHERE "guildId" = ${guildId}
  `;
  return rows.map((row) => ({
    guildId: row.guildId,
    userId: row.userId,
    day: Number(row.day),
    month: Number(row.month),
    year: row.year === null || row.year === undefined ? null : Number(row.year)
  }));
}

async function deleteBirthday(prisma, guildId, userId) {
  const affected = await prisma.$executeRaw`
    DELETE FROM "Birthday"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
  `;
  return Number(affected || 0);
}

/**
 * Supprime les anniversaires des membres absents du serveur (partis / bannis).
 * @param {import("discord.js").Guild} guild
 * @returns {Promise<{ removed: number, userIds: string[] }>}
 */
async function deleteAbsentMemberBirthdays(prisma, guild) {
  const rows = await listBirthdays(prisma, guild.id);
  if (!rows.length) return { removed: 0, userIds: [] };

  const absentIds = [];
  for (const row of rows) {
    const uid = String(row.userId);
    const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (!member) absentIds.push(uid);
  }
  if (!absentIds.length) return { removed: 0, userIds: [] };

  let removed = 0;
  for (const uid of absentIds) {
    removed += await deleteBirthday(prisma, guild.id, uid);
  }
  return { removed, userIds: absentIds };
}

function parseDiscordUserId(input) {
  const raw = String(input || "").trim();
  const m = raw.match(/^(\d{17,22})$/);
  if (m) return m[1];
  const mention = raw.match(/^<@!?(\d{17,22})>$/);
  if (mention) return mention[1];
  return null;
}

function getUpcomingBirthdays(rows, now = new Date()) {
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mapped = rows.map((row) => {
    const nextDate = getNextBirthdayDate(row.day, row.month, nowMidnight);
    const daysLeft = Math.floor((nextDate.getTime() - nowMidnight.getTime()) / 86400000);
    const turningAge = row.year ? nextDate.getFullYear() - row.year : null;
    return {
      ...row,
      nextDate,
      daysLeft,
      turningAge
    };
  });

  mapped.sort((a, b) => {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });
  return mapped;
}

function getNextBirthdayDate(day, month, nowMidnight) {
  let year = nowMidnight.getFullYear();
  let candidate = safeBirthdayDate(year, month, day);
  if (candidate < nowMidnight) {
    year += 1;
    candidate = safeBirthdayDate(year, month, day);
  }
  return candidate;
}

function safeBirthdayDate(year, month, day) {
  if (month === 2 && day === 29 && !isLeapYear(year)) return new Date(year, 1, 28);
  return new Date(year, month - 1, day);
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

module.exports = {
  parseBirthdayInput,
  upsertBirthday,
  listBirthdays,
  deleteBirthday,
  deleteAbsentMemberBirthdays,
  parseDiscordUserId,
  getUpcomingBirthdays
};
