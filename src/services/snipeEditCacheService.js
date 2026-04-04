/** Nombre max de messages supprimés mémorisés par salon (et max pour !snipe N). */
const MAX_SNIPE = 10;

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
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} message
 */
function recordDeletedMessage(message) {
  if (!message.guild) return;
  const author = message.author;
  if (author && author.bot) return;

  const rawContent = typeof message.content === "string" ? message.content : "";
  const att = summarizeAttachments(message.attachments);
  let content = rawContent.trim();
  if (!content) {
    if (att) content = att;
    else content = "(Contenu indisponible — message non en cache du bot.)";
  } else if (att) {
    content = `${content}\n${att}`;
  }

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
function recordEditedMessage(oldMessage, newMessage) {
  if (!newMessage.guild) return;
  const author = newMessage.author;
  if (author?.bot) return;

  const before = typeof oldMessage.content === "string" ? oldMessage.content : "";
  const after = typeof newMessage.content === "string" ? newMessage.content : "";
  if (before === after) return;

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
  recordDeletedMessage,
  recordEditedMessage,
  getSnipes,
  getLastEdit
};
