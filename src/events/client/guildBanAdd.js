const { sendModLog, baseEmbed } = require("../../services/modLogService");
const { recordNativeBanFromAudit } = require("../../services/moderatorProfileService");

module.exports = {
  name: "guildBanAdd",
  async execute(client, ban) {
    await recordNativeBanFromAudit(client, ban).catch(() => null);

    const e = baseEmbed("Membre banni", 0xed4245).setDescription(
      [
        `**Utilisateur :** ${ban.user.tag} (\`${ban.user.id}\`)`,
        `**Raison :** ${ban.reason || "*(aucune)*"}`
      ].join("\n")
    );
    await sendModLog(ban.guild, e);
  }
};
