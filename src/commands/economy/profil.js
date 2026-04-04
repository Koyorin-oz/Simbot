const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { ensureUser } = require("../../services/economyService");
const { buildProfileCard } = require("../../services/profileCard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profil")
    .setDescription("Genere ta carte profil Canva-style.")
    .addUserOption(o => o.setName("membre").setDescription("Membre cible").setRequired(false)),
  async execute(client, interaction) {
    await interaction.deferReply();
    const member = interaction.options.getMember("membre") || interaction.member;
    const user = await ensureUser(client.prisma, interaction.guildId, member.id);
    const buffer = await buildProfileCard(member, user);
    const file = new AttachmentBuilder(buffer, { name: `profil-${member.id}.png` });
    await interaction.editReply({ files: [file] });
  }
};
