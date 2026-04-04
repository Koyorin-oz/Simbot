const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder
} = require("discord.js");
const { V2_MSG, ACCENT_COLOR } = require("./componentsV2Panels");

function buildTicTacToePanel(state) {
  const status = buildTicTacToeStatus(state);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Morpion"))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🎮 <@${state.playerX}> (❌) vs <@${state.playerO}> (✅)`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(status));

  container.addActionRowComponents(...buildTicTacToeRows(state));
  return { components: [container], ...V2_MSG };
}

function buildTicTacToeRows(state) {
  const rows = [];
  for (let r = 0; r < 3; r += 1) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c += 1) {
      const index = r * 3 + c;
      const cell = state.board[index];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt:play:${state.messageId}:${index}`)
          .setLabel(cell ? symbolLabel(cell) : "·")
          .setStyle(resolveTicTacToeButtonStyle(cell))
          .setDisabled(Boolean(cell) || !state.open)
      );
    }
    rows.push(row);
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ttt:surrender:${state.messageId}`)
        .setLabel("Abandonner")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.open)
    )
  );
  return rows;
}

function buildTicTacToeStatus(state) {
  if (state.winner === "draw") return "Résultat: ⚖️ EGALITÉ";
  if (state.winner === "X") return `Résultat: ✅ <@${state.playerX}> gagne`;
  if (state.winner === "O") return `Résultat: ✅ <@${state.playerO}> gagne`;
  return `Tour: <@${state.turnPlayerId}> (${state.turn === "X" ? "❌" : "✅"})`;
}

function resolveTicTacToeButtonStyle(cell) {
  if (cell === "X") return ButtonStyle.Danger;
  if (cell === "O") return ButtonStyle.Success;
  return ButtonStyle.Secondary;
}

function symbolLabel(cell) {
  if (cell === "X") return "❌";
  if (cell === "O") return "✅";
  return "⬛";
}

function buildConnect4Panel(state) {
  const boardText = renderConnect4Board(state.board);
  const status = buildConnect4Status(state);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Puissance 4"))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🎮 <@${state.playerRed}> (🔴) vs <@${state.playerYellow}> (🟡)`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(boardText))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(status));

  container.addActionRowComponents(...buildConnect4Rows(state));
  return { components: [container], ...V2_MSG };
}

function buildConnect4Rows(state) {
  const topRow = new ActionRowBuilder();
  const bottomRow = new ActionRowBuilder();

  for (let col = 0; col < 7; col += 1) {
    const canDrop = hasConnect4Space(state.board, col);
    const button = new ButtonBuilder()
      .setCustomId(`c4:drop:${state.messageId}:${col}`)
      .setLabel(String(col + 1))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!state.open || !canDrop);
    if (col < 4) topRow.addComponents(button);
    else bottomRow.addComponents(button);
  }

  const endRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`c4:surrender:${state.messageId}`)
      .setLabel("Abandonner")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.open)
  );
  return [topRow, bottomRow, endRow];
}

function renderConnect4Board(board) {
  const header = "1️⃣   2️⃣   3️⃣   4️⃣   5️⃣   6️⃣   7️⃣";
  const lines = [];
  for (let r = 0; r < 6; r += 1) {
    const row = [];
    for (let c = 0; c < 7; c += 1) {
      const cell = board[r][c];
      row.push(cell === "R" ? "🔴" : cell === "Y" ? "🟡" : "⚫️");
    }
    lines.push(row.join("  "));
  }
  return [header, ...lines].join("\n\n");
}

function buildConnect4Status(state) {
  if (state.winner === "draw") return "Résultat: ⚖️ EGALITÉ";
  if (state.winner === "R") return `Résultat: ✅ <@${state.playerRed}> gagne`;
  if (state.winner === "Y") return `Résultat: ✅ <@${state.playerYellow}> gagne`;
  return `Tour: <@${state.turnPlayerId}> (${state.turn === "R" ? "🔴" : "🟡"})`;
}

function hasConnect4Space(board, col) {
  return board[0][col] === null;
}

module.exports = { buildTicTacToePanel, buildConnect4Panel };
