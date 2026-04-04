const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-remove-role")
    .setDescription("Admin: retire un role a un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role a retirer").setRequired(true)),
  async execute(client, interaction) {
    const member = await interaction.guild.members.fetch(interaction.options.getUser("membre", true).id).catch(() => null);
    const role = interaction.options.getRole("role", true);

    if (!member) {
      await interaction.reply({ content: "Membre introuvable sur ce serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "Le bot doit avoir la permission Gerer les roles.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!role.editable) {
      await interaction.reply({
        content: "Je ne peux pas gerer ce role (hierarchie trop haute ou role systeme).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      await interaction.reply({ content: `${member.user.tag} n'a pas le role ${role}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await member.roles.remove(role.id, `Retrait par ${interaction.user.tag}`);
    await interaction.reply(`Role ${role} retire a ${member.user.tag}.`);
  }
};
