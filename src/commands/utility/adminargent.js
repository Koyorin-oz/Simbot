const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { ensureUser } = require("../../services/economyService");
const { formatSC } = require("../../utils/currency");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adminargent")
    .setDescription("Gestion admin de l'argent")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup((g) =>
      g
        .setName("ajouter")
        .setDescription("Ajouter de l'argent")
        .addSubcommand((s) =>
          s
            .setName("membre")
            .setDescription("Ajouter de l'argent a un membre")
            .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
            .addIntegerOption((o) =>
              o.setName("montant").setDescription("Montant a ajouter").setMinValue(1).setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName("role")
            .setDescription("Ajouter de l'argent a tous les membres possedant un role specifique.")
            .addRoleOption((o) => o.setName("role").setDescription("Role cible").setRequired(true))
            .addIntegerOption((o) =>
              o.setName("montant").setDescription("Montant a ajouter").setMinValue(1).setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName("serveur")
            .setDescription("Ajouter de l'argent a tous les membres du serveur.")
            .addIntegerOption((o) =>
              o.setName("montant").setDescription("Montant a ajouter").setMinValue(1).setRequired(true)
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("definir")
        .setDescription("Definir l'argent d'un membre.")
        .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
        .addIntegerOption((o) =>
          o.setName("montant").setDescription("Nouveau montant").setMinValue(0).setRequired(true)
        )
    )
    .addSubcommandGroup((g) =>
      g
        .setName("reinitialiser")
        .setDescription("Reinitialiser des soldes")
        .addSubcommand((s) =>
          s
            .setName("serveur")
            .setDescription("Reinitialiser l'argent de tous les membres du serveur.")
        )
    ),
  async execute(client, interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (group === "ajouter" && sub === "membre") {
      const member = interaction.options.getUser("membre", true);
      const amount = interaction.options.getInteger("montant", true);
      await ensureUser(client.prisma, interaction.guildId, member.id);
      const updated = await client.prisma.user.update({
        where: { userId: member.id },
        data: { simbaCoins: { increment: amount } }
      });
      await interaction.editReply(
        `Ajout de ${formatSC(amount)} SC a ${member.tag}. Nouveau solde: ${formatSC(updated.simbaCoins)} SC.`
      );
      return;
    }

    if (group === "ajouter" && sub === "role") {
      const role = interaction.options.getRole("role", true);
      const amount = interaction.options.getInteger("montant", true);

      await interaction.guild.members.fetch();
      const targets = interaction.guild.members.cache.filter((m) => !m.user.bot && m.roles.cache.has(role.id));
      if (!targets.size) {
        await interaction.editReply("Aucun membre humain n'a ce role.");
        return;
      }

      let updatedCount = 0;
      for (const member of targets.values()) {
        // eslint-disable-next-line no-await-in-loop
        await ensureUser(client.prisma, interaction.guildId, member.id);
        // eslint-disable-next-line no-await-in-loop
        await client.prisma.user.update({
          where: { userId: member.id },
          data: { simbaCoins: { increment: amount } }
        });
        updatedCount += 1;
      }

      await interaction.editReply(
        `Ajout de ${formatSC(amount)} SC a ${updatedCount} membre(s) du role ${role}.`
      );
      return;
    }

    if (group === "ajouter" && sub === "serveur") {
      const amount = interaction.options.getInteger("montant", true);
      await interaction.guild.members.fetch();
      const targets = interaction.guild.members.cache.filter((m) => !m.user.bot);
      if (!targets.size) {
        await interaction.editReply("Aucun membre humain trouve sur le serveur.");
        return;
      }

      let updatedCount = 0;
      for (const member of targets.values()) {
        // eslint-disable-next-line no-await-in-loop
        await ensureUser(client.prisma, interaction.guildId, member.id);
        // eslint-disable-next-line no-await-in-loop
        await client.prisma.user.update({
          where: { userId: member.id },
          data: { simbaCoins: { increment: amount } }
        });
        updatedCount += 1;
      }

      await interaction.editReply(
        `Ajout de ${formatSC(amount)} SC a ${updatedCount} membre(s) du serveur.`
      );
      return;
    }

    if (!group && sub === "definir") {
      const member = interaction.options.getUser("membre", true);
      const amount = interaction.options.getInteger("montant", true);
      await ensureUser(client.prisma, interaction.guildId, member.id);
      await client.prisma.user.update({
        where: { userId: member.id },
        data: { simbaCoins: amount }
      });
      await interaction.editReply(
        `Argent de ${member.tag} defini a ${formatSC(amount)} SC.`
      );
      return;
    }

    if (group === "reinitialiser" && sub === "serveur") {
      await interaction.guild.members.fetch();
      const targets = interaction.guild.members.cache.filter((m) => !m.user.bot);
      if (!targets.size) {
        await interaction.editReply("Aucun membre humain trouve sur le serveur.");
        return;
      }

      let updatedCount = 0;
      for (const member of targets.values()) {
        // eslint-disable-next-line no-await-in-loop
        await ensureUser(client.prisma, interaction.guildId, member.id);
        // eslint-disable-next-line no-await-in-loop
        await client.prisma.user.update({
          where: { userId: member.id },
          data: { simbaCoins: 0 }
        });
        updatedCount += 1;
      }

      await interaction.editReply(`Reinitialisation terminee: ${updatedCount} membre(s) remis a ${formatSC(0)} SC.`);
    }
  }
};
