const config = require("../../config");
const { addActivityGain, sanitizeEconomyIntRanges } = require("../../services/economyService");
const { ensureLoanTables, processOverdueLoans } = require("../../services/loanService");
const { syncRankRoleForMember } = require("../../services/rankRoleService");
const { syncLevel3RoleForMember } = require("../../services/levelRoleService");
const { maybeAnnounceEconomyMilestones } = require("../../services/milestoneAnnounceService");
const { syncWelcomeVerifyCategoryAccess } = require("../../services/welcomeVerifyService");
const { updateMemberCounterChannel } = require("../../services/memberCounterService");
const { processSpDecay } = require("../../services/spDecayService");
const { ensureInventoryTables } = require("../../services/inventoryService");
const { isEconomyPaused } = require("../../services/economyRuntimeService");
const { startJokeScheduler } = require("../../services/jokeScheduleService");
const { startYoutubeNotifyPoller } = require("../../services/youtubeNotifyService");
const { startTiktokNotifyPoller } = require("../../services/tiktokNotifyService");
const { startTempBanScheduler } = require("../../services/tempBanScheduler");
const { applyBotPresence, applyBotProfileImages } = require("../../services/botProfileService");
const { logIaProvidersStartupStatus } = require("../../services/geminiService");
const logger = require("../../utils/botLogger");

function startVoiceGainTicker(client) {
  stopVoiceGainTicker(client);

  client.voiceGainInterval = setInterval(async () => {
    if (isEconomyPaused()) return;
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;

        // On ne recompense que si >= 2 humains presents dans le salon vocal.
        // (un gars seul -> pas de LP/SP/SC, meme micro ouvert)
        let humanCount = 0;
        for (const m of channel.members.values()) {
          if (!m.user?.bot) humanCount += 1;
          if (humanCount >= 2) break;
        }
        if (humanCount < 2) continue;

        for (const [memberId, member] of channel.members) {
          if (member.user.bot) continue;
          // Micro coupe (self ou server) OU casque coupe -> pas de gain.
          if (member.voice?.selfMute || member.voice?.serverMute || member.voice?.deaf) continue;
          // eslint-disable-next-line no-await-in-loop
          const updated = await addActivityGain(
            client.prisma,
            guild.id,
            memberId,
            config.economy.voiceGain,
            member
          );
          // eslint-disable-next-line no-await-in-loop
          const syncStatus = await syncRankRoleForMember(client, member, updated.simbaPoints);
          // eslint-disable-next-line no-await-in-loop
          await syncLevel3RoleForMember(member, updated.level).catch(() => null);
          // eslint-disable-next-line no-await-in-loop
          await maybeAnnounceEconomyMilestones(client, guild, member, updated, syncStatus || { ok: false });
        }
      }
    }
  }, config.economy.voiceTickMinutes * 60 * 1000);
}

function stopVoiceGainTicker(client) {
  if (!client.voiceGainInterval) return false;
  clearInterval(client.voiceGainInterval);
  client.voiceGainInterval = null;
  return true;
}

function startLoanTicker(client) {
  stopLoanTicker(client);
  client.loanInterval = setInterval(async () => {
    if (isEconomyPaused()) return;
    const { processed } = await processOverdueLoans(client.prisma).catch(() => ({ processed: 0 }));
    if (processed > 0) logger.debug("Economie", `${processed} pret(s) en retard traites.`);
  }, 60 * 60 * 1000);
}

function stopLoanTicker(client) {
  if (!client.loanInterval) return false;
  clearInterval(client.loanInterval);
  client.loanInterval = null;
  return true;
}

function startSpDecayTicker(client) {
  stopSpDecayTicker(client);
  const mins = Math.max(15, config.economy.spDecay?.checkIntervalMinutes ?? 30);
  client.spDecayInterval = setInterval(() => {
    if (isEconomyPaused()) return;
    processSpDecay(client).catch(() => null);
  }, mins * 60 * 1000);
}

function stopSpDecayTicker(client) {
  if (!client.spDecayInterval) return false;
  clearInterval(client.spDecayInterval);
  client.spDecayInterval = null;
  return true;
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    await applyBotPresence(client).catch((e) =>
      logger.logOnce("ready-presence", "warn", "Profil", `Presence : ${e?.message || e}`)
    );
    await applyBotProfileImages(client).catch((e) =>
      logger.logOnce("ready-avatar", "warn", "Profil", `Avatar/banniere : ${e?.message || e}`)
    );
    for (const guild of client.guilds.cache.values()) {
      await syncWelcomeVerifyCategoryAccess(guild).catch(() => null);
      await updateMemberCounterChannel(guild).catch(() => null);
    }
    await sanitizeEconomyIntRanges(client.prisma).catch(() => null);
    await ensureLoanTables(client.prisma).catch(() => null);
    await ensureInventoryTables(client.prisma).catch(() => null);
    if (!isEconomyPaused()) {
      await processOverdueLoans(client.prisma).catch(() => null);
    }
    startVoiceGainTicker(client);
    startLoanTicker(client);
    if (config.economy.spDecay?.enabled && !isEconomyPaused()) {
      processSpDecay(client).catch(() => null);
      startSpDecayTicker(client);
    } else if (config.economy.spDecay?.enabled) {
      startSpDecayTicker(client);
    }
    startJokeScheduler(client);
    startYoutubeNotifyPoller(client);
    startTiktokNotifyPoller(client);
    startTempBanScheduler(client);
    logIaProvidersStartupStatus();

    const lines = [
      `Connecte : ${client.user.tag}`,
      `PID ${process.pid} · ${client.guilds.cache.size} serveur(s)`,
      `Modules : ${client._commandsLoaded || "?"} commandes · ${client._eventsLoaded || "?"} evenements`
    ];
    if (config.economy.spDecay?.enabled) {
      lines.push("SP decay : actif (sans log a chaque tick)");
    }
    if (config.youtubeNotify?.enabled) {
      lines.push(`YouTube notif : salon ${config.youtubeNotify.channelId}`);
    }
    if (config.tiktokNotify?.enabled) {
      lines.push(`TikTok live : salon ${config.tiktokNotify.channelId}`);
    }
    logger.logBanner(lines);
  },
  startVoiceGainTicker,
  stopVoiceGainTicker,
  startLoanTicker,
  stopLoanTicker,
  startSpDecayTicker,
  stopSpDecayTicker
};
