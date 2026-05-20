const { sendServerLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "userUpdate",
  async execute(client, oldUser, newUser) {
    const oldName = oldUser.globalName || oldUser.username;
    const newName = newUser.globalName || newUser.username;
    if (oldName === newName) return;

    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(newUser.id).catch(() => null);
      if (!member) continue;

      const e = baseEmbed("Pseudo global mis a jour", 0x57f287).setDescription(
        [
          `**Membre :** ${newUser.tag} (<@${newUser.id}>)`,
          `**Pseudo avant :** ${oldName}`,
          `**Pseudo apres :** ${newName}`
        ].join("\n")
      );
      await sendServerLog(guild, e, "message");
    }
  }
};
