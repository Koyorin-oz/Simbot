const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { buildQuoteCard } = require("../../services/quoteCard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("citer")
    .setDescription("Genere une carte citation a partir d'un message du salon")
    .addStringOption((o) =>
      o
        .setName("message_id")
        .setDescription("ID du message a citer (clic droit sur le message > Copier l'identifiant)")
        .setRequired(true)
    ),
  async execute(client, interaction) {
    await interaction.deferReply();

    const id = interaction.options.getString("message_id", true).trim();
    if (!/^\d{17,20}$/.test(id)) {
      await interaction.editReply({ content: "ID de message invalide." });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isTextBased?.() || typeof channel.messages?.fetch !== "function") {
      await interaction.editReply({ content: "Utilise cette commande dans un salon texte." });
      return;
    }

    const message = await channel.messages.fetch(id).catch(() => null);
    if (!message) {
      await interaction.editReply({
        content: "Message introuvable dans ce salon (verifie l'ID ou les permissions du bot)."
      });
      return;
    }

    const member = message.member;
    const displayName = member?.displayName ?? message.author.displayName ?? message.author.username;
    const username = message.author.username;
    const content = message.content || "";
    const avatarUrl = message.author.displayAvatarURL({ extension: "png", size: 512 });

    const buffer = await buildQuoteCard(avatarUrl, content, displayName, username);
    const file = new AttachmentBuilder(buffer, { name: "citation.png" });

    await interaction.editReply({
      content: `Citation de <@${message.author.id}>`,
      files: [file]
    });
  }
};
