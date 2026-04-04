const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { deferEphemeral } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprime rapidement un nombre de messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName("nombre")
        .setDescription("Nombre de messages a supprimer (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  async execute(client, interaction) {
    const amount = interaction.options.getInteger("nombre", true);
    const channel = interaction.channel;
    const me = interaction.guild.members.me;

    if (!channel?.isTextBased() || !("bulkDelete" in channel)) {
      await interaction.reply({ content: "Commande utilisable uniquement dans un salon texte.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!me?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: "Le bot doit avoir la permission Gerer les messages.", flags: MessageFlags.Ephemeral });
      return;
    }

    await deferEphemeral(interaction);
    const deleted = await channel.bulkDelete(amount, true);
    const skipped = amount - deleted.size;

    await interaction.editReply({
      content:
        skipped > 0
          ? `${deleted.size} message(s) supprime(s). ${skipped} non supprime(s) (trop anciens ou introuvables).`
          : `${deleted.size} message(s) supprime(s).`
    });
  }
};
