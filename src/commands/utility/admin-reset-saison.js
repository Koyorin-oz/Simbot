const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { resetEconomyForGuild } = require("../../services/inventoryService");
const { ensureRankRolesForGuild, syncRankRoleForMember } = require("../../services/rankRoleService");

const BATCH_SIZE = 8;
const PROGRESS_EVERY = 40;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-reset-saison")
    .setDescription("Reset saison: SC/SP/LP + items + boosts pour tout le serveur.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("confirmer")
        .setDescription("Ecris RESET pour confirmer")
        .setRequired(true)
    ),
  async execute(client, interaction) {
    const confirm = (interaction.options.getString("confirmer", true) || "").trim().toUpperCase();
    if (confirm !== "RESET") {
      await interaction.reply({
        content: "Confirmation invalide. Ecris exactement `RESET` pour lancer le reset saison.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await resetEconomyForGuild(client.prisma, interaction.guildId);

      await ensureRankRolesForGuild(client, interaction.guild).catch(() => null);

      const rows = await client.prisma.user.findMany({
        where: { guildId: interaction.guildId },
        select: { userId: true }
      });

      const guild = interaction.guild;
      let rankRolesSynced = 0;
      let rankRolesFailed = 0;
      let skippedNotInGuild = 0;
      const total = rows.length;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const outcomes = await Promise.all(
          chunk.map(async ({ userId }) => {
            let member = guild.members.cache.get(userId);
            if (!member) {
              member = await guild.members.fetch({ user: userId, force: false }).catch(() => null);
            }
            if (!member || member.user?.bot) {
              return { kind: member ? "skip_bot" : "skip_left" };
            }
            const status = await syncRankRoleForMember(client, member, 0).catch(() => ({ ok: false }));
            return { kind: "sync", status };
          })
        );

        for (const o of outcomes) {
          if (o.kind === "skip_left" || o.kind === "skip_bot") {
            if (o.kind === "skip_left") skippedNotInGuild += 1;
            continue;
          }
          if (o.status?.ok) rankRolesSynced += 1;
          else rankRolesFailed += 1;
        }

        const done = Math.min(i + BATCH_SIZE, total);
        if (total > PROGRESS_EVERY && done % PROGRESS_EVERY === 0 && done < total) {
          await interaction
            .editReply({
              content:
                `⏳ Reset saison en cours… **${done} / ${total}** profils — synchro des roles de rang (ne quitte pas Discord).`
            })
            .catch(() => null);
        }
      }

      await interaction.editReply({
        content:
          "✅ Reset saison termine.\n" +
          `- Profils reset: **${result.users}**\n` +
          `- Cooldowns recompenses reset: **${result.claims}**\n` +
          `- Inventaires reset: **${result.itemsReset}**\n` +
          `- Roles de rang OK: **${rankRolesSynced}**\n` +
          `- Echecs sync role: **${rankRolesFailed}** (hierarchie / permissions)\n` +
          `- Absents du serveur (BDD seulement): **${skippedNotInGuild}**\n` +
          "\n_Les roles sont alignes pour les membres qui ont un profil en base (plus rapide qu'avant). Les autres seront mis a jour a leur prochaine activite._"
      });
    } catch (e) {
      console.error("[ADMIN_RESET_SAISON]", e);
      await interaction
        .editReply({
          content: `Erreur pendant le reset: ${e?.message || String(e)}`.slice(0, 2000)
        })
        .catch(() => null);
    }
  }
};
