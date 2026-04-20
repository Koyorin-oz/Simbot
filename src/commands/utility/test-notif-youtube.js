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
      "Test : envoie ici (ce salon) une notif comme la vraie, avec la derniere video RSS"
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

    if (!interaction.inGuild() || !interaction.channel?.isTextBased?.()) {
      await interaction.reply({
        content: "Utilise cette commande dans un salon texte du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const resolved = await resolveYoutubeNotifySources(yn?.sources || []);
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
    const ch = interaction.channel;

    const me = guild.members.me;
    const perms = ch.permissionsFor(me);
    const needsEveryone = !source.pingRoleId;
    if (
      !perms?.has(PermissionFlagsBits.ViewChannel) ||
      !perms?.has(PermissionFlagsBits.SendMessages) ||
      !perms?.has(PermissionFlagsBits.EmbedLinks) ||
      (needsEveryone && !perms?.has(PermissionFlagsBits.MentionEveryone))
    ) {
      await interaction.editReply({
        content: needsEveryone
          ? "Le bot doit pouvoir envoyer embed, boutons et **Mentionner @everyone** dans **ce salon** (permissions du bot sur ce salon)."
          : "Le bot doit pouvoir envoyer embed et boutons dans **ce salon**."
      });
      return;
    }

    const payload = buildYoutubeNotificationPayload(source.displayName, latest.id, latest.title, {
      handle: source.handle,
      pingRoleId: source.pingRoleId
    });
    let msg;
    try {
      msg = await ch.send(payload);
    } catch (e) {
      await interaction.editReply({ content: `Envoi echoue : ${e?.message || e}`.slice(0, 2000) });
      return;
    }

    await interaction.editReply({
      content: `Notif de **test** envoyee pour **${source.displayName}** dans ce salon : ${msg.url}\nTu peux supprimer le message si besoin.`
    });
  }
};
