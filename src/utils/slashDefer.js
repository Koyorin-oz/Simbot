const { MessageFlags } = require("discord.js");

/** Répond à Discord tout de suite (évite Unknown interaction si du travail async suit). */
async function deferEphemeral(interaction) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
}

async function deferPublic(interaction) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply().catch(() => {});
}

module.exports = { deferEphemeral, deferPublic };
