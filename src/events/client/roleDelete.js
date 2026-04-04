const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "roleDelete",
  async execute(client, role) {
    const e = baseEmbed("Role supprime", 0xed4245).setDescription(`**Nom :** ${role.name}\n**ID :** \`${role.id}\``);
    await sendModLog(role.guild, e);
  }
};
