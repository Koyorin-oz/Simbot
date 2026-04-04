const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const config = require("../../config");
const { buildSalonVerificationMessage } = require("../../services/welcomeVerifyService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Envoie le panneau Components V2 de vérification dans ce salon")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    const v = config.welcomeVerify;
    if (!v?.enabled) {
      await interaction.reply({ content: "`welcomeVerify` est désactivé dans la config.", flags: MessageFlags.Ephemeral });
      return;
    }

    const ch = interaction.channel;
    if (!ch?.isTextBased?.()) {
      await interaction.reply({ content: "Utilise cette commande dans un salon texte.", flags: MessageFlags.Ephemeral });
      return;
    }

    const me = interaction.guild.members.me;
    if (!ch.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply({
        content: "Je ne peux pas envoyer de message dans ce salon.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const payload = buildSalonVerificationMessage({ guildId: interaction.guild.id });
    await ch.send(payload);
    await interaction.reply({ content: "Panneau de vérification (Components V2) envoyé.", flags: MessageFlags.Ephemeral });
  }
};
