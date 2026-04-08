const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");
const config = require("../config");
const { ensureSuggestionsChannel } = require("./channelBootstrapService");

const VOTE_PREFIX = "sg_vote";

/** Barre gauche embed : rouge si majorite de contre, vert-jaune si leger exces de pour, etc. */
function suggestionAccentFromVotes(up, down) {
  const t = up + down;
  if (t === 0) return 0x9c2634;
  const p = up / t;
  if (p < 0.35) return 0xed4245;
  if (p < 0.48) return 0xe53935;
  if (p < 0.52) return 0xffb74d;
  if (p <= 0.68) return 0xdce775;
  return 0xaed581;
}

/** Format boutons : sg_vote:<id>:up|down|neutral */
function parseSuggestionVoteCustomId(customId) {
  if (!customId || !String(customId).startsWith(`${VOTE_PREFIX}:`)) return null;
  const parts = String(customId).split(":");
  if (parts.length !== 3) return null;
  const suggestionId = Number(parts[1]);
  const dir = parts[2];
  if (!Number.isInteger(suggestionId) || (dir !== "up" && dir !== "down" && dir !== "neutral")) {
    return null;
  }
  return { suggestionId, dir };
}

function channelMatchesStoredSuggestion(interaction, storedChannelId) {
  const sid = String(storedChannelId);
  if (String(interaction.channelId) === sid) return true;
  const ch = interaction.channel;
  if (ch?.isThread?.() && String(ch.parentId) === sid) return true;
  return false;
}

function safeImageUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim();
  if (!u || u.length > 2048) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return u;
  } catch {
    return null;
  }
}

function sanitizeSnippet(text, max) {
  return String(text || "")
    .replace(/```/g, "'''")
    .slice(0, max);
}

function isVerifiedMember(member) {
  const id = config.welcomeVerify?.roleVerifiedId;
  if (!id) return true;
  return member?.roles?.cache?.has(id) ?? false;
}

/** Voir / voter : membre vérifié ou staff (staff peut n'avoir que le rôle mod). */
function canViewAndVoteSuggestions(member) {
  if (!member) return false;
  if (isSuggestionsStaff(member)) return true;
  return isVerifiedMember(member);
}

function isSuggestionsStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  const staffRole = config.suggestions?.staffRoleId;
  if (staffRole && member.roles.cache.has(staffRole)) return true;
  return false;
}

async function getVoteCounts(prisma, suggestionId) {
  const rows = await prisma.suggestionVote.findMany({ where: { suggestionId } });
  let up = 0;
  let down = 0;
  let neutral = 0;
  for (const r of rows) {
    if (r.value === 1) up += 1;
    else if (r.value === -1) down += 1;
    else if (r.value === 0) neutral += 1;
  }
  return { up, down, neutral };
}

/**
 * Si d’anciennes lignes dupliquaient le meme userId (course / bug), on garde le vote le plus recent (id max).
 */
async function pruneDuplicateSuggestionVotes(prisma, suggestionId) {
  const rows = await prisma.suggestionVote.findMany({
    where: { suggestionId },
    orderBy: { id: "desc" }
  });
  const seenUser = new Set();
  const idsToDelete = [];
  for (const r of rows) {
    if (seenUser.has(r.userId)) idsToDelete.push(r.id);
    else seenUser.add(r.userId);
  }
  if (idsToDelete.length) {
    await prisma.suggestionVote.deleteMany({ where: { id: { in: idsToDelete } } });
  }
}

/**
 * Un membre = une seule ligne par suggestion (Pour / Neutre / Contre exclusifs).
 * Clic sur un autre bouton remplace le vote. Re-clic sur le meme bouton = rien.
 * Upsert atomique pour eviter course (double create) et doublons en base.
 */
async function applyVote(prisma, suggestionId, userId, direction) {
  const val = direction === "up" ? 1 : direction === "down" ? -1 : 0;
  await pruneDuplicateSuggestionVotes(prisma, suggestionId);
  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_userId: { suggestionId, userId } }
  });
  if (existing && existing.value === val) return;
  await prisma.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    create: { suggestionId, userId, value: val },
    update: { value: val }
  });
}

function isSuggestionOpenRow(suggestion) {
  const s = String(suggestion?.status || "OPEN").toUpperCase();
  return s === "OPEN";
}

/**
 * @param {{ up: number, down: number, neutral?: number }} counts
 * @param {{ pingRoleId?: string, footerIconURL?: string|null }} [opts]
 */
function buildSuggestionMessagePayload(suggestion, counts, opts = {}) {
  const rawStatus = suggestion?.status != null ? String(suggestion.status) : "OPEN";
  const status = rawStatus.toUpperCase();
  const isTerminal = status === "ACCEPTED" || status === "REJECTED";

  let up;
  let down;
  let neutral;
  if (isTerminal && suggestion.snapshotPour != null) {
    up = Number(suggestion.snapshotPour) || 0;
    neutral = Number(suggestion.snapshotNeutral) || 0;
    down = Number(suggestion.snapshotContre) || 0;
  } else {
    up = Number(counts.up) || 0;
    down = Number(counts.down) || 0;
    neutral = Number(counts.neutral) || 0;
  }

  const { id, authorId, title, body, imageUrl } = suggestion;
  const titleSafe = sanitizeSnippet(title, 200);
  const bodySafe = sanitizeSnippet(body, 3500);
  const pingRoleId = String(opts.pingRoleId || "").trim();
  const footerIcon = opts.footerIconURL || undefined;

  const color = isTerminal
    ? status === "ACCEPTED"
      ? 0x57f287
      : 0xed4245
    : suggestionAccentFromVotes(up, down);

  const descParts = [
    `## :bulb: ${titleSafe}`,
    "",
    bodySafe,
    "",
    `**Auteur** : <@${authorId}>`,
    "",
    isTerminal
      ? `_**Votes au moment de la décision** — Pour **${up}** · Neutre **${neutral}** · Contre **${down}**_`
      : `_**Votes** — Pour **${up}** · Neutre **${neutral}** · Contre **${down}**_`
  ];

  if (isTerminal) {
    const decisionLine =
      status === "ACCEPTED" ? "✅ **Décision : acceptée**" : "❌ **Décision : refusée**";
    descParts.push("", decisionLine);
    const reasonSafe = sanitizeSnippet(suggestion.moderationReason || "—", 900);
    descParts.push("", `**Motif (staff)** : ${reasonSafe}`);
    if (suggestion.moderatedById) {
      if (suggestion.moderatedAt) {
        const ts = Math.floor(new Date(suggestion.moderatedAt).getTime() / 1000);
        descParts.push("", `_Par <@${suggestion.moderatedById}> · <t:${ts}:F>_`);
      } else {
        descParts.push("", `_Par <@${suggestion.moderatedById}>_`);
      }
    }
  } else {
    descParts.push("", "_Un seul choix par membre : un nouveau bouton remplace ton vote._");
    descParts.push("_Vote avec les boutons ci-dessous._");
  }

  const desc = descParts.join("\n").slice(0, 4090);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(desc)
    .setFooter({ text: "La Carminauté", iconURL: footerIcon })
    .setTimestamp(new Date());

  if (imageUrl) embed.setImage(imageUrl);

  const allowedMentions = { parse: [], users: [authorId] };
  if (pingRoleId) allowedMentions.roles = [pingRoleId];

  const out = {
    embeds: [embed],
    components: isTerminal
      ? []
      : [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`${VOTE_PREFIX}:${id}:up`)
              .setLabel(`Pour · ${up}`)
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`${VOTE_PREFIX}:${id}:neutral`)
              .setLabel(`Neutre · ${neutral}`)
              .setEmoji("➖")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`${VOTE_PREFIX}:${id}:down`)
              .setLabel(`Contre · ${down}`)
              .setEmoji("❌")
              .setStyle(ButtonStyle.Danger)
          )
        ],
    allowedMentions
  };
  if (pingRoleId && !isTerminal) {
    out.content = `<@&${pingRoleId}>\n**Nouvelle suggestion**`;
  }
  return out;
}

/** @param {{ pingRoleId?: string, footerIconURL?: string|null }} [opts] */
function buildSuggestionPostPayload(suggestion, counts, opts = {}) {
  return buildSuggestionMessagePayload(suggestion, counts, opts);
}

/**
 * Publication complete : salon suggestions, thread de discussion, base de donnees.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function submitNewSuggestion(client, interaction, { title, body, imageUrl }) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, error: "Hors serveur." };

  let channel = null;
  if (config.suggestions?.channelId) {
    channel = await guild.channels.fetch(config.suggestions.channelId).catch(() => null);
  }
  if (!channel?.isTextBased?.()) {
    const ensured = await ensureSuggestionsChannel(guild);
    if (!ensured.ok) return { ok: false, error: ensured.error };
    channel = ensured.channel;
  }

  const me = guild.members.me;
  const botPerms = me ? channel.permissionsFor(me) : null;
  if (!botPerms?.has(PermissionFlagsBits.ViewChannel) || !botPerms.has(PermissionFlagsBits.SendMessages)) {
    return { ok: false, error: "Le bot ne peut pas poster dans le salon suggestions." };
  }

  const canThread = botPerms.has(PermissionFlagsBits.CreatePublicThreads);
  if (!botPerms.has(PermissionFlagsBits.EmbedLinks)) {
    return { ok: false, error: "Le bot doit pouvoir **integrer des liens** dans le salon suggestions." };
  }

  let row;
  try {
    row = await client.prisma.suggestion.create({
      data: {
        guildId: guild.id,
        channelId: channel.id,
        authorId: interaction.user.id,
        title: title.slice(0, 200),
        body: body.slice(0, 4000),
        imageUrl: imageUrl || null,
        messageId: null
      }
    });
  } catch (e) {
    return { ok: false, error: `Erreur base de donnees : ${e.message || e}` };
  }

  const pingRoleId = String(config.suggestions?.pingRoleId || "").trim();
  const footerIconURL = guild.iconURL({ extension: "png", size: 64 }) || null;
  const payload = buildSuggestionPostPayload(row, { up: 0, down: 0, neutral: 0 }, {
    pingRoleId,
    footerIconURL
  });

  let msg;
  try {
    msg = await channel.send(payload);
  } catch (e) {
    await client.prisma.suggestion.delete({ where: { id: row.id } }).catch(() => null);
    return { ok: false, error: `Impossible d'envoyer le message : ${e.message || e}` };
  }

  await client.prisma.suggestion.update({
    where: { id: row.id },
    data: { messageId: msg.id }
  });

  if (canThread) {
    try {
      await msg.startThread({
        name: sanitizeSnippet(title, 100) || "Discussion",
        autoArchiveDuration: 1440,
        reason: "Discussion sur la suggestion"
      });
    } catch {
      /* salon sans fils ou limite Discord */
    }
  }

  return { ok: true, url: msg.url };
}

/** ID message Discord depuis un lien canaux/... ou un snowflake seul. */
function extractSuggestionMessageId(raw) {
  const s = String(raw || "").trim();
  const mCh = s.match(/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/);
  if (mCh) return mCh[3];
  const lone = s.match(/^\d{17,20}$/);
  if (lone) return lone[0];
  const all = s.match(/\d{17,20}/g);
  return all?.length ? all[all.length - 1] : null;
}

/**
 * @param {import("discord.js").Client} client
 * @param {object} params
 * @param {import("discord.js").Guild} params.guild
 * @param {string} params.moderatorUserId
 * @param {string} params.messageId
 * @param {"ACCEPTED"|"REJECTED"} params.decision
 * @param {string} params.reason
 */
async function moderateSuggestion(client, { guild, moderatorUserId, messageId, decision, reason }) {
  const reasonTrim = String(reason || "").trim().slice(0, 1000);
  if (reasonTrim.length < 3) {
    return { error: "La **raison** doit faire au moins **3** caractères." };
  }

  const sugg = await client.prisma.suggestion.findFirst({
    where: { guildId: guild.id, messageId: String(messageId) }
  });
  if (!sugg) {
    return {
      error:
        "Aucune suggestion liée à ce **message** (vérifie l’ID ou le lien du message dans le salon suggestions)."
    };
  }
  if (!isSuggestionOpenRow(sugg)) {
    return { error: "Cette suggestion a **déjà été traitée** (acceptée ou refusée)." };
  }

  const counts = await getVoteCounts(client.prisma, sugg.id);
  await client.prisma.suggestion.update({
    where: { id: sugg.id },
    data: {
      status: decision,
      moderatedAt: new Date(),
      moderatedById: moderatorUserId,
      moderationReason: reasonTrim,
      snapshotPour: counts.up,
      snapshotNeutral: counts.neutral,
      snapshotContre: counts.down
    }
  });

  const fresh = await client.prisma.suggestion.findUnique({ where: { id: sugg.id } });
  const ch = await guild.channels.fetch(sugg.channelId).catch(() => null);
  if (!ch?.isTextBased?.()) {
    return { ok: true, warn: "Base mise à jour, mais le salon du message est introuvable." };
  }
  const msg = await ch.messages.fetch(String(messageId)).catch(() => null);
  if (!msg?.editable) {
    return { ok: true, warn: "Base mise à jour, mais le message Discord est introuvable ou non modifiable." };
  }

  const pingRoleId = String(config.suggestions?.pingRoleId || "").trim();
  const footerIconURL = guild.iconURL({ extension: "png", size: 64 }) || null;
  const payload = buildSuggestionMessagePayload(fresh, counts, { pingRoleId, footerIconURL });
  await msg.edit({
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: payload.allowedMentions
  });
  return { ok: true };
}

module.exports = {
  VOTE_PREFIX,
  safeImageUrl,
  sanitizeSnippet,
  isVerifiedMember,
  canViewAndVoteSuggestions,
  isSuggestionsStaff,
  isSuggestionOpenRow,
  getVoteCounts,
  pruneDuplicateSuggestionVotes,
  applyVote,
  buildSuggestionMessagePayload,
  buildSuggestionPostPayload,
  parseSuggestionVoteCustomId,
  channelMatchesStoredSuggestion,
  submitNewSuggestion,
  extractSuggestionMessageId,
  moderateSuggestion
};
