const {SlashCommandBuilder, MessageFlags} = require("discord.js");
const { ensureUser } = require("../../services/economyService");
const { deferEphemeral } = require("../../utils/slashDefer");
const { addCoffeeItem, addCustomRoleItem, getInventorySnapshot } = require("../../services/inventoryService");
const { formatSC } = require("../../utils/currency");
const INT32_MAX = 2_147_483_647;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("donner")
    .setDescription("Donner de l'argent, des SP ou des items a un membre.")
    .addSubcommand((s) =>
      s
        .setName("sc")
        .setDescription("Donner des Simba Coins (SC).")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Destinataire").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant SC").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("argent")
        .setDescription("Donner des Simba Coins (SC).")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Destinataire").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant SC").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("sp")
        .setDescription("Donner des Simba Points (SP).")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Destinataire").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant SP").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("lp")
        .setDescription("Donner des Level Points (LP).")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Destinataire").setRequired(true))
        .addIntegerOption((o) => o.setName("montant").setDescription("Montant LP").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("item")
        .setDescription("Donner un item de ton inventaire.")
        .addUserOption((o) => o.setName("utilisateur").setDescription("Destinataire").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("item")
            .setDescription("Item a donner")
            .setRequired(true)
            .addChoices(
              { name: "Cafe", value: "coffee" },
              { name: "Role perso", value: "custom_role" }
            )
        )
        .addIntegerOption((o) => o.setName("quantite").setDescription("Quantite").setMinValue(1).setRequired(true))
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand(true);
    const target = interaction.options.getUser("utilisateur", true);
    const fromId = interaction.user.id;
    const toId = target.id;

    if (fromId === toId) {
      await interaction.reply({ content: "Tu ne peux pas te donner des ressources a toi-meme.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (target.bot) {
      await interaction.reply({ content: "Tu ne peux pas donner des ressources a un bot.", flags: MessageFlags.Ephemeral });
      return;
    }

    await deferEphemeral(interaction);
    const fromUser = await ensureUser(client.prisma, interaction.guildId, fromId);
    await ensureUser(client.prisma, interaction.guildId, toId);

    if (sub === "argent" || sub === "sc") {
      const amount = interaction.options.getInteger("montant", true);
      if (fromUser.simbaCoins < amount) {
        await interaction.editReply({ content: "Solde SC insuffisant." });
        return;
      }
      const toUser = await ensureUser(client.prisma, interaction.guildId, toId);
      const room = INT32_MAX - Number(toUser.simbaCoins || 0);
      if (room <= 0) {
        await interaction.editReply({ content: "Le destinataire est deja au maximum de SC." });
        return;
      }
      const transfer = Math.min(amount, room);
      await client.prisma.$transaction([
        client.prisma.user.update({
          where: { userId: fromId },
          data: { simbaCoins: { decrement: transfer } }
        }),
        client.prisma.user.update({
          where: { userId: toId },
          data: { simbaCoins: { increment: transfer } }
        })
      ]);
      await interaction.editReply(`Tu as donne **${formatSC(transfer)} SC** a ${target}.`);
      return;
    }

    if (sub === "sp") {
      const amount = interaction.options.getInteger("montant", true);
      if (fromUser.simbaPoints < amount) {
        await interaction.editReply({ content: "Tu n'as pas assez de SP." });
        return;
      }
      const toUser = await ensureUser(client.prisma, interaction.guildId, toId);
      const room = INT32_MAX - Number(toUser.simbaPoints || 0);
      if (room <= 0) {
        await interaction.editReply({ content: "Le destinataire est deja au maximum de SP." });
        return;
      }
      const transfer = Math.min(amount, room);
      await client.prisma.$transaction([
        client.prisma.user.update({
          where: { userId: fromId },
          data: { simbaPoints: { decrement: transfer } }
        }),
        client.prisma.user.update({
          where: { userId: toId },
          data: { simbaPoints: { increment: transfer } }
        })
      ]);
      await interaction.editReply(`Tu as donne **${transfer.toLocaleString("fr-FR")} SP** a ${target}.`);
      return;
    }

    if (sub === "lp") {
      const amount = interaction.options.getInteger("montant", true);
      if (fromUser.levelPoints < amount) {
        await interaction.editReply({ content: "Tu n'as pas assez de LP." });
        return;
      }
      const toUser = await ensureUser(client.prisma, interaction.guildId, toId);
      const room = INT32_MAX - Number(toUser.levelPoints || 0);
      if (room <= 0) {
        await interaction.editReply({ content: "Le destinataire est deja au maximum de LP." });
        return;
      }
      const transfer = Math.min(amount, room);
      await client.prisma.$transaction([
        client.prisma.user.update({
          where: { userId: fromId },
          data: { levelPoints: { decrement: transfer } }
        }),
        client.prisma.user.update({
          where: { userId: toId },
          data: { levelPoints: { increment: transfer } }
        })
      ]);
      await interaction.editReply(`Tu as donne **${transfer.toLocaleString("fr-FR")} LP** a ${target}.`);
      return;
    }

    const item = interaction.options.getString("item", true);
    const qty = interaction.options.getInteger("quantite", true);
    const fromInv = await getInventorySnapshot(client.prisma, interaction.guildId, fromId);

    if (item === "coffee") {
      if (fromInv.coffeeCount < qty) {
        await interaction.editReply({ content: "Tu n'as pas assez de cafes dans ton inventaire." });
        return;
      }
      await client.prisma.$executeRaw`
        UPDATE user_inventory
        SET coffeeCount = coffeeCount - ${qty},
            updatedAt = datetime('now')
        WHERE guildId = ${interaction.guildId} AND userId = ${fromId}
      `;
      const next = await addCoffeeItem(client.prisma, interaction.guildId, toId, qty);
      await interaction.editReply(`Tu as donne **${qty} cafe(s)** a ${target}. (Il en a maintenant **${next}**.)`);
      return;
    }

    if (fromInv.customRoleCount < qty) {
      await interaction.editReply({ content: "Tu n'as pas assez d'items Role Perso." });
      return;
    }
    const targetUser = await ensureUser(client.prisma, interaction.guildId, toId);
    if (targetUser.customRoleUnlocked || targetUser.customRoleId) {
      await interaction.editReply({
        content: "Le destinataire a deja un role perso debloque/cree. Don impossible."
      });
      return;
    }

    await client.prisma.$executeRaw`
      UPDATE user_inventory
      SET customRoleCount = customRoleCount - ${qty},
          updatedAt = datetime('now')
      WHERE guildId = ${interaction.guildId} AND userId = ${fromId}
    `;
    const next = await addCustomRoleItem(client.prisma, interaction.guildId, toId, qty);
    await interaction.editReply(`Tu as donne **${qty} item(s) Role Perso** a ${target}. (Il en a maintenant **${next}**.)`);
  }
};
