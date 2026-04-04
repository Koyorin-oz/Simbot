const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "inviteCreate",
  async execute(client, invite) {
    if (!invite.guild) return;
    const e = baseEmbed("Invitation creee", 0x5865f2).setDescription(
      [
        `**Code :** ${invite.code}`,
        `**Salon :** ${invite.channel?.name || invite.channelId}`,
        `**Par :** ${invite.inviter?.tag || "?"}`
      ].join("\n")
    );
    await sendModLog(invite.guild, e);
  }
};
