const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { isCommandOwnerBypassUserId } = require("../../services/staffCommandPermissionsService");

function hasStrictAdmin(interaction) {
  if (isCommandOwnerBypassUserId(interaction.user?.id)) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("message")
    .setDescription("Envoie un message (texte et/ou fichier) en tant que le bot, optionnellement en reponse a un message")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("texte")
        .setDescription("Texte du message (laisse vide si tu envoies seulement un fichier)")
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addAttachmentOption((o) =>
      o.setName("fichier").setDescription("Image, GIF ou autre piece jointe").setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName("repondre_a")
        .setDescription("ID du message du meme salon auquel repondre (lien de reponse Discord)")
        .setRequired(false)
        .setMinLength(17)
        .setMaxLength(22)
    ),
  async execute(client, interaction) {
    if (!hasStrictAdmin(interaction)) {
      await interaction.reply({
        content: "Reserve aux **administrateurs** du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const texte = interaction.options.getString("texte");
    const attachment = interaction.options.getAttachment("fichier");
    const replyIdRaw = interaction.options.getString("repondre_a");

    const content = texte != null ? String(texte).trim() : "";
    const hasFile = Boolean(attachment);

    if (!content && !hasFile) {
      await interaction.reply({
        content: "Indique au moins un **texte** ou un **fichier**.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isTextBased?.()) {
      await interaction.reply({
        content: "Utilise cette commande dans un salon texte ou en MP avec le bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.inGuild()) {
      const me = interaction.guild.members.me;
      const perms = channel.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.ViewChannel)) {
        await interaction.reply({
          content: "Je ne vois pas ce salon.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (!perms.has(PermissionFlagsBits.SendMessages)) {
        await interaction.reply({
          content: "Je n'ai pas la permission **Envoyer des messages** ici.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      if (hasFile && !perms.has(PermissionFlagsBits.AttachFiles)) {
        await interaction.reply({
          content: "Je n'ai pas la permission **Joindre des fichiers** ici.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    let replyId = null;
    if (replyIdRaw) {
      const digits = String(replyIdRaw).replace(/\D/g, "");
      if (!/^\d{17,22}$/.test(digits)) {
        await interaction.reply({
          content: "ID de message invalide. Colle uniquement l'ID (chiffres) ou un lien contenant l'ID.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      replyId = digits;
    }

    const payload = {
      content: content || undefined,
      // Pas de @everyone par defaut (evite les pings de masse accidentels). Utilise des mentions explicites <@id> / <@&id>.
      allowedMentions: { parse: ["users", "roles"], repliedUser: true }
    };

    if (hasFile) {
      payload.files = [{ attachment: attachment.url, name: attachment.name || "piece-jointe" }];
    }

    try {
      if (replyId) {
        const target = await channel.messages.fetch(replyId).catch(() => null);
        if (!target) {
          await interaction.reply({
            content: "Message introuvable dans ce salon (verifie l'ID et que tu es dans le bon salon).",
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        await target.reply(payload);
      } else {
        await channel.send(payload);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      await interaction.reply({
        content: `Impossible d'envoyer le message : ${msg.slice(0, 500)}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: replyId ? "Message envoye en **reponse** au message cible." : "Message envoye.",
      flags: MessageFlags.Ephemeral
    });
  }
};
