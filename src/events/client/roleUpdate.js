const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "roleUpdate",
  async execute(client, oldRole, newRole) {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`**Nom :** ${oldRole.name} → ${newRole.name}`);
    if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Couleur :** ${oldRole.hexColor} → ${newRole.hexColor}`);
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("**Permissions :** modifiees");
    if (changes.length === 0) return;
    const e = baseEmbed("Role modifie", 0x5865f2).setDescription(`${changes.join("\n")}\n**ID :** \`${newRole.id}\``);
    await sendModLog(newRole.guild, e);
  }
};
