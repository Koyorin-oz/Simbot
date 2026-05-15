const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { deferEphemeral, deferPublic } = require("../../utils/slashDefer");
const {
  getBotRuntimeSettings,
  applyBotPresence,
  applyBotAvatar,
  fetchImageBuffer,
  isHttpImageUrl,
  parseHexColor,
  buildPreviewEmbed,
  resetBotRuntimeSection
} = require("../../services/botProfileService");

const ACTIVITY_CHOICES = [
  ["Joue à", "PLAYING"],
  ["Regarde", "WATCHING"],
  ["Écoute", "LISTENING"],
  ["Compétition", "COMPETING"],
  ["Statut perso", "CUSTOM"],
  ["Stream", "STREAMING"]
];

const STATUS_CHOICES = [
  ["En ligne", "online"],
  ["Absent", "idle"],
  ["Ne pas déranger", "dnd"],
  ["Invisible", "invisible"]
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bot-apparence")
    .setDescription("Présence, photo de profil et modèle d’embed du bot")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("activite")
        .setDescription("Activité du profil bot (ex. « Regarde … » comme sur ton screen)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type d’activité affiché à côté du texte")
            .setRequired(true)
            .addChoices(...ACTIVITY_CHOICES.map(([name, value]) => ({ name, value })))
        )
        .addStringOption((o) =>
          o
            .setName("texte")
            .setDescription("Texte de l’activité (ex. I like rain and trains | Statut #42)")
            .setRequired(true)
            .setMaxLength(128)
        )
        .addStringOption((o) =>
          o
            .setName("statut")
            .setDescription("Pastille de connexion du bot (en ligne, absent…)")
            .addChoices(...STATUS_CHOICES.map(([name, value]) => ({ name, value })))
        )
        .addStringOption((o) =>
          o
            .setName("stream_url")
            .setDescription("Obligatoire si type Stream — URL Twitch ou YouTube")
            .setMaxLength(256)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("avatar")
        .setDescription("Change la photo de profil du bot (image ou URL)")
        .addAttachmentOption((o) =>
          o
            .setName("image")
            .setDescription("Image (PNG, JPG, GIF, WebP — max ~8 Mo)")
            .setRequired(false)
        )
        .addStringOption((o) =>
          o
            .setName("url")
            .setDescription("URL directe d’une image (si pas de pièce jointe)")
            .setMaxLength(512)
            .setRequired(false)
        )
        .addBooleanOption((o) =>
          o
            .setName("retirer")
            .setDescription("Remet l’avatar Discord par défaut du bot")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("embed")
        .setDescription("Modèle d’embed (auteur, footer, image…) — aperçu avec /bot-apparence apercu")
        .addStringOption((o) => o.setName("titre").setDescription("Titre").setMaxLength(256))
        .addStringOption((o) => o.setName("description").setDescription("Description").setMaxLength(4000))
        .addStringOption((o) => o.setName("auteur").setDescription("Nom auteur").setMaxLength(256))
        .addStringOption((o) =>
          o.setName("auteur_icone").setDescription("URL icône auteur").setMaxLength(512)
        )
        .addStringOption((o) => o.setName("footer").setDescription("Texte du footer").setMaxLength(2048))
        .addStringOption((o) =>
          o.setName("footer_icone").setDescription("URL icône footer").setMaxLength(512)
        )
        .addStringOption((o) => o.setName("image").setDescription("URL image large").setMaxLength(512))
        .addStringOption((o) => o.setName("miniature").setDescription("URL miniature").setMaxLength(512))
        .addStringOption((o) =>
          o
            .setName("couleur")
            .setDescription("Couleur barre latérale (hex, ex. 5865f2 ou #5865f2)")
            .setMaxLength(8)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("apercu")
        .setDescription("Affiche l’embed enregistré (réglé avec bot-apparence embed)")
        .addBooleanOption((o) =>
          o
            .setName("ephemere")
            .setDescription("Si faux, tout le salon voit le message")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("voir")
        .setDescription("Résumé textuel des réglages (éphémère)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("reinitialiser")
        .setDescription("Remet les valeurs par défaut (présence et/ou embed)")
        .addStringOption((o) =>
          o
            .setName("cible")
            .setDescription("Que réinitialiser")
            .setRequired(true)
            .addChoices(
              { name: "Tout (présence + embed + avatar)", value: "tout" },
              { name: "Présence uniquement", value: "presence" },
              { name: "Embed uniquement", value: "embed" },
              { name: "Avatar uniquement", value: "avatar" }
            )
        )
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "activite") {
      await deferEphemeral(interaction);
      const type = interaction.options.getString("type", true);
      const texte = interaction.options.getString("texte", true).trim();
      const statutOpt = interaction.options.getString("statut");
      const streamUrlOpt = interaction.options.getString("stream_url");

      const cur = await getBotRuntimeSettings(client.prisma);

      /** @type {Record<string, unknown>} */
      const data = {
        presenceActivityType: type,
        presenceActivityName: texte.slice(0, 128),
        presenceStatus: statutOpt || cur.presenceStatus
      };
      if (streamUrlOpt !== null && streamUrlOpt !== undefined) {
        data.presenceStreamUrl = String(streamUrlOpt).trim().slice(0, 256);
      }

      const finalStream =
        data.presenceStreamUrl !== undefined
          ? String(data.presenceStreamUrl)
          : String(cur.presenceStreamUrl || "").trim();

      if (type === "STREAMING" && !finalStream) {
        await interaction.editReply({
          content:
            "Pour le type **Stream**, Discord exige une **URL** (`stream_url`, Twitch ou YouTube)."
        });
        return;
      }

      await client.prisma.botRuntimeSettings.update({
        where: { id: 1 },
        data
      });

      await applyBotPresence(client);
      await interaction.editReply({
        content: `Activité mise à jour : **${type}** « ${texte.slice(0, 80)}${texte.length > 80 ? "…" : ""} »`
      });
      return;
    }

    if (sub === "avatar") {
      await deferEphemeral(interaction);
      const retirer = interaction.options.getBoolean("retirer") === true;
      if (retirer) {
        await client.prisma.botRuntimeSettings.update({
          where: { id: 1 },
          data: { botAvatarUrl: "" }
        });
        try {
          await applyBotAvatar(client, { remove: true });
          await interaction.editReply({
            content: "Photo de profil **retirée** (avatar Discord par défaut). URL enregistrée effacée."
          });
        } catch (e) {
          await interaction.editReply({
            content: `URL effacée, mais Discord a refusé le retrait : ${e?.message || e}`.slice(0, 2000)
          });
        }
        return;
      }

      const attachment = interaction.options.getAttachment("image");
      const urlOpt = interaction.options.getString("url");
      let imageUrl = "";
      if (attachment) {
        const ct = String(attachment.contentType || "");
        if (ct && !ct.startsWith("image/")) {
          await interaction.editReply({
            content: "La pièce jointe doit être une **image** (PNG, JPG, GIF, WebP)."
          });
          return;
        }
        imageUrl = attachment.url;
      } else if (urlOpt) {
        imageUrl = urlOpt.trim();
        if (!isHttpImageUrl(imageUrl)) {
          await interaction.editReply({
            content:
              "URL invalide. Utilise un lien **https** direct vers une image (`.png`, `.jpg`, `.gif`, `.webp`) ou une URL Discord CDN."
          });
          return;
        }
      } else {
        await interaction.editReply({
          content: "Envoie une **image** en pièce jointe, une **url**, ou coche **retirer**."
        });
        return;
      }

      try {
        await fetchImageBuffer(imageUrl);
      } catch (e) {
        await interaction.editReply({
          content: `Impossible de lire l’image : ${e?.message || e}`.slice(0, 2000)
        });
        return;
      }

      await client.prisma.botRuntimeSettings.update({
        where: { id: 1 },
        data: { botAvatarUrl: imageUrl.slice(0, 512) }
      });

      try {
        await applyBotAvatar(client);
        await interaction.editReply({
          content:
            "Photo de profil **mise à jour** et enregistrée (réappliquée au prochain redémarrage du bot)."
        });
      } catch (e) {
        await interaction.editReply({
          content: `Enregistrée, mais Discord a refusé le changement : ${e?.message || e}`.slice(0, 2000)
        });
      }
      return;
    }

    if (sub === "embed") {
      await deferEphemeral(interaction);
      const titre = interaction.options.getString("titre");
      const description = interaction.options.getString("description");
      const auteur = interaction.options.getString("auteur");
      const auteur_icone = interaction.options.getString("auteur_icone");
      const footer = interaction.options.getString("footer");
      const footer_icone = interaction.options.getString("footer_icone");
      const image = interaction.options.getString("image");
      const miniature = interaction.options.getString("miniature");
      const couleur = interaction.options.getString("couleur");

      const touched =
        [titre, description, auteur, auteur_icone, footer, footer_icone, image, miniature, couleur].some(
          (v) => v !== null && v !== undefined
        );
      if (!touched) {
        await interaction.editReply({
          content: "Indique **au moins un** champ à enregistrer (titre, description, auteur, image…)."
        });
        return;
      }

      /** @type {Record<string, unknown>} */
      const data = {};
      if (titre !== null && titre !== undefined) data.embedTitle = titre.slice(0, 256);
      if (description !== null && description !== undefined) data.embedDescription = description.slice(0, 4096);
      if (auteur !== null && auteur !== undefined) data.embedAuthorName = auteur.slice(0, 256);
      if (auteur_icone !== null && auteur_icone !== undefined)
        data.embedAuthorIconUrl = auteur_icone.trim().slice(0, 512);
      if (footer !== null && footer !== undefined) data.embedFooterText = footer.slice(0, 2048);
      if (footer_icone !== null && footer_icone !== undefined)
        data.embedFooterIconUrl = footer_icone.trim().slice(0, 512);
      if (image !== null && image !== undefined) data.embedImageUrl = image.trim().slice(0, 512);
      if (miniature !== null && miniature !== undefined) data.embedThumbnailUrl = miniature.trim().slice(0, 512);

      if (couleur !== null && couleur !== undefined) {
        const c = parseHexColor(couleur);
        if (c === null && String(couleur).trim() !== "") {
          await interaction.editReply({
            content: "Couleur invalide. Utilise un hex à 6 chiffres, ex. `5865f2` ou `#5865f2`."
          });
          return;
        }
        if (c !== null) data.embedColor = c;
      }

      await client.prisma.botRuntimeSettings.update({ where: { id: 1 }, data });
      await interaction.editReply({
        content: "Modèle d’embed enregistré. Utilise `/bot-apparence apercu` pour le voir."
      });
      return;
    }

    if (sub === "apercu") {
      const ephem = interaction.options.getBoolean("ephemere") !== false;
      if (ephem) await deferEphemeral(interaction);
      else await deferPublic(interaction);

      const s = await getBotRuntimeSettings(client.prisma);
      const embed = buildPreviewEmbed(s);
      await interaction.editReply({
        embeds: [embed],
        flags: ephem ? MessageFlags.Ephemeral : undefined
      });
      return;
    }

    if (sub === "voir") {
      await deferEphemeral(interaction);
      const s = await getBotRuntimeSettings(client.prisma);
      const lines = [
        "**Présence**",
        `- Type : \`${s.presenceActivityType}\` — ${s.presenceActivityName}`,
        `- Statut connexion : \`${s.presenceStatus}\``,
        s.presenceStreamUrl ? `- Stream URL : ${s.presenceStreamUrl}` : null,
        "",
        "**Photo de profil**",
        `- URL enregistrée : ${s.botAvatarUrl ? s.botAvatarUrl : "— (avatar Discord actuel, non forcé)"}`,
        "",
        "**IA (ping @bot)**",
        `- Ton : \`${s.iaPingTone || "auto"}\` (commande \`/ia-mode\`)`,
        "",
        "**Embed (aperçu)**",
        `- Titre : ${s.embedTitle || "—"}`,
        `- Auteur : ${s.embedAuthorName || "—"}`,
        `- Footer : ${s.embedFooterText || "—"}`,
        `- Image / miniature : ${s.embedImageUrl || s.embedThumbnailUrl ? "définies" : "—"}`,
        `- Couleur : #${Number(s.embedColor).toString(16).padStart(6, "0")}`
      ].filter(Boolean);
      await interaction.editReply({ content: lines.join("\n").slice(0, 2000) });
      return;
    }

    if (sub === "reinitialiser") {
      await deferEphemeral(interaction);
      const cible = /** @type {"tout"|"presence"|"embed"|"avatar"} */ (
        interaction.options.getString("cible", true)
      );
      await resetBotRuntimeSection(client.prisma, cible);
      await applyBotPresence(client);
      if (cible === "tout" || cible === "avatar") {
        await applyBotAvatar(client, { remove: true }).catch(() => null);
      }
      await interaction.editReply({
        content:
          cible === "tout"
            ? "Réglages **présence + embed + avatar** remis par défaut."
            : cible === "presence"
              ? "Présence remise par défaut et réappliquée."
              : cible === "avatar"
                ? "Avatar remis par défaut (URL effacée)."
                : "Modèle embed remis par défaut."
      });
    }
  }
};
