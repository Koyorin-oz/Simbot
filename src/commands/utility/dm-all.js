const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

const OWNER_BYPASS_ID = "965984018216665099";
const DM_DELAY_MS = 1100;
const PROGRESS_EVERY = 12;
/** Reponse interaction Discord ~15 min ; on s'arrete avant pour laisser le bilan. */
const MAX_RUN_MS = 13.5 * 60 * 1000;

function hasStrictAdmin(interaction) {
  if (interaction.user?.id === OWNER_BYPASS_ID) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProbablyImage(att) {
  if (!att) return false;
  const ct = String(att.contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const n = String(att.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(n);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dm-all")
    .setDescription(
      "Envoie un message prive a tous les membres du serveur (hors bots). Reserve aux administrateurs."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("Texte du MP (obligatoire si pas d'image)")
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addAttachmentOption((o) =>
      o.setName("image").setDescription("Image a joindre au MP (optionnel)").setRequired(false)
    ),
  async execute(client, interaction) {
    if (!hasStrictAdmin(interaction)) {
      await interaction.reply({
        content: "Reserve aux **administrateurs** du serveur.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Utilise cette commande **sur le serveur** (pas en MP).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const texteRaw = interaction.options.getString("message");
    const texte = texteRaw != null ? String(texteRaw).trim() : "";
    const image = interaction.options.getAttachment("image");

    if (!texte && !image) {
      await interaction.reply({
        content: "Indique au moins un **message** ou une **image**.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (image && !isProbablyImage(image)) {
      await interaction.reply({
        content:
          "La piece jointe ne ressemble pas a une **image** (PNG, JPEG, GIF, WebP). Envoie une image ou retire le fichier.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (image && image.size > 8 * 1024 * 1024) {
      await interaction.reply({
        content: "Image trop lourde (max **8 Mo** recommande pour les MP).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    try {
      await guild.members.fetch();
    } catch (e) {
      await interaction.editReply({
        content: `Impossible de charger les membres : ${String(e?.message || e).slice(0, 400)}`
      });
      return;
    }

    const targets = guild.members.cache.filter((m) => !m.user.bot);
    const total = targets.size;
    if (total === 0) {
      await interaction.editReply({ content: "Aucun membre humain a contacter." });
      return;
    }

    const filePart = image
      ? [{ attachment: image.url, name: image.name || "image.png" }]
      : undefined;

    const payload = {
      content: texte || undefined,
      files: filePart
    };

    let ok = 0;
    let fail = 0;
    let aborted = false;
    const t0 = Date.now();
    let i = 0;

    for (const member of targets.values()) {
      if (Date.now() - t0 > MAX_RUN_MS) {
        aborted = true;
        break;
      }
      i += 1;
      try {
        await member.send(payload);
        ok += 1;
      } catch {
        fail += 1;
      }
      if (i % PROGRESS_EVERY === 0) {
        await interaction
          .editReply({
            content: `Envoi en cours… **${i}/${total}** traites (reussis **${ok}**, echecs **${fail}**).`
          })
          .catch(() => null);
      }
      await sleep(DM_DELAY_MS);
    }

    const lines = [
      "**DM masse termine**",
      `Membres cibles : **${total}**`,
      `MP envoyes : **${ok}**`,
      `Echecs (MP fermes, bot bloque, etc.) : **${fail}**`
    ];
    if (aborted) {
      lines.push(
        "",
        "Arret anticipe (limite de temps ~13 min pour garder la reponse Discord). Relance la commande pour continuer si besoin — les deja contactes recevront un doublon."
      );
    }

    await interaction.editReply({ content: lines.join("\n") }).catch(() => null);
  }
};
