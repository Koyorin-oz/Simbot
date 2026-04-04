const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

const { buildDevDeployerSelectMessage } = require("../../utils/deployPanel");



module.exports = {

  data: new SlashCommandBuilder()

    .setName("dev-deployer")

    .setDescription("Menu deroulant : deployer panels (bienvenue, tickets, tout…)")

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {

    const payload = buildDevDeployerSelectMessage();

    await interaction.reply({

      ...payload,

      flags: MessageFlags.Ephemeral

    });

  }

};


