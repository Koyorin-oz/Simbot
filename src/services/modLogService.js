const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const realServerIds = require("../data/realServerIds");

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

module.exports = { sendModLog, baseEmbed, truncate };
