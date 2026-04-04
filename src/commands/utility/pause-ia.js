const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { setIaPaused, readState } = require("../../services/simbotRuntimeService");
const { canManageIaCommands } = require("../../utils/iaManageAccess");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pause-ia")
    .setDescription("Met en pause ou reprend l’IA Groq (/dinguerie et ping)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("pause").setDescription("Désactive /dinguerie et le ping IA"))
    .addSubcommand((s) => s.setName("reprendre").setDescription("Réactive l’IA (synonyme de restart)"))
    .addSubcommand((s) => s.setName("restart").setDescription("Réactive l’IA (synonyme de reprendre)")),
  async execute(client, interaction) {
    if (!canManageIaCommands(interaction)) {
      await interaction.reply({
        content: "Réservé à **Koyorin** (propriétaire IA) et aux **administrateurs** du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const cur = readState();

    if (sub === "pause") {
      if (cur.iaPaused) {
        await interaction.reply({ content: "L’IA est **déjà en pause**.", flags: MessageFlags.Ephemeral });
        return;
      }
      setIaPaused(true);
      await interaction.reply({
        content:
          "⏸️ **IA en pause** : `/dinguerie` et le **ping IA** sont désactivés jusqu’à `/pause-ia reprendre` ou `/pause-ia restart`.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub !== "reprendre" && sub !== "restart") {
      await interaction.reply({ content: "Sous-commande inconnue.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!cur.iaPaused) {
      await interaction.reply({ content: "L’IA est **déjà active**.", flags: MessageFlags.Ephemeral });
      return;
    }
    setIaPaused(false);
    await interaction.reply({
      content: "▶️ **IA réactivée** : `/dinguerie` et le ping fonctionnent à nouveau.",
      flags: MessageFlags.Ephemeral
    });
  }
};
