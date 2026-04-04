const {SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle, MessageFlags} = require("discord.js");
const { ensureUser } = require("../../services/economyService");
const { deferEphemeral } = require("../../utils/slashDefer");
const { formatSC } = require("../../utils/currency");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("transfert-sc")
    .setDescription("Transferer des Simba Coins a un membre (avec acceptation)")
    .addUserOption((o) => o.setName("membre").setDescription("Destinataire").setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName("montant")
        .setDescription("Montant a envoyer")
        .setMinValue(1)
        .setRequired(true)
    ),
  async execute(client, interaction) {
    const target = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    if (target.bot) {
      await interaction.reply({ content: "Tu ne peux pas transferer a un bot.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (target.id === interaction.user.id) {
      await interaction.reply({ content: "Tu ne peux pas te transferer de l'argent a toi-meme.", flags: MessageFlags.Ephemeral });
      return;
    }

    await deferEphemeral(interaction);
    const sender = await ensureUser(client.prisma, interaction.guildId, interaction.user.id);
    if (sender.simbaCoins < amount) {
      await interaction.editReply({
        content: `Solde insuffisant. Tu as ${formatSC(sender.simbaCoins)} SC.`
      });
      return;
    }

    if (!client.transferRequests) client.transferRequests = new Map();

    const transferId = interaction.id;
    const expiresAt = Date.now() + 60_000;
    client.transferRequests.set(transferId, {
      id: transferId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: null,
      fromUserId: interaction.user.id,
      toUserId: target.id,
      amount,
      status: "PENDING",
      expiresAt
    });

    const embed = new EmbedBuilder()
      .setColor(0x181627)
      .setTitle("Demande de transfert")
      .setDescription(
        [
          `💸 <@${interaction.user.id}> souhaite envoyer **${formatSC(amount)} SC** a <@${target.id}>.`,
          "",
          `${target}, acceptes-tu ce transfert ?`
        ].join("\n")
      )
      .setFooter({ text: "Expire dans 60 secondes." })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`transfer:accept:${transferId}`)
        .setLabel("Accepter")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`transfer:decline:${transferId}`)
        .setLabel("Refuser")
        .setStyle(ButtonStyle.Danger)
    );

    const message = await interaction.channel.send({
      content: `${target}`,
      embeds: [embed],
      components: [row]
    });

    client.transferRequests.get(transferId).messageId = message.id;

    await interaction.editReply({
      content: `Demande de transfert envoyee a ${target}.`
    });
  }
};
