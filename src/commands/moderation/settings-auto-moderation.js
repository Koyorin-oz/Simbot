const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const {
  getGuildAutoModPayload,
  deleteCategoryByName,
  setGuildAutoModEnabled,
  addAutoModIgnoredChannel,
  removeAutoModIgnoredChannel,
  MAX_IGNORED_CHANNELS
} = require("../../services/autoModService");
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
    .addSubcommand((s) =>
      s
        .setName("salon-ignorer")
        .setDescription("Exclure un salon : plus de filtre mots ni liens (auto-mod)")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon texte / thread / annonces")
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.PrivateThread
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("salon-autoriser")
        .setDescription("Retirer un salon de la liste d exclusion auto-mod")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon a retirer de la liste")
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.PrivateThread
            )
        )
    )
    .addSubcommand((s) =>
      s.setName("salons-ignores-liste").setDescription("Liste des salons exclus de l auto-mod")
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
        const preview = c.terms.slice(0, 40).join(", ");
        const more = c.terms.length > 40 ? ` … (+${c.terms.length - 40})` : "";
        const nm = String(c.name).slice(0, 55);
        chunks.push(`**${nm}** (${c.terms.length}) : ${preview || "—"}${more}`.slice(0, 340));
      }
      const body = chunks.length ? chunks.join("\n\n") : "_Aucune catégorie._";
      await interaction.editReply({ content: `## Listes auto-mod\n${body}`.slice(0, 2000) });
      return;
    }

    if (sub === "salon-ignorer") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ch = interaction.options.getChannel("salon", true);
      try {
        const { added, count } = await addAutoModIgnoredChannel(client.prisma, guildId, ch.id);
        await interaction.editReply({
          content: added
            ? `Salon ${ch} ajouté à l’exclusion auto-mod (**${count}** / ${MAX_IGNORED_CHANNELS}).`
            : `Ce salon était déjà exclu (**${count}** salon(s)).`
        });
      } catch (e) {
        await interaction.editReply({ content: String(e?.message || e).slice(0, 2000) });
      }
      return;
    }

    if (sub === "salon-autoriser") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ch = interaction.options.getChannel("salon", true);
      const { removed, count } = await removeAutoModIgnoredChannel(client.prisma, guildId, ch.id);
      await interaction.editReply({
        content: removed
          ? `Salon ${ch} retiré de l’exclusion (**${count}** salon(s) restants).`
          : `Ce salon n’était pas dans la liste d’exclusion.`
      });
      return;
    }

    if (sub === "salons-ignores-liste") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const payload = await getGuildAutoModPayload(client.prisma, guildId);
      const ids = payload.ignoredChannelIds || [];
      if (!ids.length) {
        await interaction.editReply({ content: "_Aucun salon exclu._ Utilise `salon-ignorer`." });
        return;
      }
      const lines = ids.slice(0, 40).map((id) => `• <#${id}>`);
      const more = ids.length > 40 ? `\n… et ${ids.length - 40} autre(s)` : "";
      await interaction.editReply({
        content: `## Salons exclus (auto-mod)\n${lines.join("\n")}${more}`.slice(0, 2000)
      });
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
