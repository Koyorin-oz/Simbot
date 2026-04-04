const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { logApiError } = require("../../utils/botLogger");
const { generateGeminiDinguerie, formatGeminiErrorForUser } = require("../../services/geminiService");
const { isFrozen, isIaPaused } = require("../../services/simbotRuntimeService");
const {
  isGeminiOnCooldown,
  setGeminiCooldown,
  geminiCooldownSecondsLeft
} = require("../../services/geminiAccessService");
const { canManageIaCommands } = require("../../utils/iaManageAccess");

const DISCORD_MSG_MAX = 2000;

function truncate(s, max = DISCORD_MSG_MAX) {
  const t = String(s || "").trim();
  if (t.length > max) return t;
  return `${t.slice(0, max - 1)}…`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dinguerie")
    .setDescription("IA Llama 3 via Groq (gratuit — pas confondre avec Grok xAI)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("theme")
        .setDescription("Optionnel : thème ou consigne pour cette réponse")
        .setRequired(false)
        .setMaxLength(400)
    ),
  async execute(client, interaction) {
    if (isFrozen()) {
      await interaction.reply({
        content: "SimBot est en mode gelé, commande désactivée temporairement.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!canManageIaCommands(interaction)) {
      await interaction.reply({
        content: "Réservé à **Koyorin** (propriétaire IA) et aux **administrateurs** du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isIaPaused()) {
      await interaction.reply({
        content: "L’IA est **en pause**. Utilise `/pause-ia reprendre` ou `/pause-ia restart` pour la réactiver.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isGeminiOnCooldown(client, interaction.guildId, interaction.user.id)) {
      const sec = geminiCooldownSecondsLeft(client, interaction.guildId, interaction.user.id);
      await interaction.reply({
        content: `Patiente encore **${sec}s** avant une nouvelle requête IA (ping ou /dinguerie).`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!String(process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim()) {
      await interaction.reply({
        content:
          "Le bot n’a pas de **GROQ_API_KEY** dans `.env` — clé gratuite sur https://console.groq.com/keys puis redémarre SimBot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const theme = interaction.options.getString("theme") || "";

    await interaction.deferReply();

    try {
      const text = await generateGeminiDinguerie(theme, interaction.guild);
      setGeminiCooldown(client, interaction.guildId, interaction.user.id);
      await interaction.editReply({
        content: truncate(text),
        allowedMentions: { parse: [] },
        flags: MessageFlags.SuppressEmbeds
      });
    } catch (err) {
      logApiError("GROQ", err, { maxDetailChars: 800 });
      const hint =
        formatGeminiErrorForUser(err) ||
        "Impossible de sortir une dinguerie (réseau, filtre de contenu ou erreur API). Réessaie plus tard.";
      await interaction.editReply({
        content: hint,
        allowedMentions: { parse: [] }
      });
    }
  }
};
