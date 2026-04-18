const config = require("../../config");
const { addActivityGain, getRandomMessageGain } = require("../../services/economyService");
const { syncRankRoleForMember } = require("../../services/rankRoleService");
const { syncLevel3RoleForMember } = require("../../services/levelRoleService");
const { maybeAnnounceEconomyMilestones } = require("../../services/milestoneAnnounceService");
const { isFrozen, isIaPaused } = require("../../services/simbotRuntimeService");
const { isEconomyPaused } = require("../../services/economyRuntimeService");
const {
  isGeminiOnCooldown,
  setGeminiCooldown,
  geminiCooldownSecondsLeft,
  stripBotMentions,
  canUseIaPing,
  skipIaPingCooldown,
  getGeminiAccessChannelId,
  claimIaPingDedupSlot
} = require("../../services/geminiAccessService");
const { generateGeminiPingReply, formatGeminiErrorForUser } = require("../../services/geminiService");
const { logApiError } = require("../../utils/botLogger");
const { handlePrefixSnipeEdit } = require("../../utils/prefixSnipeEditHandler");
const {
  getGuildAutoModPayload,
  findViolation,
  normalizeForMatch,
  isAutoModExemptMember
} = require("../../services/autoModService");
const { shouldBlockLinksForMessage } = require("../../services/linkFilterService");
const { sendAutoModDeletionNotice } = require("../../utils/autoModDeletionNotice");
const { rememberMessage } = require("../../services/snipeEditCacheService");

const AUTO_REPLY_COOLDOWN_MS = 15_000;
const GEMINI_REPLY_MAX = 2000;
/** Évite deux appels IA sur le même message.id (re-entrée avant le 1er await). Ne protège pas deux processus / même token. */
const IA_PING_MESSAGE_TTL_MS = 5 * 60_000;

function truncateGeminiOut(s) {
  const t = String(s || "").trim();
  if (t.length <= GEMINI_REPLY_MAX) return t;
  return `${t.slice(0, GEMINI_REPLY_MAX - 1)}…`;
}

module.exports = {
  name: "messageCreate",
  async execute(client, message) {
    if (!message.guild) return;
    if (!message.author.bot) rememberMessage(message);
    if (!message.author.bot) {
      const handled = await handlePrefixSnipeEdit(message);
      if (handled) return;
    }
    if (isFrozen()) return;
    if (message.author.bot) return;

    try {
      const payload = await getGuildAutoModPayload(client.prisma, message.guild.id);
      const member =
        message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));

      const ignoredCh = new Set(payload.ignoredChannelIds || []);
      const skipAutoModHere = ignoredCh.has(message.channel.id);

      if (!skipAutoModHere) {
        if (payload.enabled && payload.categories.length > 0 && String(message.content || "").trim()) {
          if (!isAutoModExemptMember(member)) {
            const norm = normalizeForMatch(message.content);
            if (findViolation(norm, payload)) {
              const uid = message.author.id;
              const ch = message.channel;
              await message.delete().catch(() => null);
              await sendAutoModDeletionNotice(ch, uid, "word", client);
              return;
            }
          }
        }

        if (shouldBlockLinksForMessage(message, member, payload, config.linkPolicy)) {
          const uid = message.author.id;
          const ch = message.channel;
          await message.delete().catch(() => null);
          await sendAutoModDeletionNotice(ch, uid, "link", client);
          return;
        }
      }
    } catch (e) {
      logApiError("AUTOMOD_OR_LINK_MSG", e, { maxDetailChars: 200 });
    }

    const content = (message.content || "").toLowerCase();
    const normalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let replied = false;
    if (!client.autoReplyCooldowns) client.autoReplyCooldowns = new Map();

    const canReplyFor = (triggerKey, cooldownMs = AUTO_REPLY_COOLDOWN_MS) => {
      const key = `${message.guild.id}:${message.author.id}:${triggerKey}`;
      const nowTs = Date.now();
      const lastTs = client.autoReplyCooldowns.get(key) || 0;
      if (nowTs - lastTs < cooldownMs) return false;
      client.autoReplyCooldowns.set(key, nowTs);
      return true;
    };

    const replyOnce = async (triggerKey, text) => {
      if (replied) return;
      if (!canReplyFor(triggerKey)) return;
      replied = true;
      await message.reply(text).catch(() => null);
    };

    const botId = client.user?.id;
    if (botId && message.mentions.users.has(botId)) {
      if (!client._iaPingInFlight) client._iaPingInFlight = new Set();
      if (client._iaPingInFlight.has(message.id)) {
        /* déjà pris en charge par un autre tour du handler */
      } else {
        client._iaPingInFlight.add(message.id);
        setTimeout(() => client._iaPingInFlight.delete(message.id), IA_PING_MESSAGE_TTL_MS).unref?.();

        let iaDedupOk = true;
        try {
          iaDedupOk = await claimIaPingDedupSlot(client.prisma, message.id, message.guild.id);
        } catch (e) {
          logApiError("IA_PING_DEDUP", e, { maxDetailChars: 300 });
        }
        if (!iaDedupOk) {
          /* Même message déjà pris par une autre instance (même SQLite) ou course DB */
        } else {
        const member =
          message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));

        if (member) {
          const channelIdForIa = getGeminiAccessChannelId({
            channel: message.channel,
            channelId: message.channelId
          });
          if (!canUseIaPing(member, channelIdForIa)) {
            /* Refus silencieux : pas de message « va dans tel salon » */
          } else if (isIaPaused()) {
            await replyOnce(
              "ia_paused",
              "L’IA est **en pause** (`/pause-ia reprendre` ou `/pause-ia restart`). Réessaie quand elle sera réactivée."
            );
          } else if (!String(process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim()) {
            await message.reply({ content: "Groq n’est pas configuré (`GROQ_API_KEY` dans `.env`)." }).catch(() => null);
            replied = true;
          } else {
            const noCd = skipIaPingCooldown(member, channelIdForIa);
            if (!noCd && isGeminiOnCooldown(client, message.guild.id, message.author.id)) {
              const s = geminiCooldownSecondsLeft(client, message.guild.id, message.author.id);
              await message.reply({ content: `Patiente encore **${s}s** avant de re-ping l’IA.` }).catch(() => null);
              replied = true;
            } else {
              const stripped = stripBotMentions(message.content, botId);
              await message.channel.sendTyping().catch(() => null);
              try {
                const out = await generateGeminiPingReply(stripped, message.guild);
                if (!noCd) setGeminiCooldown(client, message.guild.id, message.author.id);
                replied = true;
                await message
                  .reply({ content: truncateGeminiOut(out), allowedMentions: { parse: [] } })
                  .catch(() => null);
              } catch (e) {
                logApiError("GROQ_PING", e, { maxDetailChars: 800 });
                replied = true;
                const hint =
                  formatGeminiErrorForUser(e) ||
                  "L’IA ne répond pas (réseau, filtre ou erreur API). Réessaie plus tard.";
                await message.reply({ content: hint }).catch(() => null);
              }
            }
          }
        }
        }
      }
    }

    const includesAny = (phrases) => phrases.some((p) => normalized.includes(p));
    const pickOne = (items) => items[Math.floor(Math.random() * items.length)];
    const compact = normalized.replace(/[^a-z0-9]+/g, " ").trim();
    const simbaNameRegex = /\b(simba\s*bot|simbabot|simbot|simba|simbto|simbott|simb0t)\b/i;
    const racistWordRegex = /\b(racist|raciste|rasciste|rassiste|racisste|raci+ste|racis+t)\b/i;
    const tgRegex = /^\s*tg[.!?…]*\s*$/i;
    const asterionRegex = /\b(asterion+|astefion+)\b/i;
    const ilEstBanRegex = /\bil\s*est\s*ban+\b/i;
    const newcomerRegex = /^\s*(?:salut[\s,]*)?(?:je\s*suis|j\s*suis)\s*nouveau[.!?…]*\s*$/i;
    const jtmRegex = /\b(jtm+|je\s*t\s*aime|j\s*taime)\b/i;
    const botGoodRegex = /\b(il\s*est\s*bien|best\s*bot|bot\s*de\s*qualite|trop\s*bien\s*ce\s*bot|ce\s*bot\s*est\s*incroyable|ce\s*bot\s*est\s*bien|le\s*bot\s*est\s*bien|simbot\s*est\s*bien|simba\s*est\s*bien)\b/i;
    const botNotBadRegex = /\b(pas\s*mal)\b/i;
    const ratioRegex = /\b(simba\s*bot|simbabot|simbot|simba)\b.*\bratio\b|\bratio\b.*\b(simba\s*bot|simbabot|simbot|simba)\b/i;
    const beauRegex = /\b(tbo|tes\s*beau|t\s*es\s*beau|il\s*est\s*beau)\b/i;
    const nulRegex = /\b(simba\s*bot|simbabot|simbot|simba)\b.*\b(nul+)\b|\b(nul+)\b.*\b(simba\s*bot|simbabot|simbot|simba)\b/i;

    const simbotNameOnlyRegex = /^\s*(simba|simbot|simbabot|simba\s*bot)\s*[.!?…]*\s*$/i;
    const simbotNameReplies = [
      "C'est moi. Je te pose un problème, petit con ?",
      "Le seul et l'unique.",
      "Qui ose prononcer mon nom ?",
      "01100001 01100100 01101101 01101001 01101110 00110000 00111000 00110011 00110010"
    ];

    const tgReplies = ["D'où tu te permets de dire seulement ça ? T'es pas assez violent, tu mérites un ban pour ça."];

    const asterionPhrases = ["asterion", "astefion"];
    const asterionReplies = [
      "Ne me parlez plus de ce type, j'en fais encore des cauchemars.",
      "Je ferai payer Carmine pour m'avoir livré à Astérion.",
      "Même Kekos aurait eu l'instinct de fuir. Moi j'étais coincé. Next."
    ];

    const ilEstBanPhrases = ["il est ban"];
    const ilEstBanReplies = [
      "CHEH ! C'était une grosse merde de toute façon.",
      "Bien vu. Une peste en moins — même Kekos aurait applaudi sans comprendre pourquoi."
    ];

    const carmineRegex = /^\s*carmine[.!?…]*\s*$/i;
    const carmineReplies = ["Je suis le trauma de son enfance."];

    const jeSuisNouveauPhrases = [
      "je suis nouveau",
      "salut, je suis nouveau",
      "salut je suis nouveau",
      "salut, je suis nouveau !"
    ];
    const jeSuisNouveauReplies = [
      "Tu es nouveau ? Profite-en tant qu'il est encore temps de te planquer.",
      "Je ne souhaite pas la bienvenue sur ce serveur, Simba ne s'abaisserait pas à ça."
    ];

    const admin0832Phrases = ["admin0832"];
    const admin0832Replies = [
      "Vous n'étiez pas censés venir ici...",
      "43 61 72 6D 69 6E 65 20 6E 27 65 73 74 20 70 61 73 20 63 65 6C 75 69 20 71 75 69 20 63 6F 6E 74 72 F4 6C 65 20 63 65 20 73 65 72 76 65 75 72 2E 20 61 64 6D 69 6E 38 37 38 38"
    ];

    const admin8788Phrases = ["admin8788"];
    const admin8788Replies = [
      "Que fais-tu ici ? Tu n'es pas censé être là !",
      "150 164 164 160 163 072 057 057 155 141 160 163 056 141 160 160 056 147 157 157 056 147 154 057 124 165 104 156 063 146 127 132 130 065 171 153 150 153 115 164 065"
    ];

    const simbachPhrases = ["simbach"];
    const simbachReplies = [
      "Je vois que tu es allé loin pour récupérer cette information, voilà ta récompense, jeune aventurier : 01101000 01110100 01110100 01110000 01110011 00111010 00101111 00101111 01111001 01101111 01110101 01110100 01110101 00101110 01100010 01100101 00101111 01001011 00110110 01110011 01000111 01100110 00110000 01101110 01110000 01000001 01110111 01101111 00111111 01110011 01101001 00111101 01000110 00110111 01000111 01101101 01011000 00110000 00110100 00110100 01110110 01101101 01100111 01110000 01000001 01110111 01101101 01010010"
    ];

    if (includesAny(admin0832Phrases)) {
      await replyOnce("admin0832", pickOne(admin0832Replies));
    }

    if (includesAny(admin8788Phrases)) {
      await replyOnce("admin8788", pickOne(admin8788Replies));
    }

    if (includesAny(simbachPhrases)) {
      await replyOnce("simbach", pickOne(simbachReplies));
    }

    if (tgRegex.test(message.content || "")) {
      await replyOnce("tg", pickOne(tgReplies));
    }

    if (includesAny(asterionPhrases) || asterionRegex.test(compact)) {
      await replyOnce("asterion_new", pickOne(asterionReplies));
    }

    if (includesAny(ilEstBanPhrases) || ilEstBanRegex.test(compact)) {
      await replyOnce("il_est_ban", pickOne(ilEstBanReplies));
    }

    if (carmineRegex.test(message.content || "")) {
      await replyOnce("carmine", pickOne(carmineReplies));
    }

    if (includesAny(jeSuisNouveauPhrases) || newcomerRegex.test(message.content || "")) {
      await replyOnce("nouveau", pickOne(jeSuisNouveauReplies));
    }

    if (racistWordRegex.test(compact)) {
      await replyOnce("simba_racist", "On est tous racistes, de toute façon.");
    }

    if (jtmRegex.test(compact)) {
      await replyOnce("jtm", "Moi, je t'aime pas.");
    }

    if (simbotNameOnlyRegex.test(message.content || "")) {
      await replyOnce("simbot_name", pickOne(simbotNameReplies));
    }

    const loveBotPhrases = [
      "j'aime simbot",
      "jaime simbot",
      "j aime simbot",
      "j'aime le bot",
      "jaime le bot",
      "j aime le bot",
      "simbot je t'aime",
      "simbot je taime",
      "j'adore simbot",
      "jadore simbot",
      "j adore simbot",
      "on aime simbot",
      "vive simbot"
    ];

    const botIsGoodPhrases = [
      "il est bien le bot",
      "il est bien simbot",
      "le bot est bien",
      "simbot est bien",
      "simbot il est bien",
      "ce bot est bien",
      "ce bot est incroyable",
      "bot de qualite",
      "best bot",
      "trop bien ce bot"
    ];

    const botNotBadPhrases = [
      "il est psa mal le bot",
      "il est pas mal le bot",
      "pas mal le bot",
      "pas mal ce bot",
      "simbot pas mal",
      "il est pas mal simbot",
      "bot pas mal",
      "franchement pas mal le bot",
      "pas mal du tout le bot"
    ];

    if (includesAny(loveBotPhrases)) {
      await replyOnce("love_bot", "Moi, je ne t'aime pas.");
    }

    if (includesAny(botIsGoodPhrases) || botGoodRegex.test(compact)) {
      await replyOnce("bot_is_good", "Je sais, t'inquiète, pas besoin de me le rappeler.");
    }

    if (includesAny(botNotBadPhrases) || (botNotBadRegex.test(compact) && simbaNameRegex.test(compact))) {
      await replyOnce("bot_not_bad", "Bien sûr, je suis à l'effigie de Simba.");
    }

    if (
      normalized.includes("simbot t'es beau") ||
      normalized.includes("simbot tes beau") ||
      beauRegex.test(compact)
    ) {
      await replyOnce("simbot_beau", "Merci, je sais.");
    }

    if (
      normalized.includes("simbot t'es nul") ||
      normalized.includes("simbot tes nul") ||
      nulRegex.test(compact)
    ) {
      await replyOnce("simbot_nul", "Parle mieux, s'il te plaît : je suis une star quand même. 👑");
    }

    if (normalized.includes("simbot ratio") || ratioRegex.test(compact)) {
      await replyOnce("simbot_ratio", "Ratio refusé, tu crois que je suis une victime comme Carmine ? BAHAHAHA ?");
    }

    if (content.includes("asterion") || asterionRegex.test(compact)) {
      await replyOnce("asterion_legacy", "Asterion, c'est un pain en vrai, non ?");
    }

    if (normalized.includes("simba")) {
      const customOk = await message.react("1067136415860797522").then(() => true).catch(() => false);
      if (!customOk) {
        await message.react("🦁").catch(() => null);
      }
    }

    const trimmedNormalized = normalized.trim();
    const isQuoiSolo = /^quoi[!?…]*$/i.test(trimmedNormalized);
    const isQuoiAtEnd = /(?:^|\s)quoi[!?…]*$/i.test(trimmedNormalized);
    if (isQuoiSolo || isQuoiAtEnd) {
      const shouldReplyFeur = Math.random() < 0.5;
      let repliedNow = false;
      if (shouldReplyFeur) {
        const wasReplied = replied;
        await replyOnce("quoi_reply", "FEUR hehehe");
        repliedNow = !wasReplied && replied;
      }
      if (!repliedNow) {
        for (const e of ["🇫", "🇪", "🇺", "🇷"]) {
          // eslint-disable-next-line no-await-in-loop
          await message.react(e).catch(() => null);
        }
      }
    }

    if (content.includes("roix")) {
      await message.react("1067136415860797522").catch(() => null);
    }

    if (message.content.length < config.economy.messageMinLength) return;
    if (isEconomyPaused()) return;

    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const last = client.cooldowns.get(key) || 0;
    if (now - last < config.economy.messageCooldownMs) return;
    client.cooldowns.set(key, now);

    try {
      const updated = await addActivityGain(client.prisma, message.guild.id, message.author.id, getRandomMessageGain());
      const syncStatus = await syncRankRoleForMember(client, message.member, updated.simbaPoints);
      await syncLevel3RoleForMember(message.member, updated.level).catch(() => null);
      await maybeAnnounceEconomyMilestones(
        client,
        message.guild,
        message.member,
        updated,
        syncStatus || { ok: false }
      );
    } catch (e) {
      logApiError("MESSAGE_GAIN", e, { maxDetailChars: 400 });
    }
  }
};
