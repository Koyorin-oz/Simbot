const { EmbedBuilder } = require("discord.js");

function buildSanctionEmbed({ title, targetLabel, reason, moderatorLabel, endsAt }) {
  const embed = new EmbedBuilder()
    .setColor(0xd62828)
    .setTitle("Sanction")
    .setDescription(`Vous venez d'être sanctionné sur **${title}** !`);

  embed.addFields(
    { name: "Membre", value: targetLabel, inline: false },
    { name: "Raison", value: reason || "Aucune raison", inline: false },
    { name: "Modérateur", value: moderatorLabel, inline: false }
  );

  if (endsAt) {
    const ts = Math.floor(endsAt.getTime() / 1000);
    embed.addFields({ name: "Fin de la sanction", value: `<t:${ts}:R>`, inline: false });
  }

  embed.setTimestamp();
  return embed;
}

module.exports = { buildSanctionEmbed };
