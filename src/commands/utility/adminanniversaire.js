const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const {
  parseBirthdayInput,
  upsertBirthday,
  deleteBirthday
} = require("../../services/birthdayService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adminanniversaire")
    .setDescription("Gestion admin des anniversaires")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("definir")
        .setDescription("Definir la date d'anniversaire d'un membre sur le serveur.")
        .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("date")
            .setDescription("Date au format JJ/MM ou JJ/MM/AAAA")
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("supprimer")
        .setDescription("Supprimer la date d'anniversaire d'un membre sur le serveur.")
        .addUserOption((o) => o.setName("membre").setDescription("Membre cible").setRequired(true))
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getUser("membre", true);

    if (sub === "definir") {
      const rawDate = interaction.options.getString("date", true);
      const parsed = parseBirthdayInput(rawDate);
      if (!parsed.ok) {
        await interaction.reply({ content: parsed.error, flags: MessageFlags.Ephemeral });
        return;
      }

      await upsertBirthday(
        client.prisma,
        interaction.guildId,
        member.id,
        parsed.day,
        parsed.month,
        parsed.year
      );

      const label = parsed.year
        ? `${pad2(parsed.day)}/${pad2(parsed.month)}/${parsed.year}`
        : `${pad2(parsed.day)}/${pad2(parsed.month)}`;
      await interaction.reply({
        content: `🎂 Anniversaire de ${member.tag} enregistre: **${label}**`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const deleted = await deleteBirthday(client.prisma, interaction.guildId, member.id);
    await interaction.reply({
      content: deleted > 0
        ? `🗑️ Anniversaire de ${member.tag} supprime.`
        : `Aucun anniversaire enregistre pour ${member.tag}.`,
      flags: MessageFlags.Ephemeral
    });
  }
};

function pad2(value) {
  return String(value).padStart(2, "0");
}
