const { EmbedBuilder } = require("discord.js");

/** @typedef {"MUTE"|"WARN"|"KICK"} PostSanctionDmType */

const TYPE_META = {
  MUTE: { title: "Mute", past: "mis en sourdine (timeout)" },
  WARN: { title: "Avertissement", past: "averti" },
  KICK: { title: "Expulsion", past: "expulsé du serveur" }
};

const COLORS = {
  MUTE: 0xd62828,
  WARN: 0xfee75c,
  KICK: 0xf26522
};

/**
 * MP **après** la sanction (sauf ban : garder le flux pré-ban + appel séparé).
 * @param {{ guildName: string, type: PostSanctionDmType, reason: string, byLabel: string, endsAt?: Date }} p
 */
function buildPostSanctionDmEmbed({ guildName, type, reason, byLabel, endsAt }) {
  const meta = TYPE_META[type] || { title: "Sanction", past: "sanctionné" };
  const embed = new EmbedBuilder()
    .setColor(COLORS[type] ?? 0xd62828)
    .setTitle(meta.title)
    .setDescription(`Vous avez été **${meta.past}** sur **${guildName}**.`)
    .addFields(
      { name: "Sanctionné par", value: byLabel, inline: true },
      { name: "Raison", value: reason || "Aucune raison", inline: false }
    );

  if (endsAt) {
    const ts = Math.floor(endsAt.getTime() / 1000);
    embed.addFields({ name: "Fin du mute", value: `<t:${ts}:F> (<t:${ts}:R>)`, inline: false });
  }

  embed.setTimestamp();
  return embed;
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {boolean} anonymous
 */
function moderatorLabelForDm(interaction, anonymous) {
  if (anonymous) return "Anonyme";
  return interaction.user.tag;
}

/**
 * @param {import("discord.js").User} user
 * @param {import("discord.js").EmbedBuilder} embed
 */
async function trySendSanctionDm(user, embed) {
  return user.send({ embeds: [embed] }).then(() => true).catch(() => false);
}

module.exports = {
  buildPostSanctionDmEmbed,
  moderatorLabelForDm,
  trySendSanctionDm
};
