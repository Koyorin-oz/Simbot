const {SlashCommandBuilder, MessageFlags} = require("discord.js");
const { buildTicTacToePanel } = require("../../utils/gamesPanels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("morpion")
    .setDescription("Lance une partie de morpion avec boutons")
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

    if (!client.ticTacToeGames) client.ticTacToeGames = new Map();
    const gameId = interaction.id;

    const state = {
      messageId: gameId,
      playerX: interaction.user.id,
      playerO: opponent.id,
      turn: "X",
      turnPlayerId: interaction.user.id,
      board: Array(9).fill(null),
      open: true,
      winner: null
    };
    client.ticTacToeGames.set(gameId, state);

    await interaction.reply(buildTicTacToePanel(state));
  }
};
