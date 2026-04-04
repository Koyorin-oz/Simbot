const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const ACCENT_COLOR = 0x1b1825;
const GIVEAWAY_JOIN_PREFIX = "ga:join:";

function parseDurationMs(input) {
  const raw = String(input || "").toLowerCase().replace(/\s+/g, "");
  const re = /(\d+)(mois|mo|j|h|m|s)/g;
  let match;
  let total = 0;
  let consumed = "";

  while ((match = re.exec(raw))) {
    const value = Number(match[1]);
    const unit = match[2];
    consumed += match[0];
    if (!Number.isFinite(value) || value <= 0) continue;
    if (unit === "s") total += value * 1000;
    else if (unit === "m") total += value * 60_000;
    else if (unit === "h") total += value * 3_600_000;
    else if (unit === "j") total += value * 86_400_000;
    else total += value * 2_592_000_000; // mois/mo = 30 jours
  }

  if (!total || consumed.length !== raw.length) {
    return {
      ok: false,
      error: "Durée invalide. Exemples: `30m`, `1h30m`, `2j`, `1mois`."
    };
  }

  const min = 15_000;
  const max = 365 * 24 * 60 * 60 * 1000;
  if (total < min || total > max) {
    return { ok: false, error: "Durée hors limite (min 15s, max 365j)." };
  }
  return { ok: true, ms: total };
}

function modeLabel(mode, roleId) {
  if (mode === "exclude_role") return `Tout le monde **sauf** <@&${roleId}>`;
  if (mode === "include_role") return `Uniquement <@&${roleId}>`;
  return "Ouvert à tous";
}

function canParticipate(member, mode, roleId) {
  if (!member) return false;
  if (mode === "exclude_role") return !member.roles.cache.has(roleId);
  if (mode === "include_role") return member.roles.cache.has(roleId);
  return true;
}

function buildGiveawayPayload(state) {
  const count = state.participants.size;
  const endTs = Math.floor(state.endAt / 1000);
  const roleRule = modeLabel(state.mode, state.roleId);
  const desc = state.description?.trim() ? `\n\n${state.description.trim()}` : "";

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🎉 ${state.title}${desc}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Organisé par** : <@${state.authorId}>`,
          `**Gagnant(s)** : **${state.winnerCount}**`,
          `**Participation** : ${roleRule}`,
          `**Participants** : **${count}**`,
          "",
          `Fin: <t:${endTs}:F> (**<t:${endTs}:R>**)`
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${GIVEAWAY_JOIN_PREFIX}${state.id}`)
          .setLabel("Participer")
          .setEmoji("🎉")
          .setStyle(ButtonStyle.Primary)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: []
  };
}

function buildGiveawayEndedPayload(state, winners) {
  const participants = state.participants.size;
  const winnersText = winners.length
    ? winners.map((id) => `<@${id}>`).join(", ")
    : "Aucun participant valide";
  const roleRule = modeLabel(state.mode, state.roleId);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🎉 ${state.title} — Terminé`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Organisé par** : <@${state.authorId}>`,
          `**Mode** : ${roleRule}`,
          `**Participants finaux** : **${participants}**`,
          `**Gagnant(s)** : ${winnersText}`
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${GIVEAWAY_JOIN_PREFIX}${state.id}`)
          .setLabel("Giveaway terminé")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: []
  };
}

function pickRandomWinners(ids, count) {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

async function finalizeGiveaway(client, state) {
  if (!state || state.ended) return;
  state.ended = true;
  if (state.timeout) clearTimeout(state.timeout);

  const guild = await client.guilds.fetch(state.guildId).catch(() => null);
  const channel = guild && (await guild.channels.fetch(state.channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const message = await channel.messages.fetch(state.messageId).catch(() => null);
  if (!message) return;

  const winners = pickRandomWinners(state.participants, state.winnerCount);
  await message.edit(buildGiveawayEndedPayload(state, winners)).catch(() => null);

  const announce = winners.length
    ? `🎉 Giveaway **${state.title}** terminé ! Gagnant(s): ${winners.map((id) => `<@${id}>`).join(", ")}`
    : `🎉 Giveaway **${state.title}** terminé, mais aucun participant valide.`;
  await channel.send({ content: announce, allowedMentions: { parse: ["users"] } }).catch(() => null);
}

function scheduleGiveawayEnd(client, state) {
  const delay = Math.max(0, state.endAt - Date.now());
  state.timeout = setTimeout(() => {
    finalizeGiveaway(client, state).catch(() => null);
  }, delay);
}

module.exports = {
  GIVEAWAY_JOIN_PREFIX,
  parseDurationMs,
  canParticipate,
  buildGiveawayPayload,
  finalizeGiveaway,
  scheduleGiveawayEnd
};

