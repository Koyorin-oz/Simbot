const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
const { ensurePrivateVoiceLobbyInCategory } = require("../../services/channelBootstrapService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voc-panel")
    .setDescription(
      "Configure le vocal « Creer votre salon » dans la categorie vocaux (meme que les vocaux prives)"
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Cette commande ne s'utilise que sur un serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const member = interaction.member;
    if (!member?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "Il te faut la permission **Gerer les salons**.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await ensurePrivateVoiceLobbyInCategory(interaction.guild);
    if (!result.ok) {
      await interaction.editReply({ content: result.error });
      return;
    }

    const { lobby, category, created } = result;
    const part = created
      ? "Le vocal d'accueil a ete **cree** dans cette categorie."
      : "Le vocal d'accueil est **pret** (deja present ou retrouve par son nom).";
    await interaction.editReply({
      content: [
        part,
        `**Categorie** : ${category.name} (\`${category.id}\`)`,
        `**Lobby** : ${lobby} (\`${lobby.id}\`)`,
        "",
        "Les membres rejoignent ce vocal : le bot cree leur salon prive **dans la meme categorie** et poste le panneau dans le chat de la voc."
      ].join("\n")
    });
  }
};
