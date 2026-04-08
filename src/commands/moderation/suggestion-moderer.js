const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  isSuggestionsStaff,
  extractSuggestionMessageId,
  moderateSuggestion
} = require("../../services/suggestionService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggestion-moderer")
    .setDescription("Accepter ou refuser une suggestion (motif affiché, votes figés)")
    .setDMPermission(false)
    .addSubcommand((sc) =>
      sc
        .setName("accepter")
        .setDescription("Accepter la suggestion et figer les votes")
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Lien Discord du message ou ID du message")
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName("raison")
            .setDescription("Motif (visible sur l’embed)")
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("refuser")
        .setDescription("Refuser la suggestion et figer les votes")
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Lien Discord du message ou ID du message")
            .setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName("raison")
            .setDescription("Motif (visible sur l’embed)")
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(1000)
        )
    ),
  async execute(client, interaction) {
    if (!interaction.inGuild() || !interaction.member) {
      await interaction.reply({ content: "Utilisable uniquement sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isSuggestionsStaff(interaction.member)) {
      await interaction.reply({
        content:
          "Réservé au **staff** suggestions (admin / gérer le serveur / gérer les messages / rôle configuré).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const sub = interaction.options.getSubcommand(true);
    const messageRaw = interaction.options.getString("message", true);
    const raison = interaction.options.getString("raison", true);
    const messageId = extractSuggestionMessageId(messageRaw);
    if (!messageId) {
      await interaction.reply({
        content:
          "Impossible de lire l’**ID du message**. Colle le **lien** du message (clic droit → Copier le lien) ou son **ID** seul.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const decision = sub === "accepter" ? "ACCEPTED" : "REJECTED";
    const result = await moderateSuggestion(client, {
      guild: interaction.guild,
      moderatorUserId: interaction.user.id,
      messageId,
      decision,
      reason: raison
    });

    if (result.error) {
      await interaction.editReply({ content: result.error });
      return;
    }
    const extra = result.warn ? `\n${result.warn}` : "";
    await interaction.editReply({
      content:
        (decision === "ACCEPTED"
          ? "Suggestion **acceptée**. Les votes sont clos ; les compteurs au moment de la décision restent sur l’embed."
          : "Suggestion **refusée**. Les votes sont clos ; les compteurs au moment de la décision restent sur l’embed.") + extra
    });
  }
};
