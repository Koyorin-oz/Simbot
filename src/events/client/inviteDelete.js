const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "inviteDelete",
  async execute(client, invite) {
    if (!invite.guild) return;
    const e = baseEmbed("Invitation supprimee / expiree", 0xfee75c).setDescription(
      `**Code :** ${invite.code}\n**Salon :** ${invite.channel?.name || invite.channelId}`
    );
    await sendModLog(invite.guild, e);
  }
};
