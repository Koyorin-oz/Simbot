const fs = require("node:fs");
const path = require("node:path");
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { deferPublic } = require("../../utils/slashDefer");

/** Salon unique : tout membre qui y a accès (overwrite / rôles) peut utiliser /flex. */
const FLEX_CHANNEL_ID = "1357819532416123071";
const ALLOWED_CHANNEL_IDS = new Set([FLEX_CHANNEL_ID]);
const FLEX_GIF_URL = "https://i.imgur.com/3tVNmmQ.gif";

/** Mascotte optionnelle : dépose `assets/flex-mascot.png` sur le serveur (Pebble), sinon miniature = le GIF. */
function resolveFlexMascotAttachment() {
  const p = path.join(process.cwd(), "assets", "flex-mascot.png");
  if (fs.existsSync(p)) {
    return new AttachmentBuilder(p, { name: "flex-mascot.png" });
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("flex")
    .setDescription("Flex un bon coup avec un GIF")
    /** Aucune permission Discord requise : tout membre qui voit le salon autorisé peut l’utiliser. */
    .setDefaultMemberPermissions(null)
    .setDMPermission(false),
  async execute(client, interaction) {
    /**
     * Strict : salon texte avec exactement l’ID FLEX_CHANNEL_ID.
     * - Refuse DM, threads (meme si parent = flex), annonces autre salon, autre guilde.
     * - `interaction.channelId` = ID du thread si on est dans un thread (jamais l’ID du parent),
     *   donc le Set.has() bloque deja les threads.
     */
    if (
      !interaction.inGuild() ||
      interaction.channel?.isThread?.() ||
      !ALLOWED_CHANNEL_IDS.has(interaction.channelId)
    ) {
      await interaction.reply({
        content:
          `Utilise **/flex** uniquement dans <#${FLEX_CHANNEL_ID}> (directement dans le salon, pas dans un thread).`,
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
      .setTimestamp();

    const mascot = resolveFlexMascotAttachment();
    embed.setImage(FLEX_GIF_URL);
    embed.setThumbnail(mascot ? "attachment://flex-mascot.png" : FLEX_GIF_URL);

    await interaction.editReply({
      files: mascot ? [mascot] : [],
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
};
