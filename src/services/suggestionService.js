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

const MODAL_CUSTOM_ID = "suggestion_submit_modal";
const VOTE_PREFIX = "sg_vote";

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

async function applyVote(prisma, suggestionId, userId, direction) {
  const val = direction === "up" ? 1 : -1;
  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_userId: { suggestionId, userId } }
  });
  if (!existing) {
    await prisma.suggestionVote.create({
      data: { suggestionId, userId, value: val }
    });
  } else if (existing.value === val) {
    await prisma.suggestionVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.suggestionVote.update({
      where: { id: existing.id },
      data: { value: val }
    });
  }
}

function buildSuggestionMessagePayload(suggestion, up, down) {
  const { id, authorId, title, body, imageUrl } = suggestion;
  const titleSafe = sanitizeSnippet(title, 200);
  const bodySafe = sanitizeSnippet(body, 3800);

  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

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

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: [],
    allowedMentions: { parse: [], users: [authorId] }
  };
}

module.exports = {
  MODAL_CUSTOM_ID,
  VOTE_PREFIX,
  safeImageUrl,
  sanitizeSnippet,
  isVerifiedMember,
  canViewAndVoteSuggestions,
  isSuggestionsStaff,
  getVoteCounts,
  applyVote,
  buildSuggestionMessagePayload
};
