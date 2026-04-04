const config = require("../config");
const { buildJoinWelcomeMessage, buildJoinWelcomeMessageAlt } = require("../utils/welcomeJoinPanelV2");

/**
 * Salon unique pour le message de bienvenue (canvas + boutons).
 * On n'utilise pas `config.welcome.channelId` ni channelSetup ici : un mauvais ID test faisait crasher le deploy.
 */
const WELCOME_MESSAGE_CHANNEL_ID = "1487455251152769226";

async function sendWelcomeMessage(member) {
  const channel = await member.guild.channels.fetch(WELCOME_MESSAGE_CHANNEL_ID).catch(() => null);

  if (!channel?.isTextBased?.()) {
    throw new Error(
      `Salon bienvenue introuvable ou non textuel (id: ${WELCOME_MESSAGE_CHANNEL_ID}). Verifie que le salon existe sur ce serveur et que le bot y a acces.`
    );
  }

  return channel.send(await buildJoinWelcomeMessage(member));
}

async function sendAltWelcomeMessage(member) {
  const id = String(config.welcomeAlt?.panelChannelId || "").trim();
  if (!id) {
    throw new Error("welcomeAlt.panelChannelId manquant dans la config.");
  }
  const channel = await member.guild.channels.fetch(id).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(
      `Salon Bienvenue Accueil introuvable ou non textuel (id: ${id}). Verifie que le salon existe et que le bot y a acces.`
    );
  }
  return channel.send(await buildJoinWelcomeMessageAlt(member));
}

module.exports = { sendWelcomeMessage, sendAltWelcomeMessage, WELCOME_MESSAGE_CHANNEL_ID };
