const { ensureUser } = require("./economyService");
const { formatSC } = require("../utils/currency");

const MAX_LOAN = 5_000_000;
const LOAN_COOLDOWN_DAYS = 21;
const LOAN_DUE_DAYS = 14;
const LOAN_DEFAULT_BLOCK_THRESHOLD = 3;
const NO_REPAY_PENALTY = 1_000_000;

async function ensureLoanTables(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Loan" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "guildId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "principal" INTEGER NOT NULL,
      "remaining" INTEGER NOT NULL,
      "repaidAmount" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" DATETIME NOT NULL,
      "dueAt" DATETIME NOT NULL,
      "nextEligibleAt" DATETIME NOT NULL,
      "closedAt" DATETIME,
      "defaultedAt" DATETIME
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "loan_active_unique_idx"
    ON "Loan"("guildId", "userId")
    WHERE "status" = 'ACTIVE';
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "loan_status_due_idx"
    ON "Loan"("status", "dueAt");
  `);
}

async function requestLoan(prisma, guildId, userId, amount) {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_LOAN) {
    return { ok: false, error: `Montant invalide. Maximum ${formatSC(MAX_LOAN)} SC.` };
  }

  await ensureLoanTables(prisma);

  const defaultCount = await getDefaultCount(prisma, guildId, userId);
  if (defaultCount >= LOAN_DEFAULT_BLOCK_THRESHOLD) {
    return {
      ok: false,
      error: "Tu as trop de prets non rembourses. Tu ne peux plus faire de pret."
    };
  }

  const active = await getActiveLoan(prisma, guildId, userId);
  if (active) {
    return {
      ok: false,
      error: `Tu as deja un pret actif. Reste a rembourser: ${formatSC(active.remaining)} SC.`
    };
  }

  const lastLoan = await getLatestLoan(prisma, guildId, userId);
  if (lastLoan && new Date(lastLoan.nextEligibleAt).getTime() > Date.now()) {
    const days = Math.ceil((new Date(lastLoan.nextEligibleAt).getTime() - Date.now()) / 86400000);
    return {
      ok: false,
      error: `Tu dois attendre encore ${days} jour(s) avant un nouveau pret.`
    };
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + LOAN_DUE_DAYS * 24 * 60 * 60 * 1000);
  const nextEligibleAt = new Date(now.getTime() + LOAN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await ensureUser(tx, guildId, userId);
    await tx.$executeRaw`
      INSERT INTO "Loan"
      ("guildId","userId","principal","remaining","repaidAmount","status","createdAt","dueAt","nextEligibleAt")
      VALUES (${guildId},${userId},${amount},${amount},0,'ACTIVE',${now},${dueAt},${nextEligibleAt})
    `;
    await tx.user.update({
      where: { userId },
      data: { simbaCoins: { increment: amount } }
    });
  });

  const loan = await getActiveLoan(prisma, guildId, userId);
  return { ok: true, loan };
}

async function repayLoan(prisma, guildId, userId, amount) {
  await ensureLoanTables(prisma);
  const loan = await getActiveLoan(prisma, guildId, userId);
  if (!loan) return { ok: false, error: "Aucun pret actif." };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "Montant invalide." };

  return prisma.$transaction(async (tx) => {
    const user = await ensureUser(tx, guildId, userId);
    const balance = Number(user.simbaCoins);
    const remaining = Number(loan.remaining);
    const repayable = Math.min(amount, Math.max(0, balance), remaining);
    if (repayable <= 0) return { ok: false, error: "Tu n'as pas assez de SC disponibles pour rembourser." };

    const nextRemaining = remaining - repayable;
    await tx.user.update({
      where: { userId },
      data: { simbaCoins: { decrement: repayable } }
    });
    await tx.$executeRaw`
      UPDATE "Loan"
      SET "remaining" = ${nextRemaining},
          "repaidAmount" = "repaidAmount" + ${repayable},
          "status" = ${nextRemaining <= 0 ? "CLOSED" : "ACTIVE"},
          "closedAt" = ${nextRemaining <= 0 ? new Date() : null}
      WHERE "id" = ${Number(loan.id)}
    `;

    const updated = nextRemaining <= 0 ? null : await getActiveLoan(tx, guildId, userId);
    return { ok: true, paid: repayable, remaining: nextRemaining, closed: nextRemaining <= 0, loan: updated };
  });
}

async function getLoanOverview(prisma, guildId, userId) {
  await ensureLoanTables(prisma);
  const [active, lastLoan, defaultCount] = await Promise.all([
    getActiveLoan(prisma, guildId, userId),
    getLatestLoan(prisma, guildId, userId),
    getDefaultCount(prisma, guildId, userId)
  ]);
  return { active, lastLoan, defaultCount };
}

async function processOverdueLoans(prisma) {
  await ensureLoanTables(prisma);
  const overdue = await prisma.$queryRaw`
    SELECT *
    FROM "Loan"
    WHERE "status" = 'ACTIVE' AND "dueAt" <= ${new Date()}
  `;

  let processed = 0;
  for (const loan of overdue) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$transaction(async (tx) => {
      const user = await ensureUser(tx, loan.guildId, loan.userId);
      const remaining = Number(loan.remaining);
      const repaidAmount = Number(loan.repaidAmount);

      if (repaidAmount <= 0) {
        const balance = Number(user.simbaCoins);
        const seize = Math.max(0, balance) + NO_REPAY_PENALTY;
        await tx.user.update({
          where: { userId: loan.userId },
          data: { simbaCoins: { decrement: seize } }
        });
      } else if (remaining > 0) {
        await tx.user.update({
          where: { userId: loan.userId },
          data: { simbaCoins: { decrement: remaining } }
        });
      }

      await tx.$executeRaw`
        UPDATE "Loan"
        SET "remaining" = 0,
            "status" = 'DEFAULTED',
            "defaultedAt" = ${new Date()}
        WHERE "id" = ${Number(loan.id)}
      `;
    });
    processed += 1;
  }

  return { processed };
}

async function getActiveLoan(prisma, guildId, userId) {
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM "Loan"
    WHERE "guildId" = ${guildId}
      AND "userId" = ${userId}
      AND "status" = 'ACTIVE'
    ORDER BY "id" DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getLatestLoan(prisma, guildId, userId) {
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM "Loan"
    WHERE "guildId" = ${guildId}
      AND "userId" = ${userId}
    ORDER BY "id" DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getDefaultCount(prisma, guildId, userId) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS "count"
    FROM "Loan"
    WHERE "guildId" = ${guildId}
      AND "userId" = ${userId}
      AND "status" = 'DEFAULTED'
  `;
  return Number(rows[0]?.count || 0);
}

module.exports = {
  MAX_LOAN,
  LOAN_COOLDOWN_DAYS,
  LOAN_DUE_DAYS,
  ensureLoanTables,
  requestLoan,
  repayLoan,
  getLoanOverview,
  processOverdueLoans
};
