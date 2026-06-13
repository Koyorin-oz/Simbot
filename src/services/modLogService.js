const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const realServerIds = require("../data/realServerIds");
const { buildMessageSnapshot } = require("./snipeEditCacheService");

function truncate(str, max = 900) {
  const s = String(str ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** @type {Map<string, number>} */
const bulkSuppressUntil = new Map();
/** @type {Map<string, number>} */
const recentDeletionLog = new Map();

const BULK_SUPPRESS_MS = 25_000;
const DEDUP_LOG_MS = 90_000;
const DELETE_BATCH_MS = 1_350;
const PRUNE_EVERY = 500;

function pruneMapByAge(map, maxAgeMs) {
  const now = Date.now();
  if (map.size < PRUNE_EVERY) return;
  for (const [k, t] of map) {
    if (now - t > maxAgeMs) map.delete(k);
  }
}

/**
 * Appelé au début de messageDeleteBulk : si l'API émet aussi des messageDelete,
 * on évite de poster 1 log par message en plus du récap bulk.
 * @param {string[]} messageIds
 */
function registerBulkSuppressionIds(messageIds) {
  const until = Date.now() + BULK_SUPPRESS_MS;
  for (const id of messageIds) {
    if (id) bulkSuppressUntil.set(id, until);
  }
  pruneMapByAge(bulkSuppressUntil, BULK_SUPPRESS_MS * 2);
}

function isBulkSuppressed(messageId) {
  const until = bulkSuppressUntil.get(messageId);
  if (!until) return false;
  if (Date.now() > until) {
    bulkSuppressUntil.delete(messageId);
    return false;
  }
  return true;
}

function markDeletionLogged(messageId) {
  recentDeletionLog.set(messageId, Date.now());
  pruneMapByAge(recentDeletionLog, DEDUP_LOG_MS * 2);
}

function isDuplicateDeletionLog(messageId) {
  const t = recentDeletionLog.get(messageId);
  if (!t) return false;
  if (Date.now() - t > DEDUP_LOG_MS) {
    recentDeletionLog.delete(messageId);
    return false;
  }
  return true;
}

/** @typedef {{ messageId: string, authorTag: string, authorId: string, snap: string, channelId: string }} DeleteQueueItem */

/** @type {Map<string, { guild: import("discord.js").Guild, items: DeleteQueueItem[], timer: NodeJS.Timeout | null }>} */
const pendingDeletesByChannel = new Map();

/**
 * - message : suppressions / editions + roles ajoutes / retires sur un membre
 * - server  : vocal + salons + pseudos + arrivees / departs + invites + bans + emojis…
 * @typedef {"message"|"server"} LogChannelType
 */

/** @returns {Promise<import("discord.js").TextChannel | import("discord.js").NewsChannel | import("discord.js").ThreadChannel | null>} */
async function resolveLogChannel(guild, type = "server") {
  const id = resolveLogChannelId(guild?.id, type);
  if (!id || !guild) return null;
  const ch = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
  if (!ch) {
    console.warn(`[MODLOG] Canal introuvable (${type}): guild=${guild.id} channel=${id}`);
    return null;
  }
  if (!ch.isTextBased?.()) {
    console.warn(`[MODLOG] Canal non textuel (${type}): guild=${guild.id} channel=${id} type=${ch.type}`);
    return null;
  }
  const me = guild.members.me;
  if (me) {
    const perms = ch.permissionsFor(me);
    const canSend =
      perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.SendMessages) &&
      perms?.has(PermissionFlagsBits.EmbedLinks);
    if (!canSend) {
      console.warn(`[MODLOG] Permissions insuffisantes (${type}): guild=${guild.id} channel=${id}`);
      return null;
    }
  }
  return ch;
}

/** @deprecated alias */
async function resolveModLogChannel(guild) {
  return resolveLogChannel(guild, "server");
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").EmbedBuilder} embed
 * @param {LogChannelType} [type]
 */
async function sendServerLog(guild, embed, type = "server") {
  const ch = await resolveLogChannel(guild, type);
  if (!ch) return;
  const ok = await ch.send({ embeds: [embed] }).then(() => true).catch((e) => {
    console.warn(
      `[MODLOG] Echec envoi (${type}): guild=${guild.id} channel=${ch.id} err=${e?.message || e}`
    );
    return false;
  });
  if (!ok) return;
}

async function sendModLog(guild, embed) {
  return sendServerLog(guild, embed, "server");
}

/** Envoie plusieurs embeds découpés par paquets de 10 (limite Discord). */
async function sendModLogEmbeds(guild, embeds, type = "message") {
  if (!embeds?.length) return;
  const ch = await resolveLogChannel(guild, type);
  if (!ch) return;
  for (let i = 0; i < embeds.length; i += 10) {
    const slice = embeds.slice(i, i + 10);
    const ok = await ch.send({ embeds: slice }).then(() => true).catch((e) => {
      console.warn(`[MODLOG] Echec envoi multi-embed (${type}): guild=${guild.id} err=${e?.message || e}`);
      return false;
    });
    if (!ok) return;
  }
}

const BULK_LOG_BODY_MAX = 3900;

/**
 * Découpe un texte long en plusieurs embeds (coupures préférentiellement aux retours ligne).
 * @param {string} mainTitle
 * @param {number} color
 * @param {string} fullText préambule + corps (sera découpé)
 */
function chunkTextToEmbeds(mainTitle, color, fullText) {
  const text = fullText.trimEnd();
  if (!text) return [baseEmbed(mainTitle, color).setDescription("_(aucun détail)_")];

  /** @type {EmbedBuilder[]} */
  const embeds = [];
  let rest = text;
  let first = true;
  while (rest.length > 0) {
    if (rest.length <= 4090) {
      embeds.push(baseEmbed(first ? mainTitle : `${mainTitle} (suite)`, color).setDescription(rest));
      break;
    }
    const sliceLen = Math.min(BULK_LOG_BODY_MAX, 4090);
    let chunk = rest.slice(0, sliceLen);
    const nl = chunk.lastIndexOf("\n");
    if (nl > 400) chunk = chunk.slice(0, nl);
    if (chunk.length === 0) chunk = rest.slice(0, sliceLen);
    embeds.push(baseEmbed(first ? mainTitle : `${mainTitle} (suite)`, color).setDescription(chunk.trimEnd()));
    rest = rest.slice(chunk.length).trimStart();
    first = false;
  }
  return embeds;
}

/**
 * Log staff : don économie (/give-lp, /give-sc, …).
 * @param {import("discord.js").Guild} guild
 * @param {{ adminTag: string, adminId: string, targetTag: string, targetId: string, amount: number, currencyLabel: string, commandLabel: string }} p
 */
async function logEconomyAdminGive(guild, p) {
  const embed = baseEmbed("Don économie (admin)", 0x57f287).setDescription(
    `**Staff :** ${p.adminTag} (\`${p.adminId}\`)\n` +
      `**Cible :** ${p.targetTag} (\`${p.targetId}\`)\n` +
      `**Montant :** ${Number(p.amount).toLocaleString("fr-FR")} **${p.currencyLabel}**\n` +
      `**Commande :** \`${p.commandLabel}\``
  );
  await sendModLog(guild, embed);
}

function readChannelSetupGuild(guildId) {
  try {
    const p = path.join(__dirname, "..", "data", "channelSetup.json");
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return raw?.[guildId] || null;
  } catch {
    return null;
  }
}

function resolveModLogChannelId(guildId) {
  return resolveLogChannelId(guildId, "server");
}

function pickId(...candidates) {
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * @param {string} guildId
 * @param {LogChannelType} type
 */
function resolveLogChannelId(guildId, type = "server") {
  const fallbackLegacy = config.modLog?.channelId || "";

  if (!guildId) {
    if (type === "message") {
      return pickId(config.modLog?.messageLogChannelId) || fallbackLegacy;
    }
    return (
      pickId(config.modLog?.serverLogChannelId, config.modLog?.voiceChannelId) || fallbackLegacy
    );
  }

  const setup = readChannelSetupGuild(guildId);
  const isProd = guildId === realServerIds?.guildId;
  const channels = isProd ? realServerIds?.channels || {} : {};

  if (type === "message") {
    if (!isProd) {
      return resolveLogChannelId(guildId, "server");
    }
    return (
      pickId(
        setup?.messageLogChannelId,
        isProd && channels.messageLogChannelId,
        config.modLog?.messageLogChannelId,
        setup?.modLogChannelId,
        isProd && channels.modLogChannelId,
        fallbackLegacy
      ) || fallbackLegacy
    );
  }

  return (
    pickId(
      setup?.serverLogChannelId,
      isProd && channels.serverLogChannelId,
      config.modLog?.serverLogChannelId,
      setup?.voiceLogChannelId,
      isProd && channels.voiceLogChannelId,
      config.modLog?.voiceChannelId,
      setup?.modLogChannelId,
      isProd && channels.modLogChannelId,
      fallbackLegacy
    ) || fallbackLegacy
  );
}

function baseEmbed(title, color = 0x2b2d31) {
  return new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
}

/**
 * Lien vers le salon uniquement : l’ancre `.../channel/messageId` sur un message supprimé
 * fait souvent ouvrir l’historique au mauvais endroit côté client Discord.
 * @param {string} guildId
 * @param {string} channelId
 */
function channelJumpUrl(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {string} channelId
 * @param {DeleteQueueItem[]} items
 */
async function tryResolveDeleteExecutor(guild, channelId, items) {
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) return null;

  const logs = await guild.fetchAuditLogs({ limit: 18 }).catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  const maxAge = 14_000;
  const sorted = [...logs.entries.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  if (items.length > 1) {
    for (const entry of sorted) {
      if (now - entry.createdTimestamp > maxAge) break;
      if (entry.action !== AuditLogEvent.MessageBulkDelete) continue;
      const targetCh = entry.target;
      const tid = targetCh && typeof targetCh === "object" && "id" in targetCh ? targetCh.id : entry.targetId;
      if (tid !== channelId) continue;
      const count = entry.extra?.count ?? 0;
      if (count && count < items.length) continue;
      return entry.executor;
    }
  }

  for (const item of items) {
    if (!item.authorId) continue;
    for (const entry of sorted) {
      if (now - entry.createdTimestamp > maxAge) break;
      if (entry.action !== AuditLogEvent.MessageDelete) continue;
      const chExtra = entry.extra?.channel;
      const eChId = chExtra && typeof chExtra === "object" && "id" in chExtra ? chExtra.id : null;
      if (eChId !== channelId) continue;
      if (entry.targetId === item.authorId) return entry.executor;
    }
  }

  if (items.length === 1) {
    const want = items[0].authorId;
    for (const entry of sorted) {
      if (now - entry.createdTimestamp > maxAge) break;
      if (entry.action !== AuditLogEvent.MessageDelete) continue;
      const chExtra = entry.extra?.channel;
      const eChId = chExtra && typeof chExtra === "object" && "id" in chExtra ? chExtra.id : null;
      if (eChId !== channelId) continue;
      if (want && entry.targetId !== want) continue;
      return entry.executor;
    }
  }

  return null;
}

function executorLine(user) {
  if (!user) return "";
  const selfTag = user.id ? ` (<@${user.id}>)` : "";
  return `**Suppression :** ${user.tag || user.username || "?"}${selfTag}\n`;
}

/**
 * @param {string} channelId
 * @param {import("discord.js").Client} client
 */
async function flushDeleteQueue(channelId, client) {
  const pending = pendingDeletesByChannel.get(channelId);
  if (!pending) return;
  pendingDeletesByChannel.delete(channelId);
  if (pending.timer) clearTimeout(pending.timer);

  const { guild, items } = pending;
  if (!items.length) return;

  const channelUrl = channelJumpUrl(guild.id, channelId);
  const execUser = await tryResolveDeleteExecutor(guild, channelId, items).catch(() => null);
  const execBlock = executorLine(execUser);

  if (items.length === 1) {
    const it = items[0];
    const embed = baseEmbed("Message supprimé", 0xed4245)
      .setDescription(
        `**Salon :** <#${it.channelId}>\n` +
          execBlock +
          `**Auteur :** ${it.authorTag}\n` +
          `**ID message :** \`${it.messageId}\`\n` +
          `[Ouvrir le salon](${channelUrl}) _(sans ancrage : le message n’existe plus)_`
      )
      .addFields({ name: "Contenu supprimé", value: truncate(it.snap, 1024) });
    await sendServerLog(guild, embed, "message");
    return;
  }

  const bodyLines = items.map(
    (it) => `• **${it.authorTag}** — \`${it.messageId}\` : ${truncate(it.snap, 1900)}`
  );
  const fullText =
    `**Salon :** <#${channelId}>\n` +
    execBlock +
    `[Ouvrir le salon](${channelUrl})\n\n` +
    `_Détail : **${items.length}** message(s) (tous inclus)._` +
    `\n\n${bodyLines.join("\n")}`;
  const embeds = chunkTextToEmbeds(`Messages supprimés (${items.length})`, 0xed4245, fullText);
  await sendModLogEmbeds(guild, embeds, "message");
}

/**
 * Enfile une ou plusieurs suppressions (même salon) puis envoie 1 embed après un court délai.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} rawMessage
 */
async function enqueueMessageDeleteModlog(client, rawMessage) {
  if (!rawMessage.guild) return;
  if (rawMessage.author?.bot) return;
  if (isBulkSuppressed(rawMessage.id)) return;
  if (isDuplicateDeletionLog(rawMessage.id)) return;
  markDeletionLogged(rawMessage.id);

  let message = rawMessage;
  if (message.partial) {
    try {
      message = await message.fetch();
    } catch {
      /* message déjà parti */
    }
  }

  let author = message.author;
  if (!author && message.authorId) {
    author = await client.users.fetch(message.authorId).catch(() => null);
  }

  const authorTag = author
    ? `${author.tag} (\`${author.id}\`)`
    : `Inconnu (\`${String(message.authorId || "?")}\`)`;
  const authorId = author?.id || (typeof message.authorId === "string" ? message.authorId : "");
  const snap = buildMessageSnapshot(message);

  const channelId = message.channelId;
  const guild = message.guild;

  let pending = pendingDeletesByChannel.get(channelId);
  if (!pending) {
    pending = { guild, items: [], timer: null };
    pendingDeletesByChannel.set(channelId, pending);
  }

  pending.items.push({
    messageId: message.id,
    authorTag,
    authorId,
    snap,
    channelId
  });

  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    flushDeleteQueue(channelId, client).catch((e) =>
      console.warn("[MODLOG] flushDeleteQueue", e?.message || e)
    );
  }, DELETE_BATCH_MS);
}

/**
 * @param {import("discord.js").Channel} channel
 * @param {import("discord.js").Message[]} messages
 */
async function logBulkMessagesDeleted(channel, messages) {
  const guild = channel.guild;
  if (!guild || !messages.length) return;
  const human = messages.filter((m) => !m.author?.bot);
  if (!human.length) return;

  human.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
  const channelUrl = channelJumpUrl(guild.id, channel.id);
  const bodyLines = human.map((m) => {
    const snap = buildMessageSnapshot(m);
    const tag = m.author?.tag || String(m.authorId || "?");
    const ts =
      m.createdTimestamp != null
        ? ` <t:${Math.floor(m.createdTimestamp / 1000)}:f> `
        : " ";
    return `•${ts}**${tag}** — \`${m.id}\` : ${truncate(snap, 1900)}`;
  });
  const fullText =
    `**Salon :** <#${channel.id}>\n` +
      `[Ouvrir le salon](${channelUrl})\n\n` +
      `_**${human.length}** message(s) — liste complète sans troncature** (ordre chronologique, date par message)._` +
      `\n\n${bodyLines.join("\n")}`;
  const embeds = chunkTextToEmbeds(`Suppressions en masse (${human.length} message(s))`, 0xc27c0e, fullText);
  await sendModLogEmbeds(guild, embeds, "message");
}

/**
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} oldMessage
 * @param {import("discord.js").Message} newMessage
 */
async function logMessageEdited(oldMessage, newMessage) {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  const before = typeof oldMessage.content === "string" ? oldMessage.content : "";
  const after = typeof newMessage.content === "string" ? newMessage.content : "";
  if (before === after) return;

  const guild = newMessage.guild;
  const author = newMessage.author;
  const b = before.trim() || "(vide)";
  const a = after.trim() || "(vide)";
  const embed = baseEmbed("Message modifié", 0xf0b232)
    .setDescription(
      `**Salon :** <#${newMessage.channelId}>\n` +
        `**Auteur :** ${author.tag} (\`${author.id}\`)\n` +
        `**ID :** \`${newMessage.id}\`\n` +
        `[Voir le message](https://discord.com/channels/${guild.id}/${newMessage.channelId}/${newMessage.id})`
    )
    .addFields(
      { name: "Avant", value: truncate(b, 1024) },
      { name: "Après", value: truncate(a, 1024) }
    );
  await sendServerLog(guild, embed, "message");
}

module.exports = {
  sendServerLog,
  sendModLog,
  sendModLogEmbeds,
  resolveLogChannelId,
  baseEmbed,
  truncate,
  enqueueMessageDeleteModlog,
  registerBulkSuppressionIds,
  logBulkMessagesDeleted,
  logMessageEdited,
  logEconomyAdminGive
};
