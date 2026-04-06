/**
 * Liens : invitations Discord toujours bloquées (sauf rôle bypass).
 * Autres URLs : si l’auto-mod est activée, seuls les motifs listés dans la catégorie « LIEN autorise » passent.
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
 * @param {string} bypassRoleId
 */
function hasLinkBypassRole(member, bypassRoleId) {
  if (!member || !bypassRoleId) return false;
  return Boolean(member.roles?.cache?.has(bypassRoleId));
}

/**
 * @param {string} normalizedSnippet URL / morceau déjà normalisé (accents retirés, minuscules)
 * @param {string[]} allowlistTerms
 */
function nonDiscordLinkMatchesAllowlist(normalizedSnippet, allowlistTerms) {
  for (const term of allowlistTerms) {
    const nt = normalizeForMatch(term);
    if (nt && normalizedSnippet.includes(nt)) return true;
  }
  return false;
}

/**
 * @param {import("discord.js").Message} message
 * @param {import("discord.js").GuildMember | null} member
 * @param {{ enabled: boolean, linkAllowlistTerms: string[] }} payload
 * @param {string} bypassRoleId
 */
function shouldBlockLinksForMessage(message, member, payload, bypassRoleId) {
  if (hasLinkBypassRole(member, bypassRoleId)) return false;
  const content = message.content || "";
  if (!messageContainsLink(content)) return false;

  const snippets = extractLinkSnippets(content);
  for (const raw of snippets) {
    const norm = normalizeForMatch(raw);

    if (snippetIsDiscordInvite(raw) || snippetIsDiscordInvite(norm)) {
      return true;
    }

    if (payload.enabled) {
      if (!nonDiscordLinkMatchesAllowlist(norm, payload.linkAllowlistTerms || [])) {
        return true;
      }
    }
  }

  return false;
}

module.exports = {
  extractLinkSnippets,
  messageContainsLink,
  snippetIsDiscordInvite,
  hasLinkBypassRole,
  shouldBlockLinksForMessage
};
