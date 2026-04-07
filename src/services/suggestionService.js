const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SeparatorSpacingSize,
  PermissionFlagsBits
} = require("discord.js");
const { MediaGalleryBuilder, MediaGalleryItemBuilder } = require("@discordjs/builders");
const config = require("../config");
const { ACCENT_COLOR } = require("../utils/componentsV2Panels");
const { ensureSuggestionsChannel } = require("./channelBootstrapService");

const VOTE_PREFIX = "sg_vote";

/** Format boutons : sg_vote:<id numerique>:up|down */
function parseSuggestionVoteCustomId(customId) {
  if (!customId || !String(customId).startsWith(`${VOTE_PREFIX}:`)) return null;
  const parts = String(customId).split(":");
  if (parts.length !== 3) return null;
  const suggestionId = Number(parts[1]);
  const dir = parts[2];
  if (!Number.isInteger(suggestionId) || (dir !== "up" && dir !== "down")) return null;
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
  for (const r of rows) {
    if (r.value === 1) up += 1;
    else if (r.value === -1) down += 1;
  }
  return { up, down };
}

/**
 * Un membre = au plus un vote par suggestion. Clic sur l’autre bouton = changement d’avis.
 * Re-clic sur le même bouton = rien (pas de double vote, pas de retrait du vote).
 */
async function applyVote(prisma, suggestionId, userId, direction) {
  const val = direction === "up" ? 1 : -1;
  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_userId: { suggestionId, userId } }
  });
  if (!existing) {
    await prisma.suggestionVote.create({
      data: { suggestionId, userId, value: val }
    });
  } else if (existing.value !== val) {
    await prisma.suggestionVote.update({
      where: { id: existing.id },
      data: { value: val }
    });
  }
}

/**
 * @param {{ pingRoleId?: string }} [opts] — avec Components V2, pas de `content` : mention du role en TextDisplay.
 */
function buildSuggestionMessagePayload(suggestion, up, down, opts = {}) {
  const { id, authorId, title, body, imageUrl } = suggestion;
  const titleSafe = sanitizeSnippet(title, 200);
  const bodySafe = sanitizeSnippet(body, 3800);
  const pingRoleId = String(opts.pingRoleId || "").trim();

  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  if (pingRoleId) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`<@&${pingRoleId}>\n**Nouvelle suggestion**`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## :bulb: ${titleSafe}\n\n${bodySafe}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
    );

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setDescription(sanitizeSnippet(titleSafe, 80) || "Illustration")
          .setURL(imageUrl)
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Auteur** : <@${authorId}>`,
          "",
          "_Vote avec les boutons — les réactions emoji sont désactivées dans ce salon._"
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${VOTE_PREFIX}:${id}:up`)
          .setLabel(`Pour · ${up}`)
          .setEmoji("👍")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${VOTE_PREFIX}:${id}:down`)
          .setLabel(`Contre · ${down}`)
          .setEmoji("👎")
          .setStyle(ButtonStyle.Secondary)
      )
    );

  const allowedMentions = { parse: [], users: [authorId] };
  if (pingRoleId) allowedMentions.roles = [pingRoleId];

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: [],
    allowedMentions
  };
}

/** Alias : publication avec ping (meme structure que les mises a jour de votes si le meme pingRoleId est passe). */
function buildSuggestionPostPayload(suggestion, up, down, opts = {}) {
  return buildSuggestionMessagePayload(suggestion, up, down, {
    pingRoleId: opts.pingRoleId
  });
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
  const payload = buildSuggestionPostPayload(row, 0, 0, { pingRoleId });

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

module.exports = {
  VOTE_PREFIX,
  safeImageUrl,
  sanitizeSnippet,
  isVerifiedMember,
  canViewAndVoteSuggestions,
  isSuggestionsStaff,
  getVoteCounts,
  applyVote,
  buildSuggestionMessagePayload,
  buildSuggestionPostPayload,
  parseSuggestionVoteCustomId,
  channelMatchesStoredSuggestion,
  submitNewSuggestion
};
