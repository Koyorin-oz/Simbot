function formatSC(value) {
  const amount = Number(value || 0);
  return `€ ${amount.toLocaleString("fr-FR")}`;
}

module.exports = { formatSC };
