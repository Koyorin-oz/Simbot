const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorBuilder,
} = require("discord.js");
const { V2_MSG, ACCENT_COLOR } = require("./componentsV2Panels");

function buildVotePanel(state) {
  const counts = countVotes(state);
  const status = buildStatusLine(state, counts);

  const lines = state.options.map((option, index) => `**${option}**\n${counts[index] || 0}`);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Vote : ${state.question}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Votez pour le sujet : **${state.question}**`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n\n")))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Résultat: ${status}`));

  container.addActionRowComponents(...buildButtonRows(state));
  return { components: [container], ...V2_MSG };
}

function buildButtonRows(state) {
  const rows = [];

  for (let i = 0; i < state.options.length; i += 4) {
    const chunk = state.options.slice(i, i + 4);
    const row = new ActionRowBuilder();
    for (let j = 0; j < chunk.length; j += 1) {
      const globalIndex = i + j;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote:pick:${state.voteId}:${globalIndex}`)
          .setLabel(state.options[globalIndex].slice(0, 80))
          .setStyle(resolveVoteButtonStyle(globalIndex))
          .setDisabled(!state.open)
      );
    }
    rows.push(row);
  }

  const endRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vote:end:${state.voteId}`)
      .setLabel("Fin du Vote")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.open)
  );
  rows.push(endRow);
  return rows;
}

function resolveVoteButtonStyle(index) {
  if (index === 0) return ButtonStyle.Success;
  if (index === 1) return ButtonStyle.Danger;
  return ButtonStyle.Primary;
}

function countVotes(state) {
  const counts = Array(state.options.length).fill(0);
  for (const pickedIndex of state.votes.values()) {
    if (Number.isInteger(pickedIndex) && pickedIndex >= 0 && pickedIndex < counts.length) counts[pickedIndex] += 1;
  }
  return counts;
}

function buildStatusLine(state, counts) {
  if (state.open) return "🟨 EN COURS";
  const total = counts.reduce((acc, n) => acc + n, 0);
  if (!total) return "⚪ AUCUN VOTE";

  const max = Math.max(...counts);
  const winners = counts
    .map((n, i) => ({ n, i }))
    .filter((item) => item.n === max)
    .map((item) => state.options[item.i]);

  if (winners.length > 1) return `⚖️ EGALITE (${winners.join(" / ")})`;
  return `✅ ACCEPTÉ (${winners[0]})`;
}

module.exports = { buildVotePanel };
