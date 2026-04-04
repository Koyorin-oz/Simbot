const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "roleCreate",
  async execute(client, role) {
    const e = baseEmbed("Role cree", 0x57f287).setDescription(
      `**Nom :** ${role.name}\n**ID :** \`${role.id}\`\n**Couleur :** ${role.hexColor}`
    );
    await sendModLog(role.guild, e);
  }
};
