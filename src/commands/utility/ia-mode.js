const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { deferEphemeral } = require("../../utils/slashDefer");
const { canManageIaCommands } = require("../../utils/iaManageAccess");
const { ensureSettingsRow } = require("../../services/botProfileService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ia-mode")
    .setDescription("Ton des réponses au ping IA (#ia-simbot) : auto, hard ou soft")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Comportement du Simba pingé")
        .setRequired(true)
        .addChoices(
          { name: "Auto (selon le message : calme vs provoc)", value: "auto" },
          { name: "Hard (trash renforcé à chaque ping)", value: "hard" },
          { name: "Soft (proportionnel, évite l’excès sur un simple salut)", value: "soft" }
        )
    ),
  async execute(client, interaction) {
    if (!canManageIaCommands(interaction)) {
      await interaction.reply({
        content: "Réservé aux administrateurs ou aux comptes autorisés pour la gestion IA.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const mode = interaction.options.getString("mode", true);
    await deferEphemeral(interaction);

    try {
      await ensureSettingsRow(client.prisma);
      await client.prisma.botRuntimeSettings.update({
        where: { id: 1 },
        data: { iaPingTone: mode }
      });
    } catch (e) {
      await interaction.editReply({ content: `Erreur : ${String(e?.message || e).slice(0, 1900)}` });
      return;
    }

    const extra =
      mode === "auto"
        ? "\n\n_Si le mode est **auto**, la variable `GROQ_PING_TONE` dans `.env` peut encore forcer **hard** ou **soft** tant que tu n’as pas choisi hard/soft ici._"
        : "";

    await interaction.editReply({
      content:
        (mode === "auto"
          ? "Mode **auto** : le bot adapte le ton (salut calme → réponse mesurée ; insultes → plus dur)."
          : mode === "hard"
            ? "Mode **hard** : consignes **renforcées** sur **chaque** ping IA."
            : "Mode **soft** : consignes **douces** — moins d’insultes gratuites, surtout si le message est poli.") + extra
    });
  }
};
