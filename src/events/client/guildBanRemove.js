const { sendModLog, baseEmbed } = require("../../services/modLogService");

module.exports = {
  name: "guildBanRemove",
  async execute(client, ban) {
    const e = baseEmbed("Deban", 0x57f287).setDescription(
      `**Utilisateur :** ${ban.user?.tag || ban.user?.id || "?"} (\`${ban.user?.id}\`)\n**Raison :** ${ban.reason || "*(aucune)*"}`
    );
    await sendModLog(ban.guild, e);
  }
};
