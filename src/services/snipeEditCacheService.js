/** Nombre max de messages supprimés mémorisés par salon (et max pour !snipe N). */
const MAX_SNIPE = 10;

/** Dernier contenu vu par le bot par messageId (Discord ne renvoie pas le texte à la suppression si non en cache). */
const MAX_MESSAGE_CONTENT_CACHE = 12_000;

/** @type {Map<string, { content: string; att: string }>} */
const messageContentCache = new Map();

/** @type {Map<string, SnipeEntry[]>} */
const deletedByChannel = new Map();

/** @type {Map<string, EditEntry>} */
const lastEditByChannel = new Map();

/**
 * @typedef {object} SnipeEntry
 * @property {string} messageId
 * @property {string} authorId
 * @property {string} authorTag
 * @property {string} content
 * @property {number} createdTimestamp
 */

/**
 * @typedef {object} EditEntry
 * @property {string} messageId
 * @property {string} authorId
 * @property {string} authorTag
 * @property {string} before
 * @property {string} after
 * @property {number} editedTimestamp
 */

function summarizeAttachments(attachments) {
  if (!attachments || attachments.size === 0) return "";
  const list = [...attachments.values()];
  const head = list
    .slice(0, 3)
    .map((a) => a.name || "fichier")
    .join(", ");
  const more = list.length > 3 ? ` (+${list.length - 3})` : "";
  return `📎 ${head}${more}`;
}

/**
 * Enregistre le dernier contenu connu (messageCreate / messageUpdate), pour les logs à la suppression.
 * @param {import("discord.js").Message} message
 */
function rememberMessage(message) {
  if (!message?.guild || message.author?.bot) return;
  const raw = typeof message.content === "string" ? message.content : "";
  const att = summarizeAttachments(message.attachments);
  messageContentCache.set(message.id, { content: raw, att });
  while (messageContentCache.size > MAX_MESSAGE_CONTENT_CACHE) {
    const first = messageContentCache.keys().next().value;
    messageContentCache.delete(first);
  }
}

/**
 * @param {string} messageId
 */
function forgetCachedMessage(messageId) {
  if (messageId) messageContentCache.delete(messageId);
}

/**
 * Texte + pieces jointes pour snipe / logs (messages partiels possibles).
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} message
 */
function buildMessageSnapshot(message) {
  const rawContent = typeof message.content === "string" ? message.content : "";
  let att = summarizeAttachments(message.attachments);
  const cached = messageContentCache.get(message.id);
  let text = rawContent.trim();
  if (!text && cached?.content != null) text = String(cached.content).trim();
  if (!att && cached?.att) att = cached.att;

  let content = text;
  if (!content) {
    if (att) content = att;
    else content = "(Contenu indisponible — le bot n'avait pas vu ce message.)";
  } else if (att) {
    content = `${content}\n${att}`;
  }
  return content;
}

/**
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} message
 */
function recordDeletedMessage(message) {
  if (!message.guild) return;
  const author = message.author;
  if (author && author.bot) return;

  const content = buildMessageSnapshot(message);

  const tag = author ? author.tag : "Utilisateur inconnu";
  const authorId = author?.id || (typeof message.authorId === "string" ? message.authorId : "0");

  /** @type {SnipeEntry} */
  const entry = {
    messageId: message.id,
    authorId,
    authorTag: tag,
    content,
    createdTimestamp: message.createdTimestamp || Date.now()
  };

  let arr = deletedByChannel.get(message.channelId);
  if (!arr) {
    arr = [];
    deletedByChannel.set(message.channelId, arr);
  }
  arr.unshift(entry);
  if (arr.length > MAX_SNIPE) arr.length = MAX_SNIPE;
}

/**
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} oldMessage
 * @param {import("discord.js").Message} newMessage
 */
/**
 * @returns {boolean} true si une edition utile a ete enregistree
 */
function recordEditedMessage(oldMessage, newMessage) {
  if (!newMessage.guild) return false;
  const author = newMessage.author;
  if (author?.bot) return false;

  const before = typeof oldMessage.content === "string" ? oldMessage.content : "";
  const after = typeof newMessage.content === "string" ? newMessage.content : "";
  if (before === after) return false;

  const b = before.trim() || "(vide)";
  const a = after.trim() || "(vide)";

  /** @type {EditEntry} */
  const entry = {
    messageId: newMessage.id,
    authorId: author.id,
    authorTag: author.tag,
    before: b,
    after: a,
    editedTimestamp: newMessage.editedTimestamp || Date.now()
  };
  lastEditByChannel.set(newMessage.channelId, entry);
  return true;
}

/**
 * @param {string} channelId
 * @param {number} count
 * @returns {SnipeEntry[]}
 */
function getSnipes(channelId, count) {
  const arr = deletedByChannel.get(channelId) || [];
  return arr.slice(0, count);
}

/**
 * @param {string} channelId
 * @returns {EditEntry | null}
 */
function getLastEdit(channelId) {
  return lastEditByChannel.get(channelId) || null;
}

module.exports = {
  MAX_SNIPE,
  buildMessageSnapshot,
  rememberMessage,
  forgetCachedMessage,
  recordDeletedMessage,
  recordEditedMessage,
  getSnipes,
  getLastEdit
};
