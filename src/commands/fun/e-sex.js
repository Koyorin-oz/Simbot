const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { deferPublic } = require("../../utils/slashDefer");

const KLIPY_API_SLUG_URL = "https://api.klipy.com/api/v1/gifs/rickroll-never-gonna-give-you-up-9";
/** Secours si l'API Klipy ne repond pas. */
const FALLBACK_GIF_URL =
  "https://static.klipy.com/ii/d6b0ce929193df3c242ac34b5654d2ce/f3/d4/rVCvc8Lo.gif";

/** @type {string|null} */
let cachedGifUrl = null;
/** @type {number} */
let cachedGifUrlAt = 0;
const GIF_CACHE_MS = 6 * 60 * 60 * 1000;

/**
 * GIF Klipy « Rickroll Never Gonna Give You Up » (qualite md/hd).
 * @returns {Promise<string>}
 */
async function resolveKlipyRickrollGifUrl() {
  if (cachedGifUrl && Date.now() - cachedGifUrlAt < GIF_CACHE_MS) {
    return cachedGifUrl;
  }

  try {
    const res = await fetch(KLIPY_API_SLUG_URL, {
      headers: { "User-Agent": "SimBot/1.0 (Discord; e-sex command)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const file = body?.data?.file;
    const url =
      file?.md?.gif?.url ||
      file?.hd?.gif?.url ||
      file?.sm?.gif?.url ||
      null;
    if (url) {
      cachedGifUrl = String(url);
      cachedGifUrlAt = Date.now();
      return cachedGifUrl;
    }
  } catch {
    /* fallback */
  }

  cachedGifUrl = FALLBACK_GIF_URL;
  cachedGifUrlAt = Date.now();
  return FALLBACK_GIF_URL;
}

function displayNameFor(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user.displayName ||
    interaction.user.globalName ||
    interaction.user.username
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("e-sex")
    .setDescription("Commande e-sex")
    .setDefaultMemberPermissions(null)
    .setDMPermission(false),
  async execute(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Commande utilisable uniquement sur un serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await deferPublic(interaction);

    const name = displayNameFor(interaction).toUpperCase();
    const gifUrl = await resolveKlipyRickrollGifUrl();

    const headline = `## ${name} A FAIS LA COMMANDE E SEX BAHAHAH`;
    const userId = interaction.user.id;

    const embed = new EmbedBuilder().setColor(0xff0044).setImage(gifUrl);

    await interaction.editReply({
      content: `<@${userId}>\n${headline}`,
      embeds: [embed],
      allowedMentions: { users: [userId] }
    });
  }
};
