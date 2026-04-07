const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
const config = require("../../config");
const {
  resolveYoutubeNotifySources,
  fetchLatestVideoForSourceKey,
  buildYoutubeNotificationPayload
} = require("../../services/youtubeNotifyService");

function pickSource(resolved, which) {
  if (!resolved.length) return null;
  if (which === "auto") return resolved[0];
  const w = String(which).toLowerCase();
  return (
    resolved.find((s) => s.displayName.toLowerCase().replace(/\s+/g, "") === w) ||
    resolved.find((s) => s.displayName.toLowerCase().includes(w)) ||
    resolved[0]
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("test-notif-youtube")
    .setDescription(
      "Test : envoie une notif (format reel) avec la derniere video d une chaine configuree"
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName("chaine")
        .setDescription("Chaine a utiliser (defaut : premiere dans la config)")
        .setRequired(false)
        .addChoices(
          { name: "Carminator", value: "carminator" },
          { name: "Carmineoff", value: "carmineoff" },
          { name: "Premiere liste (auto)", value: "auto" }
        )
    ),
  async execute(client, interaction) {
    const yn = config.youtubeNotify;
    if (!yn?.channelId) {
      await interaction.reply({
        content: "youtubeNotify.channelId n est pas configure.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guildId || String(interaction.guildId) !== String(yn.guildId)) {
      await interaction.editReply({
        content: `Cette commande ne fonctionne que sur la guilde configuree pour les notifs YouTube (\`${yn.guildId}\`).`
      });
      return;
    }

    const resolved = await resolveYoutubeNotifySources(yn.sources || []);
    if (!resolved.length) {
      await interaction.editReply({ content: "Aucune chaine YouTube resolvable dans la config." });
      return;
    }

    const which = interaction.options.getString("chaine") || "auto";
    const source = pickSource(resolved, which === "auto" ? "auto" : which);
    if (!source) {
      await interaction.editReply({ content: "Chaine introuvable." });
      return;
    }

    let latest;
    try {
      latest = await fetchLatestVideoForSourceKey(source.sourceKey);
    } catch (e) {
      await interaction.editReply({
        content: `Flux RSS inaccessible : ${e?.message || e}`.slice(0, 2000)
      });
      return;
    }

    if (!latest) {
      await interaction.editReply({ content: "Aucune video dans le flux RSS de cette chaine." });
      return;
    }

    const guild = interaction.guild;
    const ch = await guild.channels.fetch(yn.channelId).catch(() => null);
    if (!ch?.isTextBased?.()) {
      await interaction.editReply({ content: `Salon notif introuvable : ${yn.channelId}` });
      return;
    }

    const me = guild.members.me;
    const perms = ch.permissionsFor(me);
    if (
      !perms?.has(PermissionFlagsBits.ViewChannel) ||
      !perms?.has(PermissionFlagsBits.SendMessages) ||
      !perms?.has(PermissionFlagsBits.EmbedLinks) ||
      !perms?.has(PermissionFlagsBits.MentionEveryone)
    ) {
      await interaction.editReply({
        content:
          "Le bot doit pouvoir envoyer embed, boutons et **Mentionner @everyone** dans le salon notif (parametres du salon > permissions du bot)."
      });
      return;
    }

    const payload = buildYoutubeNotificationPayload(source.displayName, latest.id, latest.title);
    let msg;
    try {
      msg = await ch.send(payload);
    } catch (e) {
      await interaction.editReply({ content: `Envoi echoue : ${e?.message || e}`.slice(0, 2000) });
      return;
    }

    await interaction.editReply({
      content: `Notif de **test** envoyee pour **${source.displayName}** (derniere video du flux) : ${msg.url}\nTu peux supprimer le message dans <#${yn.channelId}> si besoin.`
    });
  }
};
