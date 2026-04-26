const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { mainGuildId, botTestGuildId } = require("../../config");
const { isCommandOwnerBypassUserId } = require("../../services/staffCommandPermissionsService");

/**
 * Discord limite fortement POST /users/@me/channels (ouverture MP) : trop de parallelisme
 * = 429 en rafale puis echecs en chaine. On reste prudent ; le retry ci-dessous gere le reste.
 */
const CONCURRENCY = 2;
const BATCH_PAUSE_MS = 950;

/** Mise a jour du message d'avancement (moins souvent = moins de latence). */
const EDIT_PROGRESS_EVERY = 55;

/** Flush disque des IDs deja MP (reprise sans doublon). */
const FLUSH_IDS_EVERY = 45;

/** Reponse interaction Discord ~15 min ; marge pour les derniers edits. */
const MAX_RUN_MS = 13 * 60 * 1000 + 30_000;

const PROGRESS_DIR = path.join(__dirname, "..", "..", "data", "dm-progress");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Meme message « logique » = meme cle de progression (evite doublons si Discord/client
 * normalise differemment les retours ligne ou espaces en fin).
 */
function normalizeTextForDedupeKey(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trimEnd()
    .trimStart();
}

/**
 * Hash = serveur + texte normalise + liste des cibles triees (ou "all"). Ainsi une campagne
 * ciblee ne se melange pas avec une campagne "all" ou avec une autre selection.
 */
function hashPayload(guildId, texteNorm, targetsKey) {
  const raw = `${guildId}\n${texteNorm}\n${targetsKey}`;
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

function retryAfterMs(e) {
  const ra =
    (typeof e?.data?.retry_after === "number" && e.data.retry_after) ||
    (typeof e?.rawError?.retry_after === "number" && e.rawError.retry_after) ||
    (typeof e?.body?.retry_after === "number" && e.body.retry_after) ||
    null;
  if (ra != null && Number.isFinite(ra)) {
    const sec = Number(ra);
    return Math.min(60_000, Math.ceil(sec * 1000) + 800);
  }
  const h = e?.headers?.get?.("retry-after");
  if (h != null && h !== "") {
    const sec = Number(h);
    if (Number.isFinite(sec)) return Math.min(60_000, Math.ceil(sec * 1000) + 800);
  }
  return 3200;
}

function describeSendError(e) {
  const st = e?.status ?? e?.statusCode;
  const api = e?.rawError?.code ?? e?.code;
  const msg = String(e?.message || e).slice(0, 180);
  if (api != null && st != null) return `[HTTP ${st} / API ${api}] ${msg}`;
  if (st != null) return `[HTTP ${st}] ${msg}`;
  return msg;
}

/**
 * Codes Discord non-retryables cote utilisateur (MP fermes, bloque, compte supprime).
 * On les compte comme `skip` (pas un bug du bot) et on les ajoute a la progression
 * pour ne pas retenter sans cesse.
 */
const USER_UNREACHABLE_API_CODES = new Set([50007, 50013, 10013]);

/** @param {import("discord.js").GuildMember} member */
async function sendMemberDm(member, texte) {
  const user = member.user;
  if (!user) return { ok: false, unreachable: true, code: "NO_USER", msg: "Membre sans user (cache)" };

  const payload = {
    content: texte,
    allowedMentions: { parse: [] }
  };

  /**
   * Ne retenter que le **429** : sur 5xx/timeout, le MP peut deja etre parti — un 2e
   * `user.send` = doublon garanti pour la meme campagne.
   */
  const maxAttempts = 6;
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await user.send(payload);
      return { ok: true };
    } catch (e) {
      lastErr = e;
      const apiCode = e?.rawError?.code ?? e?.code;
      if (USER_UNREACHABLE_API_CODES.has(apiCode)) {
        return { ok: false, unreachable: true, code: apiCode, msg: describeSendError(e) };
      }
      const is429 = e?.status === 429 || e?.statusCode === 429;
      if (is429 && attempt < maxAttempts - 1) {
        await sleep(retryAfterMs(e));
        continue;
      }
      return {
        ok: false,
        unreachable: false,
        code: apiCode ?? e?.status,
        msg: describeSendError(e)
      };
    }
  }
  return {
    ok: false,
    unreachable: false,
    code: lastErr?.rawError?.code ?? lastErr?.code,
    msg: describeSendError(lastErr)
  };
}

/**
 * Parse l'option `cibles` :
 *  - null / vide / "all" / "tous" / "*"  → { all: true }
 *  - sinon extrait tous les IDs (mentions `<@id>` / `<@!id>` ou IDs nus)
 */
function parseTargets(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { all: true, ids: null, rawInput: "" };
  const low = s.toLowerCase();
  if (low === "all" || low === "tous" || low === "tout" || low === "*") {
    return { all: true, ids: null, rawInput: s };
  }
  const ids = new Set();
  const re = /(?:<@!?(\d{17,20})>|\b(\d{17,20})\b)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    ids.add(m[1] || m[2]);
  }
  return { all: false, ids, rawInput: s };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dm")
    .setDescription("MP cible(s) au choix : un membre, plusieurs membres, ou tout le serveur.")
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
        .setDescription("Texte du MP (obligatoire)")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addStringOption((o) =>
      o
        .setName("cibles")
        .setDescription(
          "'all' (defaut) = tout le serveur. Sinon : @membre(s) ou ID(s) separes par espace/virgule."
        )
        .setRequired(false)
        .setMaxLength(1900)
    )
    .addBooleanOption((o) =>
      o
        .setName("eviter_doublons")
        .setDescription("Reprendre sans renvoyer aux deja MP (meme message+cibles). Defaut: oui")
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
      client.guilds.cache.get(targetGuildId) ||
      (await client.guilds.fetch(targetGuildId).catch(() => null));
    if (!targetGuild) {
      await interaction.reply({
        content: "Le bot n'est pas present sur le serveur cible (ou ID invalide).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const canRun =
      isCommandOwnerBypassUserId(interaction.user.id) ||
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

    const texteRaw = interaction.options.getString("message", true);
    const texte = String(texteRaw || "").trim();
    const texteForHash = normalizeTextForDedupeKey(texte);

    if (!texte) {
      await interaction.reply({
        content: "Indique un **message** (texte non vide).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetsOpt = parseTargets(interaction.options.getString("cibles"));
    if (!targetsOpt.all && (!targetsOpt.ids || targetsOpt.ids.size === 0)) {
      await interaction.reply({
        content:
          "Le champ **cibles** est invalide : mets `all` pour tout le serveur, ou des **@mentions** / **IDs** valides separes par espace ou virgule.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = targetGuild;
    try {
      /** Force un fetch complet (GUILD_MEMBERS intent requis). */
      await guild.members.fetch();
    } catch (e) {
      await interaction.editReply({
        content:
          `Impossible de charger les membres (intent **GUILD_MEMBERS** requis) : ${String(e?.message || e).slice(0, 400)}`
      });
      return;
    }

    ensureProgressDir();

    const avoidDup = interaction.options.getBoolean("eviter_doublons") !== false;
    const newCampaign = interaction.options.getBoolean("nouvelle_campagne") === true;

    const allHumans = guild.members.cache.filter((m) => !m.user.bot);

    /** Selection finale + diagnostics. */
    let selected;
    const notFound = [];
    const bots = [];
    if (targetsOpt.all) {
      selected = [...allHumans.values()];
    } else {
      selected = [];
      const seen = new Set();
      for (const id of targetsOpt.ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const m = guild.members.cache.get(id);
        if (!m) {
          notFound.push(id);
          continue;
        }
        if (m.user.bot) {
          bots.push(id);
          continue;
        }
        selected.push(m);
      }
      if (selected.length === 0) {
        await interaction.editReply({
          content:
            `Aucun membre valide trouve sur **${guild.name}**.\n` +
            (notFound.length ? `Introuvables : ${notFound.map((i) => `\`${i}\``).join(", ")}\n` : "") +
            (bots.length ? `Ignores (bots) : ${bots.map((i) => `\`${i}\``).join(", ")}` : "")
        });
        return;
      }
    }

    /** Meme utilisateur ne doit apparaitre qu'une fois (cache / ordre d'iteration). */
    {
      const seenMember = new Set();
      selected = selected.filter((m) => {
        if (seenMember.has(m.id)) return false;
        seenMember.add(m.id);
        return true;
      });
    }

    /** Cle de progression = "all" ou IDs tries joint. */
    const targetsKey = targetsOpt.all
      ? "all"
      : [...selected.map((m) => m.id)].sort().join(",");
    const pHash = hashPayload(guild.id, texteForHash, targetsKey);
    const progressPath = progressFilePath(guild.id, pHash);

    if (newCampaign) deleteProgressFile(progressPath);

    /** @type {Set<string>} */
    let alreadySent = new Set();
    if (avoidDup && !newCampaign && fs.existsSync(progressPath)) {
      alreadySent = loadSentIds(progressPath);
    }

    const skippedDup = selected.filter((m) => alreadySent.has(m.id)).length;
    const toSend = selected.filter((m) => !alreadySent.has(m.id));

    const totalSelected = selected.length;
    const total = toSend.length;
    if (total === 0) {
      await interaction.editReply({
        content:
          skippedDup > 0
            ? `Tous les **${skippedDup}** membres selectionnes sont deja dans la progression pour ce contenu. Mets **nouvelle_campagne: oui** pour tout renvoyer, ou change le texte.`
            : "Aucun membre a contacter."
      });
      return;
    }

    /** IDs traites (reussis OU injoignables definitivement) + historique charge. */
    const sentIds = new Set(alreadySent);
    let ok = 0;
    let fail = 0;
    let skip = 0;
    let aborted = false;
    const t0 = Date.now();
    let processed = 0;
    let lastFlush = 0;
    let firstFailLogged = false;
    /** @type {string[]} */
    const failSamples = [];

    const flushIfNeeded = () => {
      const n = ok + fail + skip;
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
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.all(batch.map((m) => sendMemberDm(m, texte)));
      for (let j = 0; j < batch.length; j++) {
        const m = batch[j];
        const r = results[j];
        if (r?.ok) {
          ok += 1;
          sentIds.add(m.id);
        } else if (r?.unreachable) {
          skip += 1;
          sentIds.add(m.id);
        } else {
          fail += 1;
          if (!firstFailLogged && r?.msg != null) {
            firstFailLogged = true;
            console.warn(`[DM] premier echec code=${r.code} msg=${r.msg}`);
          }
          if (failSamples.length < 3 && r?.msg) {
            const line = `${r.code != null ? `${r.code}: ` : ""}${r.msg}`;
            if (!failSamples.includes(line)) failSamples.push(line);
          }
        }
      }
      processed += batch.length;
      if (avoidDup) {
        try {
          writeSentIds(progressPath, sentIds);
        } catch {
          /* ignore */
        }
      } else {
        flushIfNeeded();
      }

      if (processed % EDIT_PROGRESS_EVERY === 0 || processed === total) {
        await interaction
          .editReply({
            content:
              `Envoi… **${processed}/${total}** cette vague (${totalSelected} selectionnes` +
              (skippedDup ? `, **${skippedDup}** deja contactes avant — exclus` : "") +
              `). Reussis **${ok}**, MP fermes/injoignables **${skip}**, erreurs techniques **${fail}**.` +
              (failSamples.length && ok === 0 && processed <= EDIT_PROGRESS_EVERY
                ? `\n> Exemples d'erreur : ${failSamples.map((s) => `\`${s.slice(0, 90)}\``).join(" · ")}`
                : "")
          })
          .catch(() => null);
      }
      if (i + CONCURRENCY < toSend.length) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(BATCH_PAUSE_MS);
      }
    }

    try {
      writeSentIds(progressPath, sentIds);
    } catch {
      /* ignore */
    }

    const finishedAll = !aborted && processed >= total;

    const scopeLabel = targetsOpt.all
      ? `**tout le serveur** (${allHumans.size} humains)`
      : `**${totalSelected}** membre(s) cible(s)`;

    const lines = [
      "**DM termine**",
      `Serveur : **${guild.name}** (\`${guild.id}\`)`,
      `Portee : ${scopeLabel}`,
      avoidDup && skippedDup ? `Deja contactes avant (exclus) : **${skippedDup}**` : null,
      `Cette vague — traites : **${ok + skip + fail}**`,
      `MP envoyes : **${ok}**`,
      `MP fermes / compte parti / bot bloque (normal) : **${skip}**`,
      `Erreurs techniques (a retenter) : **${fail}**`
    ].filter(Boolean);

    if (!targetsOpt.all && (notFound.length || bots.length)) {
      lines.push("");
      if (notFound.length) {
        lines.push(`Introuvables sur le serveur (ignores) : **${notFound.length}** — ${notFound.slice(0, 10).map((i) => `\`${i}\``).join(", ")}${notFound.length > 10 ? "…" : ""}`);
      }
      if (bots.length) {
        lines.push(`Bots ignores : **${bots.length}**`);
      }
    }

    if (failSamples.length && fail > 0) {
      lines.push("", "**Exemples d'erreurs API** (pour diagnostic) :");
      for (const s of failSamples.slice(0, 3)) {
        lines.push(`- \`${s.slice(0, 200)}\``);
      }
    }
    if (aborted) {
      lines.push(
        "",
        "Arret anticipe (fenetre Discord ~15 min). **Relance la meme commande** (meme texte, meme cibles, meme serveur) : avec **eviter_doublons** (defaut), seuls ceux pas encore traites recevront le message."
      );
    } else if (finishedAll && fail > 0) {
      lines.push(
        "",
        "Progression **enregistree** : relance pour retenter les **erreurs techniques** sans renvoyer aux deja MP. **nouvelle_campagne: oui** pour tout effacer et repartir de zero."
      );
    } else if (finishedAll) {
      lines.push(
        "",
        "Tous les membres de cette selection ont ete traites. Garde la meme campagne pour ne pas renvoyer en cas de relance accidentelle ; **nouvelle_campagne: oui** pour tout renvoyer."
      );
    }

    await interaction.editReply({ content: lines.join("\n") }).catch(() => null);
  }
};
