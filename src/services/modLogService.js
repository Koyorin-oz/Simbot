const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const realServerIds = require("../data/realServerIds");
const { buildMessageSnapshot } = require("./snipeEditCacheService");

function truncate(str, max = 900) {
  const s = String(str ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

async function sendModLog(guild, embed) {
  const id = resolveModLogChannelId(guild?.id);
  if (!id || !guild) return;
  const ch = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
  if (!ch) {
    console.warn(`[MODLOG] Canal introuvable: guild=${guild.id} channel=${id}`);
    return;
  }
  if (!ch.isTextBased?.()) {
    console.warn(`[MODLOG] Canal non textuel: guild=${guild.id} channel=${id} type=${ch.type}`);
    return;
  }

  const me = guild.members.me;
  if (me) {
    const perms = ch.permissionsFor(me);
    const canSend =
      perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.SendMessages) &&
      perms?.has(PermissionFlagsBits.EmbedLinks);
    if (!canSend) {
      console.warn(`[MODLOG] Permissions insuffisantes: guild=${guild.id} channel=${id}`);
      return;
    }
  }

  const ok = await ch.send({ embeds: [embed] }).then(() => true).catch((e) => {
    console.warn(`[MODLOG] Echec envoi: guild=${guild.id} channel=${id} err=${e?.message || e}`);
    return false;
  });
  if (!ok) return;
}

function resolveModLogChannelId(guildId) {
  if (!guildId) return config.modLog?.channelId || "";

  // Priorite absolue pour le serveur principal final.
  if (guildId === realServerIds?.guildId) {
    return String(realServerIds?.channels?.modLogChannelId || "").trim() || config.modLog?.channelId || "";
  }

  // Sinon, essaie l'ID de setup par serveur, puis fallback config.
  try {
    const p = path.join(__dirname, "..", "data", "channelSetup.json");
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      const setupId = String(raw?.[guildId]?.modLogChannelId || "").trim();
      if (setupId) return setupId;
    }
  } catch {
    // ignore
  }
  return config.modLog?.channelId || "";
}

function baseEmbed(title, color = 0x2b2d31) {
  return new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
}

/**
 * @param {import("discord.js").Message | import("discord.js").PartialMessage} message
 */
async function logMessageDeleted(message) {
  if (!message.guild) return;
  if (message.author?.bot) return;
  const guild = message.guild;
  const snap = buildMessageSnapshot(message);
  const author = message.author;
  const authorLine = author
    ? `${author.tag} (\`${author.id}\`)`
    : `Inconnu (\`${String(message.authorId || "?")}\`)`;
  const embed = baseEmbed("Message supprimé", 0xed4245)
    .setDescription(
      `**Salon :** <#${message.channelId}>\n` +
        `**Auteur :** ${authorLine}\n` +
        `**ID :** \`${message.id}\`\n` +
        `[Contexte](https://discord.com/channels/${guild.id}/${message.channelId}/${message.id})`
    )
    .addFields({ name: "Contenu supprimé", value: truncate(snap, 1024) });
  await sendModLog(guild, embed);
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

  const lines = [];
  for (const m of human.slice(0, 12)) {
    const snap = buildMessageSnapshot(m);
    const tag = m.author?.tag || String(m.authorId || "?");
    lines.push(`• **${tag}** : ${truncate(snap, 220)}`);
  }
  const rest = human.length > 12 ? `\n_… et **${human.length - 12}** autre(s) — voir aussi **!snipe**._` : "";
  const embed = baseEmbed(`Suppressions en masse (${human.length} message(s))`, 0xc27c0e).setDescription(
    `**Salon :** <#${channel.id}>\n\n${lines.join("\n")}${rest}`.slice(0, 4090)
  );
  await sendModLog(guild, embed);
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
  await sendModLog(guild, embed);
}

module.exports = { sendModLog, baseEmbed, truncate, logMessageDeleted, logBulkMessagesDeleted, logMessageEdited };
