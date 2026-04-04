const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { buildSanctionEmbed } = require("../../utils/sanctionEmbed");
const { deferPublic } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("expulser")
    .setDescription("Kick un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("membre").setDescription("Membre a expulser").setRequired(true))
    .addStringOption(o => o.setName("raison").setDescription("Raison").setRequired(false)),
  async execute(client, interaction) {
    const member = interaction.options.getMember("membre", true);
    const reason = interaction.options.getString("raison") || "Aucune raison";

    await deferPublic(interaction);

    const preKickDm = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("Avertissement de moderation")
      .setDescription("Tu es sur le point d'etre expulse du serveur.")
      .addFields(
        { name: "Raison", value: reason, inline: false },
        {
          name: "Message",
          value:
            "Tu es sur le point d'etre expulse du serveur, cela veut probablement dire que ton compte a ete hacke ou token grab. Tu pourras revenir une fois le probleme regle avec ton compte.",
          inline: false
        },
        { name: "Serveur", value: interaction.guild.name, inline: true },
        { name: "Action", value: "Expulsion", inline: true }
      )
      .setTimestamp();
    const dmSent = await member.send({ embeds: [preKickDm] }).then(() => true).catch(() => false);

    await member.kick(reason);
    await client.prisma.punishment.create({ data: { guildId: interaction.guildId, userId: member.id, moderatorId: interaction.user.id, type: "KICK", reason } });
    const embed = buildSanctionEmbed({
      title: interaction.guild.name,
      targetLabel: `${member} (${member.user.tag})`,
      reason,
      moderatorLabel: `${interaction.user} (${interaction.user.tag})`
    });
    await interaction.editReply({
      content: dmSent
        ? "DM envoye avant expulsion."
        : "DM impossible (probablement fermes), expulsion effectuee quand meme.",
      embeds: [embed]
    });
  }
};
