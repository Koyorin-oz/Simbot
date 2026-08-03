const { sendModLog, baseEmbed } = require("../../services/modLogService");
const { recordNativeBanFromAudit } = require("../../services/moderatorProfileService");
const { consumePendingBanAnnounce } = require("../../services/banPublicAnnounceService");

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

    // /bannir avec annoncer=Non → pas de message public. Sinon (Oui ou ban hors commande) → CHEH.
    const pendingAnnounce = consumePendingBanAnnounce(ban.guild.id, ban.user.id);
    const shouldAnnounce = pendingAnnounce !== false;
    if (!shouldAnnounce) return;

    const channel =
      ban.guild.channels.cache.get(BAN_CHEH_CHANNEL_ID) ||
      (await ban.guild.channels.fetch(BAN_CHEH_CHANNEL_ID).catch(() => null));
    if (channel?.isTextBased()) {
      await channel.send(`<@${ban.user.id}> CHEH T'ES BAN`).catch(() => null);
    }
  }
};
