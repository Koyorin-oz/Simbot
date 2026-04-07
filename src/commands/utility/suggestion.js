const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { safeImageUrl, submitNewSuggestion } = require("../../services/suggestionService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Proposer une idee (image : lien https ou piece jointe) — ping du role staff")
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("titre")
        .setDescription("Titre court")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(100)
    )
    .addStringOption((o) =>
      o
        .setName("texte")
        .setDescription("Description detaillee")
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(4000)
    )
    .addStringOption((o) =>
      o
        .setName("lien_image")
        .setDescription("Lien https vers une image (optionnel)")
        .setRequired(false)
    )
    .addAttachmentOption((o) =>
      o
        .setName("image")
        .setDescription("Image en piece jointe (optionnel, prioritaire sur le lien)")
        .setRequired(false)
    ),
  async execute(client, interaction) {
    if (!interaction.inGuild() || !interaction.member) {
      await interaction.reply({ content: "Utilisable uniquement sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const title = interaction.options.getString("titre", true).trim();
    const body = interaction.options.getString("texte", true).trim();
    const urlRaw = interaction.options.getString("lien_image")?.trim() || "";
    const attachment = interaction.options.getAttachment("image");

    let imageUrl = null;
    if (attachment) {
      const ct = attachment.contentType || "";
      if (!ct.startsWith("image/")) {
        await interaction.reply({
          content: "Le fichier joint doit etre une **image** (png, jpeg, gif, webp, etc.).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      imageUrl = attachment.url;
    } else if (urlRaw) {
      imageUrl = safeImageUrl(urlRaw);
      if (!imageUrl) {
        await interaction.reply({
          content: "Lien d'image invalide — utilise un lien **http** ou **https** vers une image, ou une piece jointe.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await submitNewSuggestion(client, interaction, { title, body, imageUrl });
    if (!result.ok) {
      await interaction.editReply({ content: result.error });
      return;
    }

    await interaction.editReply({ content: `Suggestion publiee : ${result.url}` });
  }
};
