const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "channelUpdate",
  async execute(client, oldCh, newCh) {
    if (!newCh.guild) return;
    const changes = [];
    if (oldCh.name !== newCh.name) changes.push(`**Nom :** ${oldCh.name} → ${newCh.name}`);
    if (oldCh.topic !== newCh.topic) changes.push(`**Sujet :** modifie`);
    if (oldCh.parentId !== newCh.parentId) changes.push(`**Categorie :** deplacee`);
    if (changes.length === 0) return;
    const e = baseEmbed("Salon modifie", 0x5865f2).setDescription(
      `${changes.join("\n")}\n**Salon :** ${newCh} (\`${newCh.id}\`)`
    );
    await sendModLog(newCh.guild, e);
  }
};
