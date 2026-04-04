const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");
const realServerIds = require("../data/realServerIds");

const REPERTOIRE_ACCENT = 0xf1c40f;

const V2_BASE = {
  flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
  embeds: []
};

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findRoleAllKeywords(guild, keywords) {
  if (!keywords.length) return null;
  const kws = keywords.map((k) => norm(k));
  return (
    guild.roles.cache.find((r) => {
      if (r.name === "@everyone") return false;
      const n = norm(r.name);
      return kws.every((kw) => n.includes(kw));
    }) || null
  );
}

function findRoleById(guild, id) {
  if (!id) return null;
  return guild.roles.cache.get(String(id)) || null;
}

function findRafikiJunior(guild, grandRafikiId) {
  return (
    guild.roles.cache.find((r) => {
      if (grandRafikiId && r.id === grandRafikiId) return false;
      if (r.name === "@everyone") return false;
      const n = norm(r.name);
      return n.includes("rafiki") && !n.includes("grand");
    }) || null
  );
}

function findLionTeen(guild, kovuId) {
  return (
    guild.roles.cache.find((r) => {
      if (kovuId && r.id === kovuId) return false;
      if (r.name === "@everyone") return false;
      const n = norm(r.name);
      return n.includes("lion") && !n.includes("kovu");
    }) || null
  );
}

function resolveNitroRole(guild) {
  const explicit = findRoleAllKeywords(guild, ["nitro", "boost"]);
  if (explicit) return explicit;
  return (
    guild.roles.cache.find((r) => {
      if (r.name === "@everyone") return false;
      const n = norm(r.name);
      return n.includes("booster") || n.includes("boost");
    }) || null
  );
}

function resolveVipRole(guild, nitroId) {
  return (
    guild.roles.cache.find((r) => {
      if (r.id === nitroId) return false;
      if (r.name === "@everyone") return false;
      const n = norm(r.name);
      const raw = r.name;
      if (n.includes("nitro") && n.includes("boost")) return false;
      return n.includes("vip") || raw.includes("🍀");
    }) || null
  );
}

function resolveAbonneRole(guild) {
  return (
    guild.roles.cache.find((r) => {
      if (r.name === "@everyone") return false;
      const n = norm(r.name);
      return n.includes("abonne");
    }) || null
  );
}

const FALLBACK_EXTRA_HINTS = [
  ["partenaire"],
  ["partner"],
  ["premium"],
  ["donateur"],
  ["soutien"],
  ["mecene"],
  ["mvp"]
];

function resolveExtraRoles(guild, nitroId, vipId, abonneId) {
  const rep = realServerIds.repertoire || {};
  const groups = Array.isArray(rep.extraRoleKeywordGroups) ? rep.extraRoleKeywordGroups : [];
  const excluded = new Set([nitroId, vipId, abonneId].filter(Boolean));

  const tryGroup = (keywords) => {
    if (!keywords || !keywords.length) return null;
    const role = findRoleAllKeywords(guild, keywords);
    if (role && !excluded.has(role.id)) return role;
    return null;
  };

  let a = null;
  let b = null;

  if (groups.length >= 1) {
    a = tryGroup(groups[0]);
  }
  if (groups.length >= 2) {
    b = tryGroup(groups[1]);
    if (b && a && b.id === a.id) b = null;
  }

  if (!a || !b) {
    const found = [];
    const hints = groups.length === 0 ? FALLBACK_EXTRA_HINTS : [];
    for (const kw of hints) {
      const role = tryGroup(kw);
      if (role && !found.some((x) => x.id === role.id)) found.push(role);
      if (found.length >= 2) break;
    }
    if (!a && found[0]) a = found[0];
    if (!b) {
      b = found.find((r) => r.id !== a?.id) || null;
    }
  }

  if (a && b && a.id === b.id) b = null;

  return { extra1: a, extra2: b };
}

function resolveDiscussionChannelId(guild) {
  const rep = realServerIds.repertoire || {};
  const fromConfig = rep.discussionChannelId || null;
  if (fromConfig && guild.channels.cache.has(fromConfig)) return fromConfig;

  const textChannels = guild.channels.cache.filter((c) => c?.isTextBased?.());
  const byName =
    textChannels.find((c) => norm(c.name).includes("discussion")) ||
    textChannels.find((c) => norm(c.name).includes("discussions")) ||
    null;
  return byName?.id || null;
}

function resolveTicketChannelId(guild) {
  const rep = realServerIds.repertoire || {};
  const fromRep = rep.ticketChannelId || null;
  if (fromRep && guild.channels.cache.has(fromRep)) return fromRep;
  const panel = realServerIds.channels?.ticketPanelChannelId;
  if (panel && guild.channels.cache.has(panel)) return panel;
  const textChannels = guild.channels.cache.filter((c) => c?.isTextBased?.());
  const byName =
    textChannels.find((c) => norm(c.name).includes("ticket")) ||
    textChannels.find((c) => norm(c.name).includes("support")) ||
    null;
  return byName?.id || null;
}

function ch(id) {
  return id ? `<#${id}>` : "`#discussion`";
}

function roleMention(role) {
  return role ? `<@&${role.id}>` : "*rôle inconnu*";
}

function block(lines) {
  return lines.map((l) => `> ${l}`).join("\n");
}

function resolveRepertoireContext(guild) {
  const nitro = resolveNitroRole(guild);
  const vip = resolveVipRole(guild, nitro?.id);
  const abonne = resolveAbonneRole(guild);
  const { extra1, extra2 } = resolveExtraRoles(guild, nitro?.id, vip?.id, abonne?.id);
  const discussionId = resolveDiscussionChannelId(guild);
  const ticketId = resolveTicketChannelId(guild);
  return { nitro, vip, extra1, extra2, abonne, discussionId, ticketId };
}

function resolveDirectoryRoles(guild) {
  const dirCfg = realServerIds.repertoire?.directory || {};
  const nitro = resolveNitroRole(guild);
  const vip = resolveVipRole(guild, nitro?.id);
  const abonne = resolveAbonneRole(guild);

  const grandRafiki = findRoleAllKeywords(guild, ["grand", "rafiki"]);
  const rafiki = findRafikiJunior(guild, grandRafiki?.id);

  const recruitKw = dirCfg.recruitKeywords?.length ? dirCfg.recruitKeywords : ["recrutement"];
  let recruit =
    findRoleById(guild, dirCfg.recruitRoleId) || findRoleAllKeywords(guild, recruitKw) || null;

  const kovu = findRoleAllKeywords(guild, ["kovu"]);
  const lionTeen = findLionTeen(guild, kovu?.id);

  const hugo =
    findRoleAllKeywords(guild, ["hugoboss"]) ||
    findRoleAllKeywords(guild, ["hugo", "boss"]) ||
    null;

  return {
    mufasa: findRoleAllKeywords(guild, ["mufasa"]),
    hugo,
    crs: findRoleAllKeywords(guild, ["crs"]),
    scarAdmin: findRoleAllKeywords(guild, ["scar", "admin"]),
    grandRafiki,
    rafiki,
    zazu: findRoleAllKeywords(guild, ["zazu"]),
    recruit,
    modTwitch: findRoleAllKeywords(guild, ["twitch", "moderateur"]) || findRoleAllKeywords(guild, ["moderateur", "twitch"]),
    monteur: findRoleAllKeywords(guild, ["monteur"]),
    styliste: findRoleAllKeywords(guild, ["styliste"]),
    nitro,
    vip,
    amis: findRoleAllKeywords(guild, ["amis"]),
    vainqueurEvent: findRoleAllKeywords(guild, ["vainqueur", "event"]) || findRoleAllKeywords(guild, ["vainqueur"]),
    kovu,
    lionTeen,
    abonne
  };
}

function buildRoleDirectoryBody(dr) {
  const L = (role, text) => `${roleMention(role)} : ${text}`;

  const g1 = [
    L(dr.mufasa, "Le boss"),
    L(dr.hugo, "Communément appelé le H"),
    L(dr.crs, "Communément appelé cmanif"),
    L(dr.scarAdmin, "Les administrateurs du serveur"),
    L(dr.grandRafiki, "2ème palier de la modération"),
    L(dr.rafiki, "1er palier de la modération"),
    L(dr.zazu, "Organisateurs d'événements sur le serveur")
  ].join("\n");

  const g2 = [
    L(dr.recruit, "Membre de la modération sur YouTube"),
    L(dr.modTwitch, "Membre de la modération sur Twitch")
  ].join("\n");

  const g3 = [
    L(dr.monteur, "Monteur pour Carmine (chaîne secondaire)"),
    L(dr.styliste, "Miniature / Dessin pour Carmine"),
    L(dr.nitro, "Ceux qui ont boost le serveur Discord"),
    L(dr.vip, "Les beaux gosses du serveur"),
    L(dr.amis, "Les amis du staff Discord")
  ].join("\n");

  const g4 = [L(dr.vainqueurEvent, "Vainqueur d'un giveaway")].join("\n");

  const g5 = [L(dr.kovu, "Ceux qui ont plus de 18 ans"), L(dr.lionTeen, "Ceux qui ont entre 13 et 17 ans")].join("\n");

  const g6 = [L(dr.abonne, "Membre du serveur de la Carminauté")].join("\n");

  return [g1, "", g2, "", g3, "", g4, "", g5, "", g6].join("\n");
}

function collectDirectoryRoleIds(dr) {
  return [
    dr.mufasa,
    dr.hugo,
    dr.crs,
    dr.scarAdmin,
    dr.grandRafiki,
    dr.rafiki,
    dr.zazu,
    dr.recruit,
    dr.modTwitch,
    dr.monteur,
    dr.styliste,
    dr.nitro,
    dr.vip,
    dr.amis,
    dr.vainqueurEvent,
    dr.kovu,
    dr.lionTeen,
    dr.abonne
  ]
    .filter(Boolean)
    .map((r) => r.id);
}

function buildRoleDirectoryContainer(guild) {
  const dr = resolveDirectoryRoles(guild);
  const body = buildRoleDirectoryBody(dr);
  const container = new ContainerBuilder()
    .setAccentColor(REPERTOIRE_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 📋 Répertoire de la Carminauté")
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

  return { container, roleIds: collectDirectoryRoleIds(dr) };
}

function buildRepertoirePanelContent(ctx) {
  const { nitro, vip, extra1, extra2, abonne, discussionId, ticketId } = ctx;
  const d = ch(discussionId);
  const t = ch(ticketId);

  const s1 = [
    `${roleMention(nitro)}`,
    "",
    block([
      "Le rôle VIP, en prime (à partir de deux boosts)",
      `Publier des GIFs dans ${d}`,
      `Envoyer des images et vidéos dans ${d}`,
      "Utiliser des emojis, stickers et soundboards provenant d'autres serveurs",
      "Accès à un salon textuel et un salon vocal exclusifs",
      "Soutenir directement le serveur ❤️"
    ])
  ].join("\n");

  const s2 = [
    `${roleMention(vip)}`,
    "",
    block([
      `Publier des GIFs dans ${d}`,
      `Envoyer des images et vidéos dans ${d}`,
      "Utiliser des emojis, stickers et soundboards provenant d'autres serveurs",
      "Accès à un salon textuel et un salon vocal exclusifs",
      `Pour réclamer le rôle, faites un ${t} avec preuve à l'appui (à partir de deux boosts)`
    ])
  ].join("\n");

  const extraParts = [
    extra1 ? roleMention(extra1) : "*rôle inconnu*",
    extra2 ? roleMention(extra2) : "*rôle inconnu*"
  ];
  const s3 = [
    extraParts.join(" "),
    "",
    block([
      `Publier des GIFs dans ${d}`,
      `Envoyer des images et vidéos dans ${d}`,
      "Utiliser des emojis, stickers et soundboards provenant d'autres serveurs",
      "Accès à un salon textuel et un salon vocal exclusifs"
    ])
  ].join("\n");

  const s4 = [
    `${roleMention(abonne)}`,
    "",
    block([
      `Envoyer des images et des vidéos dans l'ensemble du serveur, à l'exception de ${d}`,
      "Avoir la capacité d'allumer sa caméra, faire un stream et utiliser les soundboards",
      "Déblocable dès le niveau 5"
    ])
  ].join("\n");

  return { s1, s2, s3, s4 };
}

function buildPrivilegesContainer(guild) {
  const ctx = resolveRepertoireContext(guild);
  const { s1, s2, s3, s4 } = buildRepertoirePanelContent(ctx);

  const container = new ContainerBuilder()
    .setAccentColor(REPERTOIRE_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🏅 Les privilèges des rôles Discord")
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(s1))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(s2))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(s3))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(s4));

  const roleIds = [ctx.nitro, ctx.vip, ctx.extra1, ctx.extra2, ctx.abonne].filter(Boolean).map((r) => r.id);

  return { container, roleIds };
}

/** Deux panneaux V2 dans un seul message : répertoire des rôles + privilèges. */
function buildRepertoirePanelsMessage(guild) {
  const { container: cDir, roleIds: idsDir } = buildRoleDirectoryContainer(guild);
  const { container: cPriv, roleIds: idsPriv } = buildPrivilegesContainer(guild);
  const roleIds = [...new Set([...idsDir, ...idsPriv])];
  return {
    components: [cDir, cPriv],
    ...V2_BASE,
    allowedMentions: { parse: [], roles: roleIds }
  };
}

/** @deprecated Utiliser buildRepertoirePanelsMessage — conservé pour compat. */
function buildRepertoirePanel(guild) {
  return buildRepertoirePanelsMessage(guild);
}

module.exports = {
  buildRepertoirePanel,
  buildRepertoirePanelsMessage,
  resolveRepertoireContext,
  REPERTOIRE_ACCENT
};
