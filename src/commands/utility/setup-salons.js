const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");
const { bootstrapChannels, MODULE_KEYS, normalizeModulesAllTrue } = require("../../services/channelBootstrapService");

function collectModules(interaction) {
  if (interaction.options.getBoolean("tout") === true) {
    return normalizeModulesAllTrue();
  }
  const m = {};
  for (const k of MODULE_KEYS) {
    m[k] = interaction.options.getBoolean(k) === true;
  }
  return m;
}

function buildReply({ setup, lines, warnings }, prefix) {
  const detail = [];
  if (setup.welcomeChannelId) detail.push(`Bienvenue : <#${setup.welcomeChannelId}>`);
  if (setup.reglementChannelId) detail.push(`Reglement : <#${setup.reglementChannelId}>`);
  if (setup.rulesChannelId) detail.push(`Verification : <#${setup.rulesChannelId}>`);
  if (setup.commandsChannelId) detail.push(`Commandes (verif) : <#${setup.commandsChannelId}>`);
  if (setup.modLogChannelId) detail.push(`Logs : <#${setup.modLogChannelId}>`);
  if (setup.ticketPanelChannelId) detail.push(`Ticket : <#${setup.ticketPanelChannelId}>`);
  if (setup.ticketCategoryId) detail.push(`Categorie tickets : \`${setup.ticketCategoryId}\``);
  if (setup.panelTextChannelId) detail.push(`Panel voc : <#${setup.panelTextChannelId}>`);
  if (setup.lobbyChannelId) detail.push(`Lobby : <#${setup.lobbyChannelId}>`);
  if (setup.suggestionsChannelId) detail.push(`Suggestions : <#${setup.suggestionsChannelId}>`);
  if (setup.verifyTestCategoryId) detail.push(`Categorie nouveaux : \`${setup.verifyTestCategoryId}\``);
  if (setup.verifyMainCategoryId) detail.push(`Categorie communaute : \`${setup.verifyMainCategoryId}\``);

  const parts = [
    prefix,
    "**Cette session :**",
    ...(lines.length ? lines : ["(rien de nouveau — tout etait deja la)"]),
    "",
    "**Config enregistree** (`src/data/channelSetup.json`). **DISCORD_GUILD_ID** dans `.env`. Redemarre si besoin.",
    "",
    ...warnings.map((w) => `⚠ ${w}`),
    ...(warnings.length ? [""] : []),
    "**Recap IDs :**",
    ...(detail.length ? detail : ["(aucun salon setup pour l’instant)"]),
    "",
    "Style salons : **emoji | nom**. Option **suggestions** : salon 💡 | suggestions (Components V2 + votes). Définis **`SUGGESTIONS_STAFF_ROLE_ID`** dans `.env` pour le rôle qui peut écrire dans ce salon."
  ];
  return parts.join("\n").slice(0, 2000);
}

const bool = (name, desc) => (b) => b.setName(name).setDescription(desc);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-salons")
    .setDescription("Cree les salons (style emoji | nom, comme ton screen Discord)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("creer")
        .setDescription("Coche ce que tu veux (ou Tout)")
        .addBooleanOption(bool("tout", "Tout creer d’un coup"))
        .addBooleanOption(bool("bienvenue", "🛫 | bienvenue (haut de liste, sans categorie)"))
        .addBooleanOption(bool("verification", "✅ | vérification (Components V2 + boutons, sans categorie)"))
        .addBooleanOption(bool("reglement", "☑️ 📃 | règlement (sans categorie)"))
        .addBooleanOption(bool("logs_mod", "🔒 | logs-mod (dans 🤖 | bot)"))
        .addBooleanOption(bool("tickets_panel", "🎟️ | ticket (dans 🤖 | bot)"))
        .addBooleanOption(
          bool(
            "salon_commandes",
            "📡 | commandes — verifies si roleVerifiedId dans config (sinon ouvert tests)"
          )
        )
        .addBooleanOption(bool("categorie_tickets", "Categorie 🎫 | tickets (salons ticket)"))
        .addBooleanOption(bool("panel_voc", "Categorie voc + lobby + panel voc"))
        .addBooleanOption(
          bool(
            "suggestions",
            "💡 | suggestions — votes boutons, membres verif lisent/votent, staff écrit (voir .env)"
          )
        )
        .addBooleanOption(bool("categories_accueil", "Categories 🔐 nouveaux + ✨ communaute (verify)"))
    )
    .addSubcommand((s) =>
      s
        .setName("reinitialiser")
        .setDescription("Supprime tout le setup precedent puis recree TOUT")
        .addStringOption((o) =>
          o
            .setName("confirmer")
            .setDescription("Ecris exactement : SUPPRIMER")
            .setRequired(true)
        )
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "reinitialiser") {
      const c = interaction.options.getString("confirmer");
      if (c !== "SUPPRIMER") {
        await interaction.reply({
          content: "Pour confirmer, mets l'option **confirmer** = **SUPPRIMER** (en majuscules).",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      if (sub === "reinitialiser") {
        const result = await bootstrapChannels(interaction.guild, { force: true });
        await interaction.editReply({
          content: buildReply(result, "**Reinitialisation terminee.** Tout a ete recree.\n\n")
        });
        return;
      }

      const modules = collectModules(interaction);
      const result = await bootstrapChannels(interaction.guild, { modules });
      await interaction.editReply({
        content: buildReply(result, "**Setup salons.**\n\n")
      });
    } catch (e) {
      await interaction.editReply({ content: `Erreur : ${e.message || e}`.slice(0, 2000) });
    }
  }
};
