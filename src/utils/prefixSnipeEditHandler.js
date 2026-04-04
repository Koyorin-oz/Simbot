const { EmbedBuilder } = require("discord.js");
const { MAX_SNIPE, getSnipes, getLastEdit } = require("../services/snipeEditCacheService");

const SNIPE_COLOR = 0xe74c3c;
const EDIT_COLOR = 0x3498db;

function truncateField(s, max = 1000) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * @param {import("discord.js").Message} message
 * @returns {Promise<boolean>}
 */
async function handlePrefixSnipeEdit(message) {
  const raw = (message.content || "").trim();
  if (!raw.startsWith("!")) return false;

  const snipeMatch = raw.match(/^!snipe\s*(\d*)$/i);
  if (snipeMatch) {
    let n = snipeMatch[1] ? parseInt(snipeMatch[1], 10) : 1;
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(MAX_SNIPE, n);

    const list = getSnipes(message.channelId, n);
    if (!list.length) {
      await message.reply({ content: "Rien à snipe dans ce salon pour l’instant." }).catch(() => null);
      return true;
    }

    const embed = new EmbedBuilder()
      .setColor(SNIPE_COLOR)
      .setTitle(n === 1 ? "Snipe" : `Snipe — ${list.length} dernier(s) message(s) supprimé(s)`)
      .setTimestamp();

    const valueMax = Math.min(1024, Math.max(180, Math.floor(4200 / list.length)));

    list.forEach((e, i) => {
      const when = e.createdTimestamp ? `<t:${Math.floor(e.createdTimestamp / 1000)}:R>` : "—";
      embed.addFields({
        name: truncateField(`#${i + 1} · ${e.authorTag} · ${when}`, 256),
        value: truncateField(e.content, valueMax) || "—"
      });
    });

    await message.reply({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
    return true;
  }

  if (/^!edit$/i.test(raw)) {
    const e = getLastEdit(message.channelId);
    if (!e) {
      await message.reply({ content: "Aucune édition récente enregistrée dans ce salon." }).catch(() => null);
      return true;
    }

    const when = e.editedTimestamp ? `<t:${Math.floor(e.editedTimestamp / 1000)}:R>` : "—";
    const embed = new EmbedBuilder()
      .setColor(EDIT_COLOR)
      .setTitle("Edit — dernier message modifié")
      .setDescription(`**Auteur :** ${e.authorTag}\n**Édité :** ${when}`)
      .addFields(
        { name: "Avant", value: truncateField(e.before, 1024) },
        { name: "Après", value: truncateField(e.after, 1024) }
      )
      .setFooter({ text: `ID message : ${e.messageId}` });

    await message.reply({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
    return true;
  }

  return false;
}

module.exports = { handlePrefixSnipeEdit };
