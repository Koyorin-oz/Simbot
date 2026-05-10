const config = require("../../config");
const { assignUnverifiedRole } = require("../../services/welcomeVerifyService");
const { sendModLog, baseEmbed } = require("../../services/modLogService");
const {
  sendWelcomeMessage,
  sendAltWelcomeMessage,
  WELCOME_MESSAGE_CHANNEL_ID
} = require("../../services/welcomeService");
const { updateMemberCounterChannel } = require("../../services/memberCounterService");
const { isFrozen } = require("../../services/simbotRuntimeService");
const { syncBoosterRole } = require("../../services/serverBoosterRoleService");

module.exports = {
  name: "guildMemberAdd",
  async execute(client, member) {
    if (!member.user.bot) {
      await syncBoosterRole(member).catch(() => null);
    }
    if (isFrozen()) return;
    await updateMemberCounterChannel(member.guild).catch(() => null);
    if (member.user.bot) return;

    if (config.welcomeVerify?.enabled) {
      await assignUnverifiedRole(member).catch(() => null);
    }

    const joinLog = baseEmbed("Membre arrive", 0x57f287).setDescription(
      `**${member.user.tag}** (<@${member.id}>) — compte cree <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
    );

    await sendWelcomeMessage(member).catch(() => null);

    const altId = String(config.welcomeAlt?.panelChannelId || "").trim();
    if (altId && altId !== WELCOME_MESSAGE_CHANNEL_ID) {
      await sendAltWelcomeMessage(member).catch(() => null);
    }

    await sendModLog(member.guild, joinLog);
  }
};
