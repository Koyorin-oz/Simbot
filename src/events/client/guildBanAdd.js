const { sendModLog, baseEmbed } = require("../../services/modLogService");
const { recordNativeBanFromAudit } = require("../../services/moderatorProfileService");

const BAN_CHEH_CHANNEL_ID = "738884759287103610";

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

    const channel =
      ban.guild.channels.cache.get(BAN_CHEH_CHANNEL_ID) ||
      (await ban.guild.channels.fetch(BAN_CHEH_CHANNEL_ID).catch(() => null));
    if (channel?.isTextBased()) {
      await channel.send(`<@${ban.user.id}> CHEH T'ES BAN`).catch(() => null);
    }
  }
};
