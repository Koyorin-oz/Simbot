const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "channelDelete",
  async execute(client, channel) {
    if (!channel.guild) return;
    const e = baseEmbed("Salon supprime", 0xed4245).setDescription(
      `**Nom :** ${channel.name}\n**Type :** ${channel.type}\n**ID :** \`${channel.id}\``
    );
    await sendModLog(channel.guild, e);

    await client.prisma.ticket.deleteMany({ where: { channelId: channel.id } }).catch(() => null);
  }
};
