const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { sendWelcomeMessage } = require("../../services/welcomeService");
const { deferEphemeral } = require("../../utils/slashDefer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dev-bienvenue")
    .setDescription("Gestion des messages de bienvenue")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("test")
        .setDescription("Envoie un message de bienvenue de test")
        .addUserOption((o) =>
          o.setName("membre").setDescription("Membre a utiliser pour le test (optionnel)").setRequired(false)
        )
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "test") return;

    const user = interaction.options.getUser("membre") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "Membre introuvable pour le test.", flags: MessageFlags.Ephemeral });
      return;
    }

    await deferEphemeral(interaction);
    await sendWelcomeMessage(member);
    await interaction.editReply({ content: "Message de bienvenue envoye." });
  }
};
