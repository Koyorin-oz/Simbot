const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const realServerIds = require("../data/realServerIds");
const { buildTicketStaffPanel } = require("../utils/ticketPanels");

/** Seul ce rôle (avec le créateur du ticket + le bot) voit les salons ticket (overwrites + ping a la creation). */
const TICKET_ACCESS_ROLE_ID = "736488084929118298";

function resolvedTicketsForGuild(guild) {
  if (guild?.id === realServerIds.guildId) {
    const c = realServerIds.categories || {};
    return {
      categoryId: c.ticketCategoryId || config.tickets.categoryId
    };
  }
  return {
    categoryId: config.tickets.categoryId
  };
}

/** @param {"general" | "welcome"} kind */
/** Salon ou doit se trouver le panel « Ouvrir un ticket » (general). */
function getGeneralTicketPanelChannelId(guild) {
  if (guild?.id === realServerIds.guildId && realServerIds.channels?.ticketPanelChannelId) {
    return String(realServerIds.channels.ticketPanelChannelId).trim();
  }
  return String(config.tickets?.panelChannelId || "").trim();
}

/** Salon unique du panel tickets processus d'accueil. */
function getWelcomeTicketPanelChannelId() {
  return String(config.ticketsWelcome?.panelChannelId || "").trim();
}

function resolveTicketCategoryIdForKind(guild, kind) {
  if (kind === "welcome") {
    const id = String(config.ticketsWelcome?.categoryId || "").trim();
    if (!id) throw new Error("Categorie tickets accueil introuvable (`ticketsWelcome.categoryId`).");
    return id;
  }
  const t = resolvedTicketsForGuild(guild);
  if (!t.categoryId) throw new Error("Categorie tickets generale introuvable.");
  return t.categoryId;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, max) {
  const s = String(str ?? "").trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function isTicketStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (member.roles.cache.has(TICKET_ACCESS_ROLE_ID)) return true;
  return false;
}

/** Fermeture : staff (dont rôle modérateur ticket) ou uniquement le créateur du ticket. */
function canCloseTicket(member, actorUserId, ownerId) {
  if (!member || !actorUserId || !ownerId) return false;
  if (actorUserId === ownerId) return true;
  return isTicketStaff(member);
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {string} ownerId
 * @param {string} topic
 * @param {{ kind?: "general" | "welcome" }} [opts]
 */
async function createTicketChannel(guild, ownerId, topic, opts = {}) {
  const kind = opts.kind === "welcome" ? "welcome" : "general";
  const categoryId = resolveTicketCategoryIdForKind(guild, kind);
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error("Categorie tickets introuvable.");
  }

  const member = await guild.members.fetch(ownerId).catch(() => null);
  const prefix = kind === "welcome" ? "accueil" : "ticket";
  const name = `${prefix}-${member?.user?.username || ownerId}`.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 90) || prefix;

  const botId = guild.client.user.id;
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels
      ]
    },
    {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  overwrites.push({
    id: TICKET_ACCESS_ROLE_ID,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ManageMessages
    ]
  });

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: truncate(topic, 500),
    permissionOverwrites: overwrites,
    reason: `Ticket de ${ownerId}`
  });

  return channel;
}

async function pinStaffPanel(channel) {
  const panel = buildTicketStaffPanel(channel.id);
  const msg = await channel.send(panel);
  await msg.pin("Panneau ticket").catch(() => null);
}

async function setTicketClosed(channel, ownerId, closed) {
  if (closed) {
    await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false, SendMessages: false }).catch(() => null);
  } else {
    await channel.permissionOverwrites
      .edit(ownerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
      })
      .catch(() => null);
  }
  await channel.permissionOverwrites
    .edit(TICKET_ACCESS_ROLE_ID, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    })
    .catch(() => null);
}

async function fetchAllMessages(channel) {
  const all = [];
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function buildTranscript(channel, format) {
  const messages = await fetchAllMessages(channel);
  const title = `Transcript — ${channel.name}`;
  const header = `# ${channel.name}\nSalon: ${channel.id}\nGenere: ${new Date().toISOString()}\n\n`;

  if (format === "html") {
    let body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(channel.name)}</title></head><body><h1>${escapeHtml(
      channel.name
    )}</h1><pre style="white-space:pre-wrap;font-family:monospace">`;
    for (const m of messages) {
      const ts = m.createdAt.toISOString();
      const author = escapeHtml(m.author.tag);
      const content = escapeHtml(m.cleanContent || "(piece jointe / embed)");
      body += `[${ts}] ${author}: ${content}\n`;
    }
    body += "</pre></body></html>";
    return { filename: `transcript-${channel.id}.html`, buffer: Buffer.from(body, "utf8") };
  }

  let txt = header;
  for (const m of messages) {
    txt += `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.cleanContent || "(piece jointe / embed)"}\n`;
  }
  return { filename: `transcript-${channel.id}.txt`, buffer: Buffer.from(txt, "utf8") };
}

module.exports = {
  TICKET_ACCESS_ROLE_ID,
  isTicketStaff,
  canCloseTicket,
  createTicketChannel,
  getGeneralTicketPanelChannelId,
  getWelcomeTicketPanelChannelId,
  resolveTicketCategoryIdForKind,
  pinStaffPanel,
  setTicketClosed,
  buildTranscript,
  fetchAllMessages
};
