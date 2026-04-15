const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { mainGuildId, botTestGuildId } = require("../../config");

const OWNER_BYPASS_ID = "965984018216665099";

/** Envoi parallele (par lot) + courte pause entre lots pour limiter les 429 Discord. */
const CONCURRENCY = 6;
const BATCH_PAUSE_MS = 380;

/** Mise a jour du message d'avancement (moins souvent = moins de latence). */
const EDIT_PROGRESS_EVERY = 55;

/** Flush disque des IDs deja MP (reprise sans doublon). */
const FLUSH_IDS_EVERY = 45;

/** Reponse interaction Discord ~15 min ; marge pour les derniers edits. */
const MAX_RUN_MS = 13 * 60 * 1000 + 30_000;

const PROGRESS_DIR = path.join(__dirname, "..", "..", "data", "dm-all-progress");

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

function ensureProgressDir() {
  try {
    fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function progressFilePath(guildId, hash) {
  return path.join(PROGRESS_DIR, `${guildId}-${hash}.json`);
}

function hashPayload(guildId, texte, image) {
  const imgPart = image
    ? `${image.id}|${String(image.name || "")}|${String(image.url || "")}`
    : "";
  const raw = `${guildId}\n${texte}\n${imgPart}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 28);
}

function loadSentIds(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const j = JSON.parse(raw);
    const arr = Array.isArray(j.sentUserIds) ? j.sentUserIds : [];
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function writeSentIds(filePath, set) {
  const tmp = `${filePath}.tmp`;
  const body = JSON.stringify(
    { version: 1, sentUserIds: [...set], updatedAt: Date.now() },
    null,
    0
  );
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, filePath);
}

function deleteProgressFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/**
 * @param {import("discord.js").GuildMember} member
 * @param {object} payload
 */
async function sendMemberDm(member, payload) {
  try {
    await member.send(payload);
    return { ok: true };
  } catch (e) {
    const code = e?.code;
    const retryAfter =
      (typeof e?.data?.retry_after === "number" && e.data.retry_after) ||
      (typeof e?.rawError?.retry_after === "number" && e.rawError.retry_after) ||
      (typeof e?.body?.retry_after === "number" && e.body.retry_after) ||
      null;
    if ((code === 429 || e?.status === 429) && retryAfter != null) {
      await sleep(Math.ceil(Number(retryAfter) * 1000) + 400);
      try {
        await member.send(payload);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dm-all")
    .setDescription("MP a tous les humains du serveur choisi (test ou prod). Admin requis sur la cible.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("serveur_cible")
        .setDescription("Serveur dont les membres recevront le MP")
        .setRequired(true)
        .addChoices(
          { name: "Serveur de test (bot test)", value: botTestGuildId },
          { name: "La Carminaute (production)", value: mainGuildId }
        )
    )
    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("Texte du MP (obligatoire si pas d'image)")
        .setRequired(false)
        .setMaxLength(2000)
    )
    .addAttachmentOption((o) =>
      o.setName("image").setDescription("Image a joindre au MP (optionnel)").setRequired(false)
    )
    .addBooleanOption((o) =>
      o
        .setName("eviter_doublons")
        .setDescription("Reprendre sans renvoyer aux deja MP (meme message+image+serveur). Defaut: oui")
        .setRequired(false)
    )
    .addBooleanOption((o) =>
      o
        .setName("nouvelle_campagne")
        .setDescription("Effacer la progression : tout le monde peut recevoir a nouveau ce MP")
        .setRequired(false)
    ),
  async execute(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Utilise cette commande **sur un serveur** (pas en MP).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetGuildId = interaction.options.getString("serveur_cible", true);
    const targetGuild =
      client.guilds.cache.get(targetGuildId) || (await client.guilds.fetch(targetGuildId).catch(() => null));
    if (!targetGuild) {
      await interaction.reply({
        content: "Le bot n'est pas present sur le serveur cible (ou ID invalide).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const canRun =
      interaction.user.id === OWNER_BYPASS_ID ||
      (await targetGuild.members
        .fetch(interaction.user.id)
        .then((m) => m?.permissions?.has(PermissionFlagsBits.Administrator))
        .catch(() => false));
    if (!canRun) {
      await interaction.reply({
        content:
          "Tu dois etre **administrateur** sur le serveur **cible** choisi (meme si tu lances la commande depuis un autre serveur).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const texteRaw = interaction.options.getString("message");
    const texte = texteRaw != null ? String(texteRaw).trim() : "";
    const image = interaction.options.getAttachment("image");
    const avoidDup = interaction.options.getBoolean("eviter_doublons") !== false;
    const newCampaign = interaction.options.getBoolean("nouvelle_campagne") === true;

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

    const guild = targetGuild;
    try {
      await guild.members.fetch();
    } catch (e) {
      await interaction.editReply({
        content: `Impossible de charger les membres : ${String(e?.message || e).slice(0, 400)}`
      });
      return;
    }

    ensureProgressDir();
    const pHash = hashPayload(guild.id, texte, image);
    const progressPath = progressFilePath(guild.id, pHash);

    if (newCampaign) deleteProgressFile(progressPath);

    /** @type {Set<string>} */
    let alreadySent = new Set();
    if (avoidDup && !newCampaign && fs.existsSync(progressPath)) {
      alreadySent = loadSentIds(progressPath);
    }

    const allHumans = guild.members.cache.filter((m) => !m.user.bot);
    const skippedDup = [...allHumans.values()].filter((m) => alreadySent.has(m.id)).length;
    const toSend = [...allHumans.values()].filter((m) => !alreadySent.has(m.id));

    const totalMembers = allHumans.size;
    const total = toSend.length;
    if (total === 0) {
      await interaction.editReply({
        content:
          skippedDup > 0
            ? `Tous les **${skippedDup}** humains de ce serveur sont deja dans la progression pour ce contenu. Mets **nouvelle_campagne: oui** pour tout renvoyer, ou change le texte / l'image.`
            : "Aucun membre humain a contacter."
      });
      return;
    }

    const filePart = image
      ? [{ attachment: image.url, name: image.name || "image.png" }]
      : undefined;

    const payload = {
      content: texte || undefined,
      files: filePart
    };

    /** IDs reussis sur cette execution + historique charge */
    const sentIds = new Set(alreadySent);
    let ok = 0;
    let fail = 0;
    let aborted = false;
    const t0 = Date.now();
    let processed = 0;
    let lastFlush = 0;

    const flushIfNeeded = () => {
      const n = ok + fail;
      if (n - lastFlush >= FLUSH_IDS_EVERY) {
        lastFlush = n;
        try {
          writeSentIds(progressPath, sentIds);
        } catch {
          /* ignore disk errors */
        }
      }
    };

    for (let i = 0; i < toSend.length; i += CONCURRENCY) {
      if (Date.now() - t0 > MAX_RUN_MS) {
        aborted = true;
        break;
      }
      const batch = toSend.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((m) => sendMemberDm(m, payload)));
      for (let j = 0; j < batch.length; j++) {
        const m = batch[j];
        if (results[j]?.ok) {
          ok += 1;
          sentIds.add(m.id);
        } else {
          fail += 1;
        }
      }
      processed += batch.length;
      flushIfNeeded();

      if (processed % EDIT_PROGRESS_EVERY === 0 || processed === total) {
        await interaction
          .editReply({
            content:
              `Envoi… **${processed}/${total}** cette vague (${totalMembers} humains sur le serveur` +
              (skippedDup ? `, **${skippedDup}** deja contactes avant — exclus` : "") +
              `). Reussis **${ok}**, echecs **${fail}**.`
          })
          .catch(() => null);
      }
      if (i + CONCURRENCY < toSend.length) {
        await sleep(BATCH_PAUSE_MS);
      }
    }

    try {
      writeSentIds(progressPath, sentIds);
    } catch {
      /* ignore */
    }

    const finishedAll = !aborted && processed >= total;

    const lines = [
      "**DM masse termine**",
      `Serveur : **${guild.name}** (\`${guild.id}\`)`,
      `Humains sur le serveur : **${totalMembers}**`,
      avoidDup && skippedDup ? `Deja contactes avant (exclus) : **${skippedDup}**` : null,
      `Cette vague — traites : **${ok + fail}**`,
      `MP envoyes : **${ok}**`,
      `Echecs (MP fermes, bot bloque, etc.) : **${fail}**`
    ].filter(Boolean);
    if (aborted) {
      lines.push(
        "",
        "Arret anticipe (fenetre Discord ~15 min). **Relance la meme commande** (meme texte, image, serveur) : avec **eviter_doublons** (defaut), seuls ceux pas encore MP recevront le message."
      );
    } else if (finishedAll && fail > 0) {
      lines.push(
        "",
        "Progression **enregistree** sur le serveur : relance pour retenter les echecs sans renvoyer aux deja MP. **nouvelle_campagne: oui** pour tout effacer et repartir de zero."
      );
    } else if (finishedAll) {
      lines.push(
        "",
        "Tout le monde de cette liste a ete traite. Garde la meme campagne pour ne pas renvoyer en cas de relance accidentelle ; **nouvelle_campagne: oui** pour tout renvoyer."
      );
    }

    await interaction.editReply({ content: lines.join("\n") }).catch(() => null);
  }
};
