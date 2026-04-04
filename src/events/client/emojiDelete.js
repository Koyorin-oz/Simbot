const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "emojiDelete",
  async execute(client, emoji) {
    const e = baseEmbed("Emoji supprime", 0xed4245).setDescription(`**Nom :** ${emoji.name}\n**ID :** \`${emoji.id}\``);
    await sendModLog(emoji.guild, e);
  }
};
