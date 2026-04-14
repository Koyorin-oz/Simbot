const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const musicService = require("../services/musicService");

/** Accent panneau musique (bleu Discord, aligné BLZ). */
const MUSIC_PANEL_COLOR = 0x5865f2;

function truncate(s, n) {
  const t = String(s || "");
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function formatQueueLine(t) {
  if (!t) return "";
  if (typeof t.spotifyCosplay === "boolean" && t.spotifyCosplay) return `🟢 Spotify (YT) — ${t.title}`;
  return t.title || "";
}

/**
 * Panneau musique — mise en page type BLZ (embed + transport + options Carmina).
 * @param {string} userId
 * @param {string} guildId
 */
function buildMusicPanelPayload(userId, guildId) {
  const id = String(userId);
  const gid = String(guildId || "");
  const st = musicService.getState(gid);
  const paused = gid ? musicService.isGuildPlaybackPaused(gid) : false;

  const qPreview = st.queue.slice(0, 4).map((t, i) => `${i + 1}. ${truncate(formatQueueLine(t), 60)}`);
  const more = st.queue.length > 4 ? `\n*+${st.queue.length - 4} dans la file*` : "";

  let body = "";
  if (st.nowPlaying) {
    body = `**En cours**\n${truncate(formatQueueLine(st.nowPlaying), 90)}`;
    if (paused) body += "\n\n*⏸ En pause*";
  } else {
    body = "*Aucune lecture — **Ajouter** (recherche / lien) ou connecte-toi au vocal.*";
  }

  if (qPreview.length) {
    body += `\n\n**File**\n${qPreview.join("\n")}${more}`;
  }

  const vol = st.volume ?? 100;

  const embed = new EmbedBuilder()
    .setColor(MUSIC_PANEL_COLOR)
    .setTitle("Musique")
    .setDescription(body)
    .setFooter({
      text: `Volume ~${vol}% · Transport : Début · Pause/Play · Suivant · File · Stop · puis options (lien, Spotify, vocal…)`
    });

  const secondary = ButtonStyle.Secondary;
  const danger = ButtonStyle.Danger;
  const success = ButtonStyle.Success;
  const primary = ButtonStyle.Primary;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:restart:${id}`)
      .setStyle(secondary)
      .setLabel("Début")
      .setEmoji("⏮️"),
    new ButtonBuilder()
      .setCustomId(`music_pb:playtoggle:${id}`)
      .setStyle(paused ? success : primary)
      .setLabel(paused ? "Play" : "Pause")
      .setEmoji(paused ? "▶️" : "⏸️"),
    new ButtonBuilder()
      .setCustomId(`music_pb:skip:${id}`)
      .setStyle(secondary)
      .setLabel("Suivant")
      .setEmoji("⏭️"),
    new ButtonBuilder()
      .setCustomId(`music_pb:queue:${id}`)
      .setStyle(secondary)
      .setLabel("File")
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId(`music_pb:stop:${id}`)
      .setStyle(danger)
      .setLabel("Stop")
      .setEmoji("⏹️")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:search:${id}`)
      .setStyle(success)
      .setLabel("Ajouter")
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId(`music_pb:clearqueue:${id}`)
      .setStyle(secondary)
      .setLabel("Vider file")
      .setEmoji("🧹"),
    new ButtonBuilder()
      .setCustomId(`music_pb:playlist:${id}`)
      .setStyle(primary)
      .setLabel("Playlist")
      .setEmoji("📑")
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:link:${id}`)
      .setStyle(secondary)
      .setLabel("Coller lien")
      .setEmoji("🔗"),
    new ButtonBuilder()
      .setCustomId(`music_pb:hist:${id}`)
      .setStyle(secondary)
      .setLabel("Historique")
      .setEmoji("📜"),
    new ButtonBuilder()
      .setCustomId(`music_pb:spotifypl:${id}`)
      .setStyle(success)
      .setLabel("Spotify")
      .setEmoji("🎵"),
    new ButtonBuilder()
      .setCustomId(`music_pb:join:${id}`)
      .setStyle(primary)
      .setLabel("Rejoindre voc")
      .setEmoji("🔊"),
    new ButtonBuilder()
      .setCustomId(`music_pb:leave:${id}`)
      .setStyle(danger)
      .setLabel("Bot quitte")
      .setEmoji("🚪")
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`music_pb:voldown:${id}`)
      .setStyle(secondary)
      .setLabel("Son -")
      .setEmoji("🔉"),
    new ButtonBuilder()
      .setCustomId(`music_pb:volup:${id}`)
      .setStyle(secondary)
      .setLabel("Son +")
      .setEmoji("🔊"),
    new ButtonBuilder()
      .setCustomId(`music_pb:refresh:${id}`)
      .setStyle(secondary)
      .setLabel("Rafraîchir")
      .setEmoji("🔄")
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildMusicPanelPayload, MUSIC_PANEL_COLOR };
