const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { getGuildAutoModPayload, deleteCategoryByName, setGuildAutoModEnabled } = require("../../services/autoModService");
const { buildAutoModEmbed, buildAutoModRows } = require("../../utils/autoModPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("settings-auto-moderation")
    .setDescription("Configurer l’auto-modération (listes par catégorie, style DraftBot)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName("panel").setDescription("Panneau : boutons + formulaire"))
    .addSubcommand((s) => s.setName("liste").setDescription("Liste détaillée des termes (éphemère)"))
    .addSubcommand((s) =>
      s
        .setName("supprimer")
        .setDescription("Supprimer une catégorie par son nom")
        .addStringOption((o) =>
          o.setName("categorie").setDescription("Nom exact ou proche de la catégorie").setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName("activer").setDescription("Activer la suppression auto des messages"))
    .addSubcommand((s) => s.setName("desactiver").setDescription("Désactiver l’auto-mod")),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (sub === "panel") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const payload = await getGuildAutoModPayload(client.prisma, guildId);
      await interaction.editReply({
        embeds: [buildAutoModEmbed(payload)],
        components: buildAutoModRows(payload)
      });
      return;
    }

    if (sub === "liste") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const payload = await getGuildAutoModPayload(client.prisma, guildId);
      const chunks = [];
      for (const c of payload.categories) {
        const preview = c.terms.slice(0, 60).join(", ");
        const more = c.terms.length > 60 ? ` … (+${c.terms.length - 60})` : "";
        chunks.push(`**${c.name}** (${c.terms.length}) : ${preview || "—"}${more}`);
      }
      const body = chunks.length ? chunks.join("\n\n") : "_Aucune catégorie._";
      await interaction.editReply({ content: `## Listes auto-mod\n${body}`.slice(0, 3900) });
      return;
    }

    if (sub === "supprimer") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.options.getString("categorie", true);
      const { deleted } = await deleteCategoryByName(client.prisma, guildId, name);
      await interaction.editReply({
        content: deleted ? `Catégorie **${name.trim()}** supprimée.` : `Aucune catégorie trouvée pour « ${name.trim()} ».`
      });
      return;
    }

    if (sub === "activer") {
      await setGuildAutoModEnabled(client.prisma, guildId, true);
      await interaction.reply({ content: "Auto-mod **activée** sur ce serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "desactiver") {
      await setGuildAutoModEnabled(client.prisma, guildId, false);
      await interaction.reply({ content: "Auto-mod **désactivée**.", flags: MessageFlags.Ephemeral });
      return;
    }
  }
};
