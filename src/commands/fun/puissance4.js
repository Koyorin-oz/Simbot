const {SlashCommandBuilder, MessageFlags} = require("discord.js");
const { buildConnect4Panel } = require("../../utils/gamesPanels");

function createBoard() {
  return Array.from({ length: 6 }, () => Array(7).fill(null));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("puissance4")
    .setDescription("Lance une partie de puissance 4 avec boutons")
    .addUserOption((o) => o.setName("adversaire").setDescription("Joueur a affronter").setRequired(true)),
  async execute(client, interaction) {
    const opponent = interaction.options.getUser("adversaire", true);
    if (opponent.bot) {
      await interaction.reply({ content: "Tu ne peux pas jouer contre un bot.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (opponent.id === interaction.user.id) {
      await interaction.reply({ content: "Choisis un autre joueur.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!client.connect4Games) client.connect4Games = new Map();
    const gameId = interaction.id;

    const state = {
      messageId: gameId,
      playerRed: interaction.user.id,
      playerYellow: opponent.id,
      turn: "R",
      turnPlayerId: interaction.user.id,
      board: createBoard(),
      open: true,
      winner: null
    };
    client.connect4Games.set(gameId, state);

    await interaction.reply(buildConnect4Panel(state));
  }
};
