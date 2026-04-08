const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildMusicPanelPayload } = require("../../utils/musicPanel");
const { runPlayQueryFlow } = require("../../interactions/musicPanelInteractions");
const { loadPrefs, savePrefs } = require("../../services/privateRoomService");
const musicService = require("../../services/musicService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Musique dans le vocal (panneau, YouTube, Spotify, historique)")
    .addSubcommand((s) =>
      s
        .setName("panneau")
        .setDescription("Ouvrir le grand panneau musique (orange) — recherche, liens, historique")
    )
    .addSubcommand((s) => s.setName("join").setDescription("Faire rejoindre le bot dans ton salon vocal"))
    .addSubcommand((s) => s.setName("leave").setDescription("Arreter la musique et faire quitter le bot du vocal"))
    .addSubcommand((s) =>
      s
        .setName("play")
        .setDescription("Recherche ou lien : liste des tops resultats si ce n'est pas une URL")
        .addStringOption((o) =>
          o.setName("requete").setDescription("URL ou mots-cles (ex. artiste + titre)").setRequired(true).setMaxLength(400)
        )
    )
    .addSubcommand((s) => s.setName("skip").setDescription("Passer au morceau suivant"))
    .addSubcommand((s) => s.setName("stop").setDescription("Vider la file et arreter la lecture"))
    .addSubcommand((s) => s.setName("queue").setDescription("Afficher la file d'attente"))
    .addSubcommand((s) =>
      s
        .setName("definir-lien")
        .setDescription(
          "Enregistrer un lien Spotify (playlist / album / morceau) pour le bouton du panneau vocal"
        )
        .addStringOption((o) =>
          o
            .setName("lien")
            .setDescription("Lien Spotify ou vide pour effacer")
            .setRequired(false)
            .setMaxLength(500)
        )
    ),
  async execute(client, interaction) {
    if (!musicService.isEnabled()) {
      await interaction.reply({
        content: "La musique est desactivee sur ce bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "panneau") {
      await interaction.reply(buildMusicPanelPayload(interaction.user.id));
      return;
    }

    if (sub === "definir-lien") {
      const raw = interaction.options.getString("lien");
      const lien = raw != null ? String(raw).trim().slice(0, 500) : "";
      await loadPrefs(client.prisma, interaction.guildId, interaction.user.id);
      await savePrefs(client.prisma, interaction.guildId, interaction.user.id, { musicSpotifyUrl: lien });
      await interaction.reply({
        content: lien
          ? "Lien enregistre. Utilise **Ma playlist** sur ton panneau vocal ou le panneau **Enregistrer lien Spotify**."
          : "Lien efface.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "queue") {
      const text = musicService.formatQueue(interaction.guildId, 15);
      await interaction.reply({ content: text.slice(0, 2000), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "leave") {
      musicService.leaveGuild(interaction.guildId);
      await interaction.reply({ content: "Deconnecte du vocal et file videe.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "stop") {
      const r = musicService.stopGuild(interaction.guildId);
      await interaction.reply({
        content: r.error ? r.error : "Lecture arretee et file videe.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "skip") {
      const r = musicService.skipGuild(interaction.guildId);
      await interaction.reply({
        content: r.error ? r.error : "Morceau suivant…",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "join") {
      const v = musicService.getVoiceChannelForMember(interaction.member);
      if (v.error) {
        await interaction.reply({ content: v.error, flags: MessageFlags.Ephemeral });
        return;
      }
      const joined = await musicService.joinChannel(interaction.guild, v.channel, {
        member: interaction.member,
        client
      });
      if (joined.error) {
        await interaction.reply({ content: joined.error, flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({
        content: `Connecte dans ${v.channel.name}. Utilise \`/music play\` ou \`/music panneau\`.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "play") {
      const requete = interaction.options.getString("requete", true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await runPlayQueryFlow(interaction, client, {
        query: requete,
        prisma: client.prisma,
        alreadyDeferred: true,
        getVoice: () => musicService.getVoiceChannelForMember(interaction.member)
      });
    }
  }
};
