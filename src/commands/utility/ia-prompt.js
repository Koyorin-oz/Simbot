const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const {
  loadSystemPrompt,
  getSystemPromptSource,
  writeSystemPromptFile,
  resetSystemPromptFileToFactory,
  resolveWritablePromptFilePath,
  DEFAULT_PROMPT_FILE,
  getActiveDefaultPromptPath
} = require("../../services/geminiService");
const { canManageIaCommands } = require("../../utils/iaManageAccess");

const CHUNK = 1900;
/** Plafond Discord pour une option string de slash commande (non contournable côté bot). */
const SLASH_STRING_MAX = 6000;

function joinPromptParts(parts) {
  return parts
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function sourceLabel(source, resolvedPath) {
  if (source === "env") {
    return "**Source :** variable d’environnement dans `.env` (`GROQ_SYSTEM_PROMPT`, etc.) — le fichier `groqSystemPrompt.txt` sur disque est ignoré. *(Les noms `GEMINI_*` / `GROK_*` restent des alias de secours.)*";
  }
  if (source === "file_custom") return `**Source :** fichier personnalisé \`${resolvedPath}\`.`;
  if (source === "file_default") return `**Source :** fichier par défaut \`${resolvedPath}\`.`;
  return "**Source :** texte de secours intégré au bot (aucun fichier lisible).";
}

async function sendEphemeralChunks(interaction, fullText) {
  const text = String(fullText || "").trim();
  const parts = [];
  for (let i = 0; i < text.length; i += CHUNK) {
    parts.push(text.slice(i, i + CHUNK));
  }
  if (parts.length === 0) {
    await interaction.reply({ content: "(vide)", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    content: parts.length > 1 ? `${parts[0]}\n\n— *${parts.length} messages*` : parts[0],
    flags: MessageFlags.Ephemeral
  });
  for (let k = 1; k < parts.length; k++) {
    // eslint-disable-next-line no-await-in-loop
    await interaction.followUp({
      content: `*(${k + 1}/${parts.length})*\n${parts[k]}`,
      flags: MessageFlags.Ephemeral
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ia-prompt")
    .setDescription("Voir ou modifier le prompt système Groq (/dinguerie)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("voir").setDescription("Affiche le prompt actuellement vu par Groq (éphémère)"))
    .addSubcommand((s) =>
      s
        .setName("definir")
        .setDescription(
          `Enregistre le prompt dans groqSystemPrompt.txt (jusqu'à ${4 * SLASH_STRING_MAX} car. avec les suites)`
        )
        .addStringOption((o) =>
          o
            .setName("texte")
            .setDescription(`Bloc 1 (max ${SLASH_STRING_MAX} car. — limite Discord)`)
            .setRequired(true)
            .setMaxLength(SLASH_STRING_MAX)
        )
        .addStringOption((o) =>
          o
            .setName("suite")
            .setDescription(`Bloc 2 optionnel (max ${SLASH_STRING_MAX} car., collé après le bloc 1)`)
            .setRequired(false)
            .setMaxLength(SLASH_STRING_MAX)
        )
        .addStringOption((o) =>
          o
            .setName("suite2")
            .setDescription(`Bloc 3 optionnel (max ${SLASH_STRING_MAX} car.)`)
            .setRequired(false)
            .setMaxLength(SLASH_STRING_MAX)
        )
        .addStringOption((o) =>
          o
            .setName("suite3")
            .setDescription(`Bloc 4 optionnel (max ${SLASH_STRING_MAX} car.)`)
            .setRequired(false)
            .setMaxLength(SLASH_STRING_MAX)
        )
    )
    .addSubcommand((s) =>
      s.setName("defaut").setDescription("Remet le prompt d’usine (fichier) — comme au premier démarrage")
    ),
  async execute(client, interaction) {
    if (!canManageIaCommands(interaction)) {
      await interaction.reply({
        content: "Réservé à **Koyorin** (propriétaire IA) et aux **administrateurs** du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const { path: writablePath } = resolveWritablePromptFilePath();

    if (sub === "voir") {
      const effective = loadSystemPrompt();
      const source = getSystemPromptSource();
      const pathForLabel =
        source === "file_default" ? getActiveDefaultPromptPath() : writablePath || DEFAULT_PROMPT_FILE;
      const header = [
        sourceLabel(source, pathForLabel),
        "",
        "**Prompt effectif :**"
      ].join("\n");
      await sendEphemeralChunks(interaction, `${header}\n\n${effective}`);
      return;
    }

    if (sub === "defaut") {
      try {
        resetSystemPromptFileToFactory();
        await interaction.reply({
          content:
            "Prompt remis sur la version **d’usine** et enregistré dans `src/data/groqSystemPrompt.txt`. Les prochains `/dinguerie` l’utiliseront (sauf si un prompt inline est défini dans `.env`, ex. `GROQ_SYSTEM_PROMPT`).",
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        const msg =
          err?.code === "ENV_BLOCKS"
            ? err.message
            : `Impossible d’écrire le fichier : ${err?.message || err}`;
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "definir") {
      const texte = joinPromptParts([
        interaction.options.getString("texte", true),
        interaction.options.getString("suite"),
        interaction.options.getString("suite2"),
        interaction.options.getString("suite3")
      ]);
      try {
        writeSystemPromptFile(texte);
        await interaction.reply({
          content: `Nouveau prompt enregistré (${texte.length} caractères). Fichier : \`${writablePath}\`\nLes prochains \`/dinguerie\` l’utilisent tout de suite (sauf prompt inline dans \`.env\`, ex. \`GROQ_SYSTEM_PROMPT\`).\n\n_Si tu dépasses encore cette limite, édite directement \`src/data/groqSystemPrompt.txt\` sur le PC / l’hébergeur._`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        let msg = err?.message || String(err);
        if (err?.code === "ENV_BLOCKS") msg = err.message;
        if (err?.code === "EMPTY") msg = err.message;
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
    }
  }
};
