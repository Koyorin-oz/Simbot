const {SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags} = require("discord.js");
const { deferPublic } = require("../../utils/slashDefer");

const ALLOWED_CHANNEL_IDS = new Set(["1357819532416123071", "735810600348680212", "1486780068121546882"]);
const FLEX_GIF_URL = "https://i.imgur.com/3tVNmmQ.gif";
const FLEX_THUMB_PATH =
  "C:\\Users\\koyor\\.cursor\\projects\\c-Users-koyor-OneDrive-Documents-Desktop-GM-CARMINABOT\\assets\\c__Users_koyor_AppData_Roaming_Cursor_User_workspaceStorage_807d0a7989207b892549e0e965b63191_images_image-999f8cdd-4d9b-43c2-b1ba-9a00b7b22244.png";

module.exports = {
  data: new SlashCommandBuilder().setName("flex").setDescription("Flex un bon coup avec un GIF"),
  async execute(client, interaction) {
    if (!ALLOWED_CHANNEL_IDS.has(interaction.channelId)) {
      await interaction.reply({
        content:
          "Commande utilisable uniquement dans <#1357819532416123071>, <#735810600348680212> ou <#1486780068121546882>.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await deferPublic(interaction);

    const embed = new EmbedBuilder()
      .setColor(0x1b1825)
      .setAuthor({
        name: interaction.user.displayName || interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ size: 128 })
      })
      .setTitle("Tu flex un bon coup 😎")
      .setDescription(
        `Te voilà requinqué vers de nouvelles aventures 😎, mais quel bg !\n\n<@${interaction.user.id}> vient de **/flex** !`
      )
      .setThumbnail("attachment://flex-mascot.png")
      .setTimestamp();

    embed.setImage(FLEX_GIF_URL);
    const mascot = new AttachmentBuilder(FLEX_THUMB_PATH, { name: "flex-mascot.png" });

    await interaction.editReply({
      files: [mascot],
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
};
