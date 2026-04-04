const config = require("../config");
const realServerIds = require("../data/realServerIds");
const { ensureRankRolesForGuild } = require("./rankRoleService");
const { syncWelcomeVerifyCategoryAccess } = require("./welcomeVerifyService");
const { buildTicketPanelMessage } = require("../utils/ticketPanels");
const { buildBootstrapSuggestionsIntroV2 } = require("../utils/bootstrapSalonPanelsV2");
const { sendWelcomeMessage, sendAltWelcomeMessage, WELCOME_MESSAGE_CHANNEL_ID } = require("./welcomeService");
const { buildSalonVerificationMessage } = require("./welcomeVerifyService");

async function clearRecentBotMessages(channel, max = 30) {
  if (!channel?.isTextBased?.()) return 0;
  const messages = await channel.messages.fetch({ limit: Math.min(max, 100) }).catch(() => null);
  if (!messages) return 0;
  const botMessages = [...messages.values()].filter((m) => m.author?.bot).slice(0, max);
  let deleted = 0;
  for (const msg of botMessages) {
    const ok = await msg.delete().then(() => true).catch(() => false);
    if (ok) deleted += 1;
  }
  return deleted;
}

function isProdGuild(guild) {
  return guild?.id === realServerIds.guildId;
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild} guild
 * @param {string} key
 * @param {string | null} actorUserId
 * @param {{ reset?: boolean }} [opts]
 * @returns {Promise<string>}
 */
async function runDeployAction(client, guild, key, actorUserId = null, opts = {}) {
  const reset = Boolean(opts.reset);
  switch (key) {
    case "bienvenue_panel": {
      const targetChId = WELCOME_MESSAGE_CHANNEL_ID;
      if (reset) {
        const ch = await guild.channels.fetch(targetChId).catch(() => null);
        if (ch?.isTextBased?.()) await clearRecentBotMessages(ch, 20);
      }
      const targetId = String(actorUserId || guild.ownerId || "").trim();
      const targetMember =
        (targetId && (await guild.members.fetch(targetId).catch(() => null))) ||
        (await guild.members.fetch(guild.ownerId).catch(() => null));
      if (!targetMember) {
        return "**Bienvenue Principal** : impossible de trouver un membre pour le message de test.";
      }
      await sendWelcomeMessage(targetMember);
      return `**Bienvenue Principal** : ${reset ? "reinitialise puis " : ""}message envoye dans <#${targetChId}> (Reglement / Verif / Repertoire).`;
    }

    case "bienvenue_alt_panel": {
      const altChId = String(config.welcomeAlt?.panelChannelId || "").trim();
      if (!altChId) {
        return "**Bienvenue Accueil** : `welcomeAlt.panelChannelId` non configure.";
      }
      if (reset) {
        const ch = await guild.channels.fetch(altChId).catch(() => null);
        if (ch?.isTextBased?.()) await clearRecentBotMessages(ch, 20);
      }
      const targetId = String(actorUserId || guild.ownerId || "").trim();
      const targetMember =
        (targetId && (await guild.members.fetch(targetId).catch(() => null))) ||
        (await guild.members.fetch(guild.ownerId).catch(() => null));
      if (!targetMember) {
        return "**Bienvenue Accueil** : impossible de trouver un membre pour le message de test.";
      }
      await sendAltWelcomeMessage(targetMember);
      return `**Bienvenue Accueil** : ${reset ? "reinitialise puis " : ""}message envoye dans <#${altChId}> (Repertoire / Reglement / Ticket).`;
    }

    case "rank_roles": {
      const map = await ensureRankRolesForGuild(client, guild);
      const n = Object.keys(map).length;
      return `**Roles de rang** : ${n} role(s) resolu(s) / crees.`;
    }

    case "suggestions_intro": {
      const chId = config.suggestions?.channelId;
      if (!chId) {
        return "**Suggestions** : aucun salon configure (`suggestions.channelId` — lance `/setup-salons` avec l'option suggestions).";
      }
      const ch = await guild.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased?.()) {
        return "**Suggestions** : salon introuvable.";
      }
      if (reset) await clearRecentBotMessages(ch, 30);
      await ch.send(buildBootstrapSuggestionsIntroV2());
      return `**Suggestions** : ${reset ? "reinitialise puis " : ""}message d'intro envoye dans ${ch}.`;
    }

    case "verification_panel": {
      const chId = isProdGuild(guild)
        ? realServerIds.channels?.verificationChannelId
        : config.welcomeVerify?.rulesChannelId;
      if (!chId) {
        return "**Verification** : aucun salon configure (`welcomeVerify.rulesChannelId`).";
      }
      const ch = await guild.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased?.()) {
        return "**Verification** : salon introuvable.";
      }
      if (reset) await clearRecentBotMessages(ch, 30);
      await ch.send(buildSalonVerificationMessage({ guildId: guild.id }));
      return `**Verification** : ${reset ? "reinitialise puis " : ""}panel envoye dans ${ch}.`;
    }

    case "ticket_panel": {
      const chId = isProdGuild(guild)
        ? realServerIds.channels?.ticketPanelChannelId
        : config.tickets?.panelChannelId || config.tickets?.categoryId;
      if (!chId) {
        return "**Tickets generaux** : aucun salon configure (`tickets.panelChannelId`).";
      }
      const ch = await guild.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased?.()) {
        return "**Tickets generaux** : salon panel introuvable (verifie que c'est un salon texte, pas une categorie).";
      }
      if (reset) await clearRecentBotMessages(ch, 30);
      const intro = config.tickets?.panelEmbedIntro || "Besoin d'aide ? Ouvre un ticket.";
      await ch.send(buildTicketPanelMessage(intro, { variant: "general" }));
      return `**Tickets generaux** : ${reset ? "reinitialise puis " : ""}panel envoye dans ${ch}.`;
    }

    case "ticket_welcome_panel": {
      const chId = String(config.ticketsWelcome?.panelChannelId || "").trim();
      if (!chId) {
        return "**Tickets processus d'accueil** : `ticketsWelcome.panelChannelId` non configure.";
      }
      const ch = await guild.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased?.()) {
        return "**Tickets processus d'accueil** : salon panel introuvable.";
      }
      if (reset) await clearRecentBotMessages(ch, 30);
      const intro =
        config.ticketsWelcome?.panelEmbedIntro ||
        "Besoin d'aide pour la verification ? Ouvre un ticket en decrivant ton probleme.";
      await ch.send(buildTicketPanelMessage(intro, { variant: "welcome" }));
      return `**Tickets processus d'accueil** : ${reset ? "reinitialise puis " : ""}panel envoye dans ${ch}.`;
    }

    case "categories_accueil": {
      if (!config.welcomeVerify?.enabled) {
        return "**Categories** : `welcomeVerify` desactive — rien a synchroniser.";
      }
      await syncWelcomeVerifyCategoryAccess(guild);
      return `**Categories** : permissions ${reset ? "re" : ""}synchronisees (nouveaux + communaute).`;
    }

    case "tout": {
      const parts = [];
      parts.push(await runDeployAction(client, guild, "categories_accueil", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "verification_panel", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "bienvenue_panel", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "bienvenue_alt_panel", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "rank_roles", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "ticket_panel", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "ticket_welcome_panel", actorUserId, { reset }));
      parts.push(await runDeployAction(client, guild, "suggestions_intro", actorUserId, { reset }));
      return ["**Deploiement complet**", ...parts.map((p, i) => `${i + 1}. ${p}`)].join("\n");
    }

    default:
      return "Action inconnue.";
  }
}

module.exports = { runDeployAction };
