const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits
} = require("discord.js");
const { loadJokes } = require("../../services/jokeScheduleService");
const { hasUsedBlagueToday, setLastBlagueDay } = require("../../services/blagueCooldownService");
const { storePunchline, revealCustomId } = require("../../utils/blagueRevealStore");

const STAFF_ROLE_ID = "736488084929118298";

function normalizeJoke(j) {
  return {
    setup: String(j.setup || j.s || "").trim(),
    punchline: String(j.punchline || j.p || "").trim(),
    category: String(j.category || j.c || "Noir").trim() || "Noir"
  };
}

function jokeDescription(joke) {
  if (joke.punchline) return `**${joke.setup}**\n\n${joke.punchline}`;
  if (joke.setup.startsWith("—") || joke.setup.includes("\n—")) return joke.setup;
  return `**${joke.setup}**`;
}

function bypassBlagueCooldown(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.has(STAFF_ROLE_ID)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blague")
    .setDescription("Une blague humour noir du catalogue (1 fois par jour par membre)"),
  async execute(client, interaction) {
    const jokesRaw = loadJokes()
      .map(normalizeJoke)
      .filter((j) => j.setup || j.punchline);
    if (jokesRaw.length === 0) {
      await interaction.reply({ content: "Le catalogue de blagues est vide.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member;
    const bypass = bypassBlagueCooldown(member);

    if (interaction.inGuild() && !bypass && hasUsedBlagueToday(interaction.guildId, interaction.user.id)) {
      await interaction.reply({
        content: "Tu as déjà utilisé ta blague du jour. Reviens demain ! (Staff et admins : pas de limite.)",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const joke = jokesRaw[Math.floor(Math.random() * jokesRaw.length)];
    const hasPunchline = Boolean(joke.punchline);

    let embed;
    let components;

    if (hasPunchline) {
      const token = storePunchline(client, {
        setup: joke.setup,
        punchline: joke.punchline,
        category: joke.category
      });
      embed = new EmbedBuilder()
        .setColor(0xc27b2e)
        .setDescription(`**${joke.setup}**\n\n*La chute est masquée — clique sur **Révéler**.*`)
        .setFooter({ text: `Catégorie : ${joke.category}` })
        .setTimestamp(new Date());
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(revealCustomId(token))
            .setStyle(ButtonStyle.Primary)
            .setLabel("Révéler la chute"),
          new ButtonBuilder()
            .setCustomId("scheduled_joke_like")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🤍")
            .setLabel("J'aime")
        )
      ];
    } else {
      embed = new EmbedBuilder()
        .setColor(0xc27b2e)
        .setDescription(jokeDescription(joke))
        .setFooter({ text: `Catégorie : ${joke.category}` })
        .setTimestamp(new Date());
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("scheduled_joke_like")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🤍")
            .setLabel("J'aime")
        )
      ];
    }

    await interaction.reply({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] }
    });

    if (interaction.inGuild() && !bypass) {
      setLastBlagueDay(interaction.guildId, interaction.user.id);
    }
  }
};
