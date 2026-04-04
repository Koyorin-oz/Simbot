const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { buildLoveCalcCard } = require("../../services/loveCalcCard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("compatibilite-amoureuse")
    .setDescription("Calcule le pourcentage d'amour entre deux membres")
    .addUserOption((o) => o.setName("user1").setDescription("Premier membre").setRequired(true))
    .addUserOption((o) => o.setName("user2").setDescription("Deuxieme membre").setRequired(true)),
  async execute(client, interaction) {
    await interaction.deferReply();

    const user1 = interaction.options.getUser("user1", true);
    const user2 = interaction.options.getUser("user2", true);
    const member1 = await interaction.guild.members.fetch(user1.id).catch(() => null);
    const member2 = await interaction.guild.members.fetch(user2.id).catch(() => null);

    if (!member1 || !member2) {
      await interaction.editReply("Impossible de recuperer les membres pour la compatibilite.");
      return;
    }

    const percent = user1.id === user2.id ? 100 : Math.floor(Math.random() * 101);
    const phrase = pickLovePhrase(percent, member1.displayName, member2.displayName);
    const buffer = await buildLoveCalcCard(member1.user, member2.user, percent);
    const file = new AttachmentBuilder(buffer, { name: "love-calc.png" });

    await interaction.editReply({
      content: `💘 **${member1.displayName}** + **${member2.displayName}** = **${percent}%**\n${phrase}`,
      files: [file]
    });
  }
};

function pickLovePhrase(percent, nameA, nameB) {
  if (percent >= 90) return `🔥 ${nameA} + ${nameB} = duo legendaire !`;
  if (percent >= 70) return "❤️ Ca sent tres tres bon cette histoire.";
  if (percent >= 45) return "😊 Potentiel present... continuez de discuter.";
  if (percent >= 20) return "😅 C'est compliqué, mais pas impossible.";
  return "💀 Ouch... ce ship est en danger.";
}
