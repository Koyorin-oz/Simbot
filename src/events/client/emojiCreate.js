const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "emojiCreate",
  async execute(client, emoji) {
    const e = baseEmbed("Emoji ajoute", 0x57f287).setDescription(
      `**Nom :** ${emoji.name}\n**ID :** \`${emoji.id}\`\n**Anime :** ${emoji.animated ? "oui" : "non"}`
    );
    await sendModLog(emoji.guild, e);
  }
};
