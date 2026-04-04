const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");

const SCOPES = {
  daily: { dailyAt: null },
  weekly: { weeklyAt: null },
  monthly: { monthlyAt: null },
  tout: { dailyAt: null, weeklyAt: null, monthlyAt: null }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-reset-recompenses")
    .setDescription("Remet a zero les cooldowns quotidien / hebdomadaire / mensuel (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("periode")
        .setDescription("Quoi reinitialiser")
        .setRequired(true)
        .addChoices(
          { name: "Quotidien uniquement", value: "daily" },
          { name: "Hebdomadaire uniquement", value: "weekly" },
          { name: "Mensuel uniquement", value: "monthly" },
          { name: "Tout (les trois)", value: "tout" }
        )
    )
    .addUserOption((o) =>
      o
        .setName("membre")
        .setDescription("Membre cible (laisser vide = tout le serveur)")
        .setRequired(false)
    ),
  async execute(client, interaction) {
    const scope = interaction.options.getString("periode", true);
    const target = interaction.options.getUser("membre");
    const data = SCOPES[scope];
    if (!data) {
      await interaction.reply({ content: "Periode invalide.", flags: MessageFlags.Ephemeral });
      return;
    }

    const where = { guildId: interaction.guildId };
    if (target) where.userId = target.id;

    const result = await client.prisma.rewardClaim.updateMany({ where, data });

    const label =
      scope === "tout"
        ? "daily, weekly et monthly"
        : scope === "daily"
          ? "daily"
          : scope === "weekly"
            ? "weekly"
            : "monthly";

    const who = target ? `pour **${target.tag}**` : "pour **tout le serveur**";
    await interaction.reply({
      content: `Cooldowns **${label}** reinitialises ${who} (${result.count} ligne(s)).`,
      flags: MessageFlags.Ephemeral
    });
  }
};
