const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { buildSecteSimbaButtonPayload, getSecteSimbaRoleId } = require("../../utils/secteSimbaPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("secte-simba")
    .setDescription("Envoie le bouton pour claim le rôle Secte Simba (admin)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(client, interaction) {
    if (!interaction.inGuild() || !interaction.channel?.isTextBased?.()) {
      await interaction.reply({
        content: "Utilise cette commande dans un salon texte du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const roleId = getSecteSimbaRoleId();
    if (!/^\d{17,22}$/.test(roleId)) {
      await interaction.reply({
        content: "Rôle Secte Simba non configuré (`config.secteSimba.roleId`).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      await interaction.reply({
        content: `Rôle introuvable (\`${roleId}\`).`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const me = interaction.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        content: "Je n'ai pas **Gérer les rôles**.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (role.position >= me.roles.highest.position) {
      await interaction.reply({
        content: "Mon rôle doit être **au-dessus** du rôle Secte Simba dans Paramètres → Rôles.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.channel.send(buildSecteSimbaButtonPayload());
    await interaction.reply({
      content: "Bouton envoyé dans ce salon.",
      flags: MessageFlags.Ephemeral
    });
  }
};
