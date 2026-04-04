const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "channelCreate",
  async execute(client, channel) {
    if (!channel.guild) return;
    const e = baseEmbed("Salon cree", 0x57f287).setDescription(
      `**Nom :** ${channel.name}\n**Type :** ${channel.type}\n**ID :** \`${channel.id}\`\n**Categorie :** ${channel.parent?.name || "—"}`
    );
    await sendModLog(channel.guild, e);
  }
};
