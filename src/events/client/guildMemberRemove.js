const { sendModLog, baseEmbed } = require("../../services/modLogService");
const { updateMemberCounterChannel } = require("../../services/memberCounterService");
const { recordNativeKickFromAudit } = require("../../services/moderatorProfileService");

module.exports = {
  name: "guildMemberRemove",
  async execute(client, member) {
    if (!member.guild) return;
    await recordNativeKickFromAudit(client, member).catch(() => null);
    await updateMemberCounterChannel(member.guild).catch(() => null);
    const e = baseEmbed("Membre parti", 0xed4245)
      .setDescription(
        [
          `**Membre :** ${member.user?.tag || member.id} (<@${member.id}>)`,
          `**ID :** ${member.id}`,
          member.joinedAt ? `**Avait rejoint :** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : ""
        ]
          .filter(Boolean)
          .join("\n")
      )
      .setThumbnail(member.user?.displayAvatarURL({ size: 128 }) || null);
    await sendModLog(member.guild, e);
  }
};
