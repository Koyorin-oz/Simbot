/**
 * Liens : invitations Discord bloquees (sauf bypass) ; beaucoup de domaines courants autorises partout.
 * - Tenor, Giphy, Imgur, GIF en .gif, cadeaux Discord, YT / TikTok / IG : partout.
 * - Liste blanche optionnelle (categorie « LIEN autorise »).
 * - Salons `linkPolicy.linkUnrestrictedChannelIds` : aucune regle de lien.
 */

const { normalizeForMatch } = require("./autoModService");

const LINK_DETECT_RE =
  /https?:\/\/[^\s<>"']+|discord\.gg\/[a-zA-Z0-9-]+|discord(?:app)?\.com\/invite\/[a-zA-Z0-9-]+|\bwww\.[^\s]+\.[a-z]{2,}[^\s]*/gi;

/**
 * @param {string} content
 * @returns {string[]}
 */
function extractLinkSnippets(content) {
  const c = String(content || "");
  const re = new RegExp(LINK_DETECT_RE.source, "gi");
  const out = [];
  let m;
  while ((m = re.exec(c)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function messageContainsLink(content) {
  return extractLinkSnippets(content).length > 0;
}

/**
 * @param {string} raw
 */
function snippetIsDiscordInvite(raw) {
  const s = String(raw || "").toLowerCase();
  return (
    s.includes("discord.gg/") ||
    s.includes("discord.com/invite/") ||
    s.includes("discordapp.com/invite/")
  );
}

/**
 * @param {import("discord.js").GuildMember | null} member
 * @param {string[]} bypassRoleIds
 */
function hasAnyLinkBypassRole(member, bypassRoleIds) {
  if (!member || !bypassRoleIds?.length) return false;
  for (const id of bypassRoleIds) {
    if (id && member.roles?.cache?.has(id)) return true;
  }
  return false;
}

function isTenor(norm) {
  return norm.includes("tenor.com");
}

function isDiscordGift(norm) {
  return (
    norm.includes("discord.gift") ||
    norm.includes("discord.com/gifting") ||
    norm.includes("discordapp.com/gifting")
  );
}

function isYoutube(norm) {
  return norm.includes("youtube.com") || norm.includes("youtu.be");
}

function isTiktok(norm) {
  return norm.includes("tiktok.com");
}

function isInstagram(norm) {
  return norm.includes("instagram.com") || norm.includes("instagr.am");
}

function isGiphy(norm) {
  return norm.includes("giphy.com");
}

function isImgur(norm) {
  return norm.includes("imgur.com") || norm.includes("i.imgur.com");
}

/**
 * URL dont le chemin se termine par .gif (hors query/fragment), ponctuation finale toleree.
 * @param {string} raw
 */
function snippetPathEndsWithGif(raw) {
  const base = String(raw || "")
    .trim()
    .split("?")[0]
    .split("#")[0];
  const cleaned = base.replace(/[.,;:!?)\]]+$/g, "");
  return /\.gif$/i.test(cleaned);
}

function isAllowedGifLinkEverywhere(raw, norm) {
  return isGiphy(norm) || snippetPathEndsWithGif(raw);
}

/**
 * @param {string} normalizedSnippet
 * @param {string[]} allowlistTerms
 */
function matchesExtraGlobalAllowlist(normalizedSnippet, allowlistTerms) {
  for (const term of allowlistTerms || []) {
    const nt = normalizeForMatch(term);
    if (nt && normalizedSnippet.includes(nt)) return true;
  }
  return false;
}

/**
 * Liens autorises partout (hors invites Discord, gerees a part).
 */
function isAllowedLinkEverywhere(norm, linkAllowlistTerms) {
  if (isTenor(norm) || isDiscordGift(norm)) return true;
  if (isYoutube(norm) || isTiktok(norm) || isInstagram(norm)) return true;
  if (isGiphy(norm) || isImgur(norm)) return true;
  return matchesExtraGlobalAllowlist(norm, linkAllowlistTerms);
}

/**
 * @param {import("discord.js").Channel} channel
 * @param {string[]} channelIds
 */
function isInLinkUnrestrictedChannel(channel, channelIds) {
  if (!channel || !channelIds?.length) return false;
  for (const id of channelIds) {
    const cid = String(id || "").trim();
    if (!cid) continue;
    if (channel.id === cid) return true;
    if (typeof channel.isThread === "function" && channel.isThread() && channel.parentId === cid) {
      return true;
    }
  }
  return false;
}

/**
 * @param {import("discord.js").Message} message
 * @param {import("discord.js").GuildMember | null} member
 * @param {{ linkAllowlistTerms: string[] }} payload
 * @param {{ bypassRoleIds: string[], linkUnrestrictedChannelIds?: string[] }} linkPolicy
 */
function shouldBlockLinksForMessage(message, member, payload, linkPolicy) {
  if (isInLinkUnrestrictedChannel(message.channel, linkPolicy?.linkUnrestrictedChannelIds)) {
    return false;
  }

  const bypassRoleIds = linkPolicy?.bypassRoleIds || [];
  if (hasAnyLinkBypassRole(member, bypassRoleIds)) return false;

  const content = message.content || "";
  if (!messageContainsLink(content)) return false;

  const snippets = extractLinkSnippets(content);
  const extras = payload?.linkAllowlistTerms || [];

  for (const raw of snippets) {
    const norm = normalizeForMatch(raw);

    if (snippetIsDiscordInvite(raw)) {
      return true;
    }

    if (isAllowedLinkEverywhere(norm, extras)) {
      continue;
    }

    if (isAllowedGifLinkEverywhere(raw, norm)) {
      continue;
    }

    return true;
  }

  return false;
}

module.exports = {
  extractLinkSnippets,
  messageContainsLink,
  snippetIsDiscordInvite,
  hasAnyLinkBypassRole,
  shouldBlockLinksForMessage
};
