const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const {
  parseBirthdayInput,
  upsertBirthday,
  deleteBirthday,
  deleteAbsentMemberBirthdays,
  parseDiscordUserId
} = require("../../services/birthdayService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("adminanniversaire")
    .setDescription("Gestion admin des anniversaires")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("definir")
        .setDescription("Définir la date d'anniversaire d'un membre.")
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
        .setDescription("Supprimer l'anniversaire d'un membre (même banni / parti du serveur).")
        .addUserOption((o) =>
          o.setName("membre").setDescription("Membre encore visible sur Discord").setRequired(false)
        )
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("ID Discord si banni ou absent (ex. 123456789012345678)")
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("nettoyer-absents")
        .setDescription("Retire tous les anniversaires des membres plus sur le serveur (bannis / partis).")
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "definir") {
      const member = interaction.options.getUser("membre", true);
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
        content: `🎂 Anniversaire de ${member.tag} enregistré : **${label}**`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "supprimer") {
      const member = interaction.options.getUser("membre");
      const idRaw = interaction.options.getString("id");
      let userId = member?.id || parseDiscordUserId(idRaw);
      if (!userId) {
        await interaction.reply({
          content: "Indique **membre** (s'il est encore sur le serveur) ou **id** (snowflake Discord si banni / parti).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const deleted = await deleteBirthday(client.prisma, interaction.guildId, userId);
      let label = member ? member.tag : `\`${userId}\``;
      if (!member) {
        const u = await client.users.fetch(userId).catch(() => null);
        if (u) label = u.tag;
      }

      await interaction.reply({
        content:
          deleted > 0
            ? `🗑️ Anniversaire de **${label}** supprimé.`
            : `Aucun anniversaire enregistré pour **${label}**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "nettoyer-absents") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { removed, userIds } = await deleteAbsentMemberBirthdays(client.prisma, interaction.guild);
      if (removed === 0) {
        await interaction.editReply({
          content: "Aucun anniversaire fantôme — tous les enregistrements correspondent à des membres encore sur le serveur."
        });
        return;
      }
      const preview = userIds.slice(0, 8).map((id) => `\`${id}\``).join(", ");
      const extra = userIds.length > 8 ? ` (+${userIds.length - 8} autres)` : "";
      await interaction.editReply({
        content: `🗑️ **${removed}** anniversaire(s) supprimé(s) (membres absents / bannis) : ${preview}${extra}`
      });
    }
  }
};

function pad2(value) {
  return String(value).padStart(2, "0");
}
