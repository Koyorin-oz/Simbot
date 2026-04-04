const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { removeSalonSetup } = require("../../services/channelBootstrapService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configuration serveur (réservé aux administrateurs)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup((g) =>
      g
        .setName("salon")
        .setDescription("Salons créés via channelSetup / setup-salons")
        .addSubcommand((s) =>
          s
            .setName("supprimer")
            .setDescription(
              "Supprime les salons enregistrés, les catégories liées, et vide channelSetup.json (sans recréer)"
            )
            .addStringOption((o) =>
              o
                .setName("confirmer")
                .setDescription("Écris exactement : SUPPRIMER")
                .setRequired(true)
            )
        )
    ),
  async execute(client, interaction) {
    const grp = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (grp !== "salon" || sub !== "supprimer") {
      await interaction.reply({ content: "Sous-commande inconnue.", flags: MessageFlags.Ephemeral });
      return;
    }

    const c = interaction.options.getString("confirmer");
    if (c !== "SUPPRIMER") {
      await interaction.reply({
        content: "Pour confirmer, mets l’option **confirmer** sur **SUPPRIMER** (tout en majuscules).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await removeSalonSetup(interaction.guild);
      if (!result.ok) {
        await interaction.editReply({ content: result.message });
        return;
      }
      await interaction.editReply({
        content:
          "**Terminé.** Les salons du setup ont été supprimés et l’entrée de ce serveur a été retirée de `channelSetup.json`. " +
          "La config en mémoire a été réalignée sur les **valeurs par défaut** de `config.js` (comme sans setup). " +
          "Pour être 100 % synchro avec un fichier vide, **redémarre le bot**."
      });
    } catch (e) {
      await interaction.editReply({ content: `Erreur : ${e.message || e}`.slice(0, 2000) });
    }
  }
};
