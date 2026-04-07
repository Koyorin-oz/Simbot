const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const config = require("../../config");
const { buildPanelPayload } = require("../../services/privateRoomService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voc-panel")
    .setDescription("Ouvre le panneau des salons vocaux prives (depuis le salon vocal d'accueil)")
    .setDMPermission(false),
  async execute(client, interaction) {
    const pr = config.privateRoom;
    if (!pr?.enabled) {
      await interaction.reply({ content: "Les salons vocaux prives sont desactives sur ce serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member;
    const vcId = member?.voice?.channelId;
    if (!vcId || String(vcId) !== String(pr.lobbyChannelId)) {
      await interaction.reply({
        content: `Tu dois etre dans le vocal **Creer votre salon** : <#${pr.lobbyChannelId}>`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const ch = interaction.channel;
    if (!ch?.isTextBased?.()) {
      await interaction.reply({ content: "Utilise cette commande dans un salon texte du serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const panelOnly = pr.panelTextChannelId;
    if (panelOnly && String(ch.id) !== String(panelOnly)) {
      await interaction.reply({
        content: `Utilise **/voc-panel** dans le salon dédié : <#${panelOnly}>.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const me = interaction.guild.members.me;
    if (!ch.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply({
        content: "Je ne peux pas envoyer de message dans ce salon. Choisis-en un autre ou ajuste mes permissions.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const payload = await buildPanelPayload(client, client.prisma, member, { pingUser: true });
    await interaction.reply({
      ...payload,
      allowedMentions: { users: [member.id] }
    });
  }
};
