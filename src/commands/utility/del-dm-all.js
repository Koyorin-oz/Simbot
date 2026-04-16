const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { getCommandOwnerBypassUserId } = require("../../services/staffCommandPermissionsService");

const BETWEEN_CHANNELS_MS = 450;
/** Suppression parallele de quelques messages du bot a la fois. */
const DELETE_MSG_CONCURRENCY = 4;
const BETWEEN_MSG_BATCH_MS = 280;
/** Fenetre interaction Discord ~15 min ; on s'arrete avant. */
const MAX_RUN_MS = 13 * 60 * 1000 + 20_000;
/** Securite par salon : boucles fetch (100 msg max par tour). */
const MAX_PURGE_ROUNDS_PER_CHANNEL = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Supprime tous les messages **envoyes par le bot** dans ce salon MP (historique API, meme avant redemarrage).
 * Les messages de l'utilisateur ne peuvent pas etre supprimes par le bot (regles Discord).
 * @param {import("discord.js").DMChannel} channel
 * @param {import("discord.js").Client} client
 * @param {number} deadline
 * @returns {Promise<{ deleted: number; stoppedEarly: boolean }>}
 */
async function purgeBotMessagesInDm(channel, client, deadline) {
  const me = client.user.id;
  let deleted = 0;
  let rounds = 0;
  let stoppedEarly = false;

  while (Date.now() < deadline && rounds < MAX_PURGE_ROUNDS_PER_CHANNEL) {
    rounds += 1;
    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched || fetched.size === 0) break;

    const mine = [...fetched.values()].filter((m) => m.author?.id === me);
    if (mine.length === 0) break;

    for (let i = 0; i < mine.length; i += DELETE_MSG_CONCURRENCY) {
      if (Date.now() >= deadline) {
        stoppedEarly = true;
        return { deleted, stoppedEarly };
      }
      const slice = mine.slice(i, i + DELETE_MSG_CONCURRENCY);
      await Promise.all(slice.map((m) => m.delete().catch(() => null)));
      deleted += slice.length;
      if (i + DELETE_MSG_CONCURRENCY < mine.length) await sleep(BETWEEN_MSG_BATCH_MS);
    }
    await sleep(200);
  }

  if (Date.now() >= deadline) stoppedEarly = true;
  return { deleted, stoppedEarly };
}

/**
 * IDs utilisateurs : ne jamais fermer le MP avec eux (sanctions, preuves, staff).
 * @param {string} [extraFromSlash] liste "id,id" depuis la commande
 */
function buildProtectSet(extraFromSlash) {
  const set = new Set();
  const fromEnv = String(process.env.DM_PURGE_PROTECT_USER_IDS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));
  for (const id of fromEnv) set.add(id);
  if (extraFromSlash) {
    for (const id of String(extraFromSlash)
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{17,20}$/.test(s))) {
      set.add(id);
    }
  }
  return set;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("del-dm-all")
    .setDescription(
      "Efface les messages du bot dans chaque MP puis ferme le salon (sauf exclusions)."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("confirmer")
        .setDescription("Ecris exactement SUPPRIMER pour confirmer")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("ids_proteges")
        .setDescription("IDs supplementaires a ne jamais toucher (virgule). + DM_PURGE_PROTECT_USER_IDS")
        .setRequired(false)
        .setMaxLength(400)
    ),
  async execute(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Utilise cette commande **sur un serveur** (pas en MP).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const ownerId = getCommandOwnerBypassUserId();
    const isOwner = interaction.user.id === ownerId;
    const isAdmin = Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
    if (!isOwner && !isAdmin) {
      await interaction.reply({
        content: "Reserve aux **administrateurs** du serveur ou au **proprietaire des commandes** du bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.options.getString("confirmer", true) !== "SUPPRIMER") {
      await interaction.reply({
        content: "Pour confirmer, mets **confirmer** = exactement `SUPPRIMER` (majuscules).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const extraProtect = interaction.options.getString("ids_proteges");
    const protect = buildProtectSet(extraProtect || "");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const allDm = [...client.channels.cache.values()].filter(
      (c) => c.type === ChannelType.DM && c.recipient && !c.recipient.bot
    );

    const protectedList = allDm.filter((c) => protect.has(c.recipient.id));
    const toProcess = allDm.filter((c) => !protect.has(c.recipient.id));

    if (toProcess.length === 0) {
      await interaction.editReply({
        content:
          `Aucun salon MP a traiter (${allDm.length} MP 1:1 au total` +
          (protectedList.length ? `, **${protectedList.length}** protege(s) — \`DM_PURGE_PROTECT_USER_IDS\` / **ids_proteges**).` : ").")
      });
      return;
    }

    const t0 = Date.now();
    const deadline = t0 + MAX_RUN_MS;

    let closed = 0;
    let failed = 0;
    let msgsDeleted = 0;
    let aborted = false;
    let i = 0;

    for (const ch of toProcess) {
      if (Date.now() >= deadline) {
        aborted = true;
        break;
      }
      i += 1;
      try {
        const { deleted, stoppedEarly } = await purgeBotMessagesInDm(ch, client, deadline);
        msgsDeleted += deleted;
        if (stoppedEarly) {
          aborted = true;
          try {
            await ch.delete(`del-dm-all partiel par ${interaction.user.tag}`).catch(() => null);
            closed += 1;
          } catch {
            failed += 1;
          }
          break;
        }
        await ch.delete(`del-dm-all par ${interaction.user.tag}`);
        closed += 1;
      } catch {
        failed += 1;
      }
      if (i % 8 === 0 || i === toProcess.length) {
        await interaction
          .editReply({
            content:
              `Traitement… **${i}/${toProcess.length}** salons (messages bot supprimes **${msgsDeleted}**, fermes **${closed}**, echecs **${failed}**).`
          })
          .catch(() => null);
      }
      if (i < toProcess.length && Date.now() < deadline) await sleep(BETWEEN_CHANNELS_MS);
    }

    const lines = [
      "**Nettoyage MP termine**",
      `Messages du **bot** supprimes (historique API) : **${msgsDeleted}**`,
      `Salons MP fermes : **${closed}**`,
      `Echecs : **${failed}**`,
      `Proteges (intacts) : **${protectedList.length}**`,
      "",
      "_Seuls les messages **envoyes par le bot** peuvent etre supprimes ; les tiens dans le MP restent chez Discord._",
      "_MP visibles : salons ouverts dans la session du bot ; relance apres redemarrage si besoin._",
      "_Exclusions sanctions : \`DM_PURGE_PROTECT_USER_IDS\` (.env) ou **ids_proteges**._"
    ];
    if (aborted) {
      lines.push(
        "",
        "**Arret anticipe** (limite ~13 min). Relance la commande pour continuer sur les salons MP restants."
      );
    }

    await interaction.editReply({ content: lines.join("\n") }).catch(() => null);
  }
};
