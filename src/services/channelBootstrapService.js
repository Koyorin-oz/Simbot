const fs = require("fs");
const path = require("path");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const realServerIds = require("../data/realServerIds");
const { buildSalonVerificationMessage, syncWelcomeVerifyCategoryAccess } = require("./welcomeVerifyService");
const { buildTicketPanelMessage } = require("../utils/ticketPanels");
const {
  buildBootstrapBienvenueV2,
  buildBootstrapReglementV2,
  buildBootstrapLogsV2,
  buildBootstrapLogsServerV2,
  buildBootstrapLogsMessageV2,
  buildBootstrapCommandesV2,
  buildBootstrapPanelVocV2,
  buildBootstrapSuggestionsIntroV2
} = require("../utils/bootstrapSalonPanelsV2");

const SETUP_PATH = path.join(__dirname, "..", "data", "channelSetup.json");

/**
 * Style comme ton screen : emoji | nom (Discord force surtout le texte en minuscules).
 * Pas de live / chaine / starboard / bump / suggestions / cat Informations du screen.
 */
const CH = {
  bienvenue: "🛫 | bienvenue",
  reglement: "☑️ 📃 | règlement",
  verification: "✅ | vérification",
  botCat: "🤖 | bot",
  ticket: "🎟️ | ticket",
  commandes: "📡 | commandes",
  logsMod: "🔒 | logs-mod",
  logsServeur: "🔒 | logs-serveur",
  logsMsg: "🔒 | logs-msg",
  ticketsCategory: "🎫 | tickets",
  vocCat: "🎤 | voc — panel",
  lobby: "🎙️ Créer votre salon",
  panelVoc: "🎤 | panel-voc",
  suggestions: "💡 | suggestions",
  catNouveaux: "🔐 | nouveaux",
  catPrincipal: "✨ | communaute"
};

const MODULE_KEYS = [
  "bienvenue",
  "reglement",
  "verification",
  "logs_msg",
  "logs_serveur",
  "tickets_panel",
  "salon_commandes",
  "categorie_tickets",
  "panel_voc",
  "suggestions",
  "categories_accueil"
];

function readAllSetup() {
  try {
    if (!fs.existsSync(SETUP_PATH)) return {};
    return JSON.parse(fs.readFileSync(SETUP_PATH, "utf8"));
  } catch {
    return {};
  }
}

function readGuildSetup(guildId) {
  return readAllSetup()[guildId] || null;
}

function writeGuildSetup(guildId, data) {
  const all = readAllSetup();
  all[guildId] = data;
  fs.mkdirSync(path.dirname(SETUP_PATH), { recursive: true });
  fs.writeFileSync(SETUP_PATH, JSON.stringify(all, null, 2), "utf8");
}

function applyRealServerIdsToGuildSetup(guildId) {
  const setup = { ...(readGuildSetup(guildId) || {}) };
  const channels = realServerIds?.channels || {};
  const categories = realServerIds?.categories || {};
  const roles = realServerIds?.roles || {};

  if (channels.modLogChannelId) setup.modLogChannelId = channels.modLogChannelId;
  if (channels.messageLogChannelId) setup.messageLogChannelId = channels.messageLogChannelId;
  if (channels.serverLogChannelId) setup.serverLogChannelId = channels.serverLogChannelId;
  if (channels.commandsChannelId) setup.commandsChannelId = channels.commandsChannelId;
  if (channels.suggestionsChannelId) setup.suggestionsChannelId = channels.suggestionsChannelId;
  if (channels.reglementChannelId) setup.reglementChannelId = channels.reglementChannelId;
  if (channels.repertoireChannelId) setup.repertoireChannelId = channels.repertoireChannelId;
  if (channels.verificationChannelId) setup.rulesChannelId = channels.verificationChannelId;
  if (channels.welcomeChannelId) setup.welcomeChannelId = channels.welcomeChannelId;
  if (channels.ticketPanelChannelId) setup.ticketPanelChannelId = channels.ticketPanelChannelId;

  if (categories.ticketCategoryId) setup.ticketCategoryId = categories.ticketCategoryId;
  if (categories.voiceCategoryId) setup.voiceCategoryId = categories.voiceCategoryId;
  if (categories.verifyTestCategoryId) setup.verifyTestCategoryId = categories.verifyTestCategoryId;
  if (categories.verifyMainCategoryId) setup.verifyMainCategoryId = categories.verifyMainCategoryId;

  writeGuildSetup(guildId, setup);
  applySetupToRuntimeConfig(setup);

  if (roles.unverifiedId) config.welcomeVerify.roleUnverifiedId = roles.unverifiedId;
  if (roles.verifiedId) config.welcomeVerify.roleVerifiedId = roles.verifiedId;
  if (roles.suggestionsStaffRoleId) config.suggestions.staffRoleId = roles.suggestionsStaffRoleId;

  return setup;
}

function clearGuildSetup(guildId) {
  const all = readAllSetup();
  delete all[guildId];
  fs.mkdirSync(path.dirname(SETUP_PATH), { recursive: true });
  fs.writeFileSync(SETUP_PATH, JSON.stringify(all, null, 2), "utf8");
}

function overwritesReadOnlyEveryone(guild, botUserId) {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions
      ],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads
      ]
    },
    {
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];
}

/** Salon commandes : membres verifies uniquement (slash + messages). Si pas de role verif en config → ouvert pour les tests. */
function overwritesCommandesChannel(guild, botUserId, verifiedRoleId, warnings) {
  const botAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.UseApplicationCommands
  ];
  const memberAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.UseApplicationCommands
  ];

  if (verifiedRoleId) {
    return [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botUserId, allow: botAllow },
      { id: verifiedRoleId, allow: memberAllow }
    ];
  }

  warnings.push(
    "**Salon commandes** : `roleVerifiedId` est vide dans `config.js` — salon ouvert a **tout le monde** pour les tests. " +
      "En prod, renseigne l'ID du role **Membre verif** (tu me le demanderas quand tu voudras qu'on le verrouille)."
  );
  return [
    {
      id: guild.roles.everyone.id,
      allow: memberAllow
    },
    { id: botUserId, allow: botAllow }
  ];
}

function overwritesPanelVoc(guild, botUserId) {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    {
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];
}

function overwritesVoiceLobby(guild, botUserId) {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.UseVAD
      ]
    },
    {
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageChannels
      ]
    }
  ];
}

function normalizeChannelNameForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function isLikelyLobbyVoiceChannel(channel) {
  if (!channel?.isVoiceBased?.()) return false;
  const n = normalizeChannelNameForMatch(channel.name);
  return n.includes("creer votre salon") || n.includes("creer ton salon");
}

/**
 * Place le vocal d'accueil « Créer votre salon » dans la categorie vocaux (ID fixe realServerIds / config),
 * met a jour channelSetup.json et la config runtime. Ne choisit jamais un salon prive au hasard (heuristique sur le nom).
 * @returns {Promise<{ ok: true, lobby: import("discord.js").VoiceChannel, category: import("discord.js").CategoryChannel, created: boolean } | { ok: false, error: string }>}
 */
async function ensurePrivateVoiceLobbyInCategory(guild) {
  const botId = guild.client.user.id;
  const me = await guild.members.fetchMe();
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, error: "Le bot doit avoir la permission **Gerer les salons**." };
  }

  const categoryId = String(
    realServerIds?.categories?.voiceCategoryId || config.privateRoom?.voiceCategoryId || ""
  ).trim();
  if (!categoryId) {
    return { ok: false, error: "Aucun voiceCategoryId configure (realServerIds / config)." };
  }

  await guild.fetch().catch(() => null);

  const parent = await guild.channels.fetch(categoryId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    return {
      ok: false,
      error: `Categorie vocale introuvable sur ce serveur : \`${categoryId}\`. Verifie l'ID ou les droits du bot.`
    };
  }

  const setup = readGuildSetup(guild.id) || {};
  const wantedName = CH.lobby;
  const wantedNorm = normalizeChannelNameForMatch(wantedName);

  /** @type {import("discord.js").VoiceBasedChannel | null} */
  let lobby = null;

  const voicesInCat = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildVoice && c.parentId === parent.id
  );

  for (const c of voicesInCat.values()) {
    if (normalizeChannelNameForMatch(c.name) === wantedNorm) {
      lobby = c;
      break;
    }
  }
  if (!lobby) {
    for (const c of voicesInCat.values()) {
      if (isLikelyLobbyVoiceChannel(c)) {
        lobby = c;
        break;
      }
    }
  }

  if (!lobby && setup.lobbyChannelId) {
    const ch = await guild.channels.fetch(setup.lobbyChannelId).catch(() => null);
    if (ch?.isVoiceBased?.() && isLikelyLobbyVoiceChannel(ch)) {
      lobby = ch;
    }
  }

  let created = false;
  if (!lobby) {
    lobby = await guild.channels.create({
      name: wantedName,
      type: ChannelType.GuildVoice,
      parent: parent.id,
      permissionOverwrites: overwritesVoiceLobby(guild, botId),
      reason: "CarminaBot — /voc-panel : vocal d'accueil"
    });
    created = true;
  } else {
    if (lobby.parentId !== parent.id) {
      await lobby.setParent(parent.id, { lockPermissions: false }).catch(() => null);
    }
    if (lobby.name !== wantedName) {
      await lobby.setName(wantedName).catch(() => null);
    }
    await lobby.permissionOverwrites.set(overwritesVoiceLobby(guild, botId)).catch(() => null);
  }

  setup.voiceCategoryId = parent.id;
  setup.lobbyChannelId = lobby.id;
  writeGuildSetup(guild.id, setup);
  applySetupToRuntimeConfig(setup);

  return { ok: true, lobby, category: parent, created };
}

/** Membres vérifiés : lire + voter ; pas d’envoi ni réactions. Staff : écriture (rôle env). */
function overwritesSuggestionsChannel(guild, botUserId, verifiedRoleId, staffRoleId, warnings) {
  const botAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.UseApplicationCommands
  ];
  const readVote = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.UseApplicationCommands
  ];
  const denyMember = [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.SendMessagesInThreads
  ];
  const staffAllow = [
    ...readVote,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.SendMessagesInThreads
  ];

  if (verifiedRoleId) {
    const rows = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botUserId, allow: botAllow },
      { id: verifiedRoleId, allow: readVote, deny: denyMember }
    ];
    if (staffRoleId) {
      rows.push({
        id: staffRoleId,
        allow: staffAllow,
        deny: [PermissionFlagsBits.AddReactions]
      });
    } else {
      warnings.push(
        "**Suggestions** : définis **`SUGGESTIONS_STAFF_ROLE_ID`** dans `.env` pour un rôle qui peut **écrire** dans le salon (les admins Discord bypassent toujours)."
      );
    }
    return rows;
  }

  warnings.push(
    "**Suggestions** : `roleVerifiedId` est vide — salon **visible par @everyone** (sans envoi ni réactions pour les membres)."
  );
  const rows = [
    { id: guild.roles.everyone.id, allow: readVote, deny: denyMember },
    { id: botUserId, allow: botAllow }
  ];
  if (staffRoleId) {
    rows.push({
      id: staffRoleId,
      allow: staffAllow,
      deny: [PermissionFlagsBits.AddReactions]
    });
  }
  return rows;
}

/**
 * Crée ou récupère le salon suggestions (mutate setup + pas d’écriture disque ici).
 * @returns {Promise<{ channel: import("discord.js").GuildTextBasedChannel, created: boolean }>}
 */
async function upsertSuggestionsChannel(guild, setup, botId, reason, warnings) {
  const key = "suggestionsChannelId";
  if (setup[key]) {
    const ex = await guild.channels.fetch(setup[key]).catch(() => null);
    if (ex?.isTextBased?.()) {
      return { channel: ex, created: false };
    }
    delete setup[key];
  }

  const catBot = await ensureBotCategory(guild, setup, botId, reason);
  const verifiedRoleId = config.welcomeVerify?.roleVerifiedId || "";
  const staffRoleId = config.suggestions?.staffRoleId || "";
  const ow = overwritesSuggestionsChannel(guild, botId, verifiedRoleId, staffRoleId, warnings);

  const ch = await guild.channels.create({
    name: CH.suggestions,
    type: ChannelType.GuildText,
    parent: catBot.id,
    topic: "Suggestions communautaires — /suggestion · votes par boutons (Components V2).",
    permissionOverwrites: ow,
    reason
  });
  setup[key] = ch.id;
  return { channel: ch, created: true };
}

/**
 * Garantit un salon suggestions pour ce serveur (création si besoin, enregistrement channelSetup.json).
 * @returns {Promise<{ ok: true, channel: import("discord.js").GuildTextBasedChannel, created: boolean, warnings: string[] } | { ok: false, error: string }>}
 */
async function ensureSuggestionsChannel(guild) {
  const me = await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return {
      ok: false,
      error:
        "Le bot doit avoir **Gérer les salons** pour créer le salon suggestions. Sinon configure `suggestions.channelId` ou lance `/setup-salons` (option suggestions)."
    };
  }

  const setup = { ...(readGuildSetup(guild.id) || {}) };
  const warnings = [];
  const reason = `CarminaBot — salon suggestions`;

  let channel;
  let created;
  try {
    ({ channel, created } = await upsertSuggestionsChannel(guild, setup, me.id, reason, warnings));
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }

  writeGuildSetup(guild.id, setup);
  applySetupToRuntimeConfig(setup);

  if (created) {
    await channel.send(buildBootstrapSuggestionsIntroV2()).catch(() => null);
  }

  return { ok: true, channel, created, warnings };
}

function applySetupToRuntimeConfig(setup) {
  if (setup.modLogChannelId) config.modLog.channelId = setup.modLogChannelId;
  if (setup.messageLogChannelId) config.modLog.messageLogChannelId = setup.messageLogChannelId;
  if (setup.serverLogChannelId) config.modLog.serverLogChannelId = setup.serverLogChannelId;
  if (setup.rulesChannelId) config.welcomeVerify.rulesChannelId = setup.rulesChannelId;
  if (setup.reglementChannelId) config.welcomeVerify.reglementChannelId = setup.reglementChannelId;
  if (setup.repertoireChannelId) config.welcomeVerify.repertoireChannelId = setup.repertoireChannelId;
  if (setup.informationChannelId) config.welcomeVerify.informationChannelId = setup.informationChannelId;
  if (setup.verifyTestCategoryId) config.welcomeVerify.testCategoryId = setup.verifyTestCategoryId;
  if (setup.verifyMainCategoryId) config.welcomeVerify.mainCategoryId = setup.verifyMainCategoryId;
  if (setup.informationSharedCategoryId) {
    config.welcomeVerify.informationSharedCategoryId = setup.informationSharedCategoryId;
  }
  if (setup.ticketCategoryId) config.tickets.categoryId = setup.ticketCategoryId;
  if (setup.ticketPanelChannelId) config.tickets.panelChannelId = setup.ticketPanelChannelId;
  if (setup.lobbyChannelId) {
    config.privateRoom.lobbyChannelId = setup.lobbyChannelId;
    if (!Array.isArray(config.privateRoom.lobbyChannelIds)) config.privateRoom.lobbyChannelIds = [];
    const lid = String(setup.lobbyChannelId);
    if (!config.privateRoom.lobbyChannelIds.includes(lid)) {
      config.privateRoom.lobbyChannelIds.unshift(lid);
    }
  }
  if (setup.voiceCategoryId) config.privateRoom.voiceCategoryId = setup.voiceCategoryId;
  if (setup.panelTextChannelId !== undefined && setup.panelTextChannelId !== null) {
    config.privateRoom.panelTextChannelId = setup.panelTextChannelId || "";
  }
  if (setup.welcomeChannelId) config.welcome.channelId = setup.welcomeChannelId;
  if (setup.commandsChannelId) config.welcomeVerify.commandsChannelId = setup.commandsChannelId;
  if (setup.suggestionsChannelId) config.suggestions.channelId = setup.suggestionsChannelId;
}

/**
 * Meme fallbacks que dans `config.js` lorsque `channelSetup.json` n’a pas d’IDs pour la guilde.
 * Appele apres `clearGuildSetup` pour eviter que le bot pointe vers des salons supprimes.
 */
function resetRuntimeChannelConfigNoSetup() {
  config.welcome.channelId = "1487455251152769226";
  config.modLog.channelId = "735986472141848678";
  config.modLog.messageLogChannelId = "";
  config.modLog.serverLogChannelId = "";
  config.welcomeVerify.reglementChannelId = "1428410217170866177";
  config.welcomeVerify.rulesChannelId = "1428411187300667493";
  config.welcomeVerify.repertoireChannelId = "1428411223531196446";
  config.welcomeVerify.informationChannelId = "";
  config.welcomeVerify.testCategoryId = "";
  config.welcomeVerify.mainCategoryId = "";
  config.welcomeVerify.informationSharedCategoryId = "";
  config.welcomeVerify.commandsChannelId = "735810600348680212";
  config.tickets.categoryId = "1488047230039625829";
  config.tickets.panelChannelId = "740157072158621736";
  config.privateRoom.lobbyChannelId = "1486092416896209098";
  config.privateRoom.lobbyChannelIds = ["1486092416896209098", "1405664011655315456"];
  config.privateRoom.voiceCategoryId = "735856720751886437";
  config.privateRoom.panelTextChannelId = "";
  config.suggestions.channelId = "1386016926475489442";
}

/**
 * Supprime les salons / categories enregistres dans channelSetup pour ce serveur, vide le JSON, reinitialise la config runtime.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function removeSalonSetup(guild) {
  const me = await guild.members.fetchMe();
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, message: "Le bot doit avoir la permission **Gérer les salons**." };
  }

  const envGid = String(process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || "").trim();
  if (!envGid) {
    return {
      ok: false,
      message: "Définis **DISCORD_GUILD_ID** (ou **GUILD_ID**) dans `.env` avec l’ID de ce serveur."
    };
  }
  if (envGid !== guild.id) {
    return {
      ok: false,
      message: `Ce serveur (\`${guild.id}\`) ne correspond pas à **DISCORD_GUILD_ID** dans \`.env\` (\`${envGid}\`).`
    };
  }

  const ex = readGuildSetup(guild.id);
  if (!ex || typeof ex !== "object" || Object.keys(ex).length === 0) {
    return {
      ok: false,
      message: "Aucune entrée dans `channelSetup.json` pour ce serveur — rien à supprimer."
    };
  }

  const auditReason = "Suppression setup salons — CarminaBot (/setup salon supprimer)";
  await purgeSetupChannels(guild, ex, auditReason);
  clearGuildSetup(guild.id);
  resetRuntimeChannelConfigNoSetup();
  return { ok: true };
}

async function purgeSetupChannels(guild, old, auditReason = "Réinitialisation setup-salons — CarminaBot") {
  const looseChannelIds = [
    old.welcomeChannelId,
    old.reglementChannelId,
    old.rulesChannelId,
    old.modLogChannelId,
    old.messageLogChannelId,
    old.serverLogChannelId,
    old.ticketPanelChannelId,
    old.commandsChannelId,
    old.lobbyChannelId,
    old.panelTextChannelId,
    old.suggestionsChannelId
  ].filter(Boolean);

  for (const id of looseChannelIds) {
    const c = await guild.channels.fetch(id).catch(() => null);
    if (c && c.deletable) await c.delete(auditReason).catch(() => null);
  }

  const catIds = [
    old.botCategoryId,
    old.voiceCategoryId,
    old.ticketCategoryId,
    old.verifyTestCategoryId,
    old.verifyMainCategoryId,
    old.informationSharedCategoryId
  ].filter(Boolean);

  for (const id of catIds) {
    const c = await guild.channels.fetch(id).catch(() => null);
    if (c?.type === ChannelType.GuildCategory && c.deletable) {
      await c.delete(auditReason).catch(() => null);
    }
  }
}

async function ensureBotCategory(guild, setup, botId, reason) {
  if (setup.botCategoryId) {
    const cat = await guild.channels.fetch(setup.botCategoryId).catch(() => null);
    if (cat?.type === ChannelType.GuildCategory) return cat;
  }
  const cat = await guild.channels.create({
    name: CH.botCat,
    type: ChannelType.GuildCategory,
    reason
  });
  setup.botCategoryId = cat.id;
  return cat;
}

async function ensureTextChannel(guild, setup, parentId, key, name, topic, permissionOverwrites, reason, channelType = ChannelType.GuildText) {
  if (setup[key]) {
    const ex = await guild.channels.fetch(setup[key]).catch(() => null);
    if (ex && (ex.type === channelType || ex.isTextBased?.())) {
      return { channel: ex, created: false };
    }
  }
  const opts = {
    name,
    type: channelType,
    topic,
    permissionOverwrites,
    reason
  };
  if (parentId != null) opts.parent = parentId;
  const ch = await guild.channels.create(opts);
  setup[key] = ch.id;
  return { channel: ch, created: true };
}

function normalizeModulesAllTrue() {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, true]));
}

function configuredChannelIdForKey(key) {
  if (key === "welcomeChannelId") return String(config.welcome?.channelId || "").trim();
  if (key === "rulesChannelId") return String(config.welcomeVerify?.rulesChannelId || "").trim();
  if (key === "reglementChannelId") return String(config.welcomeVerify?.reglementChannelId || "").trim();
  if (key === "modLogChannelId") return String(config.modLog?.channelId || "").trim();
  if (key === "messageLogChannelId") return String(config.modLog?.messageLogChannelId || "").trim();
  if (key === "serverLogChannelId") return String(config.modLog?.serverLogChannelId || "").trim();
  if (key === "ticketPanelChannelId") return String(config.tickets?.panelChannelId || "").trim();
  if (key === "commandsChannelId") return String(config.welcomeVerify?.commandsChannelId || "").trim();
  if (key === "suggestionsChannelId") return String(config.suggestions?.channelId || "").trim();
  return "";
}

async function tryUseConfiguredTextChannel(guild, setup, key) {
  const configuredId = configuredChannelIdForKey(key);
  if (!configuredId) return null;
  const ex = await guild.channels.fetch(configuredId).catch(() => null);
  if (!ex?.isTextBased?.()) return null;
  setup[key] = ex.id;
  return ex;
}

async function bootstrapChannels(guild, opts = {}) {
  const me = await guild.members.fetchMe();
  const botId = me.id;

  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("Le bot a besoin de la permission **Gerer les salons**.");
  }

  const envGid = String(process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || "").trim();
  if (!envGid) {
    throw new Error(
      "Definis **DISCORD_GUILD_ID** (ou **GUILD_ID**) dans `.env` avec l'ID du serveur, sinon `channelSetup.json` ne sera pas charge au redemarrage."
    );
  }
  if (envGid !== guild.id) {
    throw new Error(
      `Ce serveur (${guild.id}) ne correspond pas a **DISCORD_GUILD_ID** / **GUILD_ID** dans \`.env\` (${envGid}). Corrige .env ou lance la commande sur le bon serveur.`
    );
  }

  let modules = opts.modules;
  if (!modules || typeof modules !== "object") {
    modules = normalizeModulesAllTrue();
  }

  const anyModule = MODULE_KEYS.some((k) => modules[k]);
  if (!anyModule) {
    throw new Error("Choisis au moins une partie a creer (ou active **Tout**).");
  }

  if (opts.force) {
    const ex = readGuildSetup(guild.id);
    if (!ex) {
      throw new Error("Aucune configuration enregistree pour ce serveur (rien a reinitialiser).");
    }
    await purgeSetupChannels(guild, ex);
    clearGuildSetup(guild.id);
    modules = normalizeModulesAllTrue();
  }

  const setup = { ...(readGuildSetup(guild.id) || {}) };
  const reason = `Setup CarminaBot — ${me.user.tag}`;
  const everyoneDenySend = overwritesReadOnlyEveryone(guild, botId);
  const lines = [];
  const warnings = [];

  async function doTop(flag, key, displayName, channelName, topic, embedFn) {
    if (!modules[flag]) return;
    const configured = await tryUseConfiguredTextChannel(guild, setup, key);
    if (configured) {
      lines.push(`**${displayName}** : <#${configured.id}> (salon existant configure)`);
      if (embedFn) await embedFn(configured);
      return;
    }
    const { channel, created } = await ensureTextChannel(
      guild,
      setup,
      null,
      key,
      channelName,
      topic,
      everyoneDenySend,
      reason,
      ChannelType.GuildText
    );
    if (created) {
      lines.push(`**${displayName}** : <#${channel.id}> (cree)`);
      if (embedFn) await embedFn(channel);
    } else {
      lines.push(`**${displayName}** : <#${channel.id}> (deja present)`);
    }
  }

  await doTop("bienvenue", "welcomeChannelId", "Bienvenue", CH.bienvenue, "Messages d'accueil (lecture seule pour les membres).", async (ch) => {
    await ch.send(buildBootstrapBienvenueV2());
  });

  await doTop("verification", "rulesChannelId", "Verification", CH.verification, "Bouton de verification.", async (ch) => {
    await ch.send(buildSalonVerificationMessage({ guildId: guild.id }));
  });

  await doTop("reglement", "reglementChannelId", "Reglement", CH.reglement, "Reglement du serveur.", async (ch) => {
    const verif = setup.rulesChannelId ? `<#${setup.rulesChannelId}>` : "le salon verification";
    await ch.send(buildBootstrapReglementV2(verif));
  });

  let catBot = null;

  async function doInBot(flag, key, displayName, channelName, topic, embedFn) {
    if (!modules[flag]) return;
    const configured = await tryUseConfiguredTextChannel(guild, setup, key);
    if (configured) {
      lines.push(`**${displayName}** : <#${configured.id}> (salon existant configure)`);
      if (embedFn) await embedFn(configured);
      return;
    }
    if (!catBot) {
      catBot = await ensureBotCategory(guild, setup, botId, reason);
      lines.push("Categorie **🤖 | bot** verifiee / creee.");
    }
    const { channel, created } = await ensureTextChannel(
      guild,
      setup,
      catBot.id,
      key,
      channelName,
      topic,
      everyoneDenySend,
      reason,
      ChannelType.GuildText
    );
    if (created) {
      lines.push(`**${displayName}** : <#${channel.id}> (cree)`);
      if (embedFn) await embedFn(channel);
    } else {
      lines.push(`**${displayName}** : <#${channel.id}> (deja present)`);
    }
  }

  await doInBot("logs_msg", "messageLogChannelId", "Logs messages & rôles", CH.logsMsg, "Messages + rôles membre.", async (ch) => {
    await ch.send(buildBootstrapLogsMessageV2());
  });

  await doInBot("logs_serveur", "serverLogChannelId", "Logs serveur & vocal", CH.logsServeur, "Vocal + salons + pseudos + serveur.", async (ch) => {
    await ch.send(buildBootstrapLogsServerV2());
  });

  await doInBot(
    "tickets_panel",
    "ticketPanelChannelId",
    "Ticket",
    CH.ticket,
    "Ouvrir un ticket support.",
    async (ch) => {
      await ch.send(
        buildTicketPanelMessage(config.tickets?.panelEmbedIntro || "Besoin d'aide ? Ouvre un ticket.", {
          variant: "general"
        })
      );
    }
  );

  if (modules.salon_commandes) {
    const configuredCommands = await tryUseConfiguredTextChannel(guild, setup, "commandsChannelId");
    const verifiedRoleId = config.welcomeVerify?.roleVerifiedId || "";
    if (configuredCommands) {
      lines.push(`**Commandes** : <#${configuredCommands.id}> (salon existant configure)`);
      await configuredCommands.send(buildBootstrapCommandesV2(verifiedRoleId)).catch(() => null);
    } else {
      if (!catBot) {
        catBot = await ensureBotCategory(guild, setup, botId, reason);
        lines.push("Categorie **🤖 | bot** verifiee / creee.");
      }
      const ow = overwritesCommandesChannel(guild, botId, verifiedRoleId, warnings);
      const key = "commandsChannelId";
      if (setup[key]) {
        const ex = await guild.channels.fetch(setup[key]).catch(() => null);
        if (ex?.isTextBased?.()) {
          lines.push(`**Commandes** : <#${ex.id}> (deja present)`);
        } else {
          delete setup[key];
        }
      }
      if (!setup[key]) {
        const ch = await guild.channels.create({
          name: CH.commandes,
          type: ChannelType.GuildText,
          parent: catBot.id,
          topic: "Commandes du bot (membres verifies — voir config roleVerifiedId).",
          permissionOverwrites: ow,
          reason
        });
        setup[key] = ch.id;
        lines.push(`**Commandes** : <#${ch.id}> (cree)`);
        await ch.send(buildBootstrapCommandesV2(verifiedRoleId));
      }
    }
  }

  if (modules.suggestions) {
    const configuredSuggestions = await tryUseConfiguredTextChannel(guild, setup, "suggestionsChannelId");
    if (configuredSuggestions) {
      lines.push(`**Suggestions** : <#${configuredSuggestions.id}> (salon existant configure)`);
      await configuredSuggestions.send(buildBootstrapSuggestionsIntroV2()).catch(() => null);
    } else {
      const { channel: sgCh, created: sgCreated } = await upsertSuggestionsChannel(
        guild,
        setup,
        botId,
        reason,
        warnings
      );
      if (sgCreated) {
        lines.push(`**Suggestions** : <#${sgCh.id}> (cree)`);
        await sgCh.send(buildBootstrapSuggestionsIntroV2());
      } else {
        lines.push(`**Suggestions** : <#${sgCh.id}> (deja present)`);
      }
    }
  }

  if (modules.categorie_tickets) {
    if (setup.ticketCategoryId) {
      const ex = await guild.channels.fetch(setup.ticketCategoryId).catch(() => null);
      if (ex?.type === ChannelType.GuildCategory) {
        lines.push("**Categorie tickets** : deja presente.");
      } else {
        delete setup.ticketCategoryId;
      }
    }
    if (!setup.ticketCategoryId) {
      const cat = await guild.channels.create({
        name: CH.ticketsCategory,
        type: ChannelType.GuildCategory,
        reason
      });
      setup.ticketCategoryId = cat.id;
      lines.push("**Categorie tickets** creee.");
    }
  }

  if (modules.tickets_panel && !modules.categorie_tickets && !setup.ticketCategoryId) {
    warnings.push(
      "Panel **ticket** sans **categorie tickets** : cree la categorie ou les nouveaux tickets echoueront."
    );
  }

  if (modules.panel_voc) {
    const preferredCatId =
      setup.voiceCategoryId ||
      realServerIds?.categories?.voiceCategoryId ||
      config.privateRoom?.voiceCategoryId ||
      null;
    let catVoc = preferredCatId ? await guild.channels.fetch(preferredCatId).catch(() => null) : null;
    if (!catVoc || catVoc.type !== ChannelType.GuildCategory) {
      delete setup.voiceCategoryId;
      delete setup.lobbyChannelId;
      delete setup.panelTextChannelId;
      catVoc = await guild.channels.create({
        name: CH.vocCat,
        type: ChannelType.GuildCategory,
        reason
      });
      setup.voiceCategoryId = catVoc.id;
      lines.push("**Categorie VOC** creee (ID fixe introuvable sur ce serveur).");
    } else {
      setup.voiceCategoryId = catVoc.id;
      lines.push("**Categorie VOC** : categorie existante (meme que les vocaux prives).");
    }

    let createdVoc = false;
    let panelTextCreated = false;

    if (!setup.lobbyChannelId) {
      const lobbyVc = await guild.channels.create({
        name: CH.lobby,
        type: ChannelType.GuildVoice,
        parent: catVoc.id,
        permissionOverwrites: overwritesVoiceLobby(guild, botId),
        reason
      });
      setup.lobbyChannelId = lobbyVc.id;
      lines.push(`**Lobby** : <#${lobbyVc.id}> (cree)`);
      createdVoc = true;
    } else {
      const ex = await guild.channels.fetch(setup.lobbyChannelId).catch(() => null);
      if (!ex) {
        const lobbyVc = await guild.channels.create({
          name: CH.lobby,
          type: ChannelType.GuildVoice,
          parent: catVoc.id,
          permissionOverwrites: overwritesVoiceLobby(guild, botId),
          reason
        });
        setup.lobbyChannelId = lobbyVc.id;
        lines.push(`**Lobby** : <#${lobbyVc.id}> (recree)`);
        createdVoc = true;
      } else {
        lines.push(`**Lobby** : <#${setup.lobbyChannelId}> (deja present)`);
      }
    }

    if (!setup.panelTextChannelId) {
      const panelVocText = await guild.channels.create({
        name: CH.panelVoc,
        type: ChannelType.GuildText,
        parent: catVoc.id,
        topic: "/voc-panel apres le lobby vocal.",
        permissionOverwrites: overwritesPanelVoc(guild, botId),
        reason
      });
      setup.panelTextChannelId = panelVocText.id;
      panelTextCreated = true;
      lines.push(`**Panel voc** : <#${panelVocText.id}> (cree)`);
    } else {
      const ex = await guild.channels.fetch(setup.panelTextChannelId).catch(() => null);
      if (!ex?.isTextBased?.()) {
        const panelVocText = await guild.channels.create({
          name: CH.panelVoc,
          type: ChannelType.GuildText,
          parent: catVoc.id,
          topic: "/voc-panel apres le lobby vocal.",
          permissionOverwrites: overwritesPanelVoc(guild, botId),
          reason
        });
        setup.panelTextChannelId = panelVocText.id;
        panelTextCreated = true;
        lines.push(`**Panel voc** : <#${panelVocText.id}> (recree)`);
      } else {
        lines.push(`**Panel voc** : <#${setup.panelTextChannelId}> (deja present)`);
      }
    }

    if (createdVoc || panelTextCreated) {
      const lobbyId = setup.lobbyChannelId;
      const panelId = setup.panelTextChannelId;
      const pt = await guild.channels.fetch(panelId).catch(() => null);
      if (pt?.isTextBased?.()) {
        await pt.send(buildBootstrapPanelVocV2(lobbyId));
      }
    }
  }

  if (modules.categories_accueil) {
    if (!setup.verifyTestCategoryId) {
      const c = await guild.channels.create({
        name: CH.catNouveaux,
        type: ChannelType.GuildCategory,
        reason
      });
      setup.verifyTestCategoryId = c.id;
      lines.push("**Categorie nouveaux** creee.");
    } else lines.push("**Categorie nouveaux** : deja en config.");

    if (!setup.verifyMainCategoryId) {
      const c = await guild.channels.create({
        name: CH.catPrincipal,
        type: ChannelType.GuildCategory,
        reason
      });
      setup.verifyMainCategoryId = c.id;
      lines.push("**Categorie communaute** creee.");
    } else lines.push("**Categorie communaute** : deja en config.");
  }

  writeGuildSetup(guild.id, setup);
  applySetupToRuntimeConfig(setup);

  if (
    modules.categories_accueil ||
    modules.verification ||
    modules.reglement ||
    modules.bienvenue
  ) {
    await syncWelcomeVerifyCategoryAccess(guild).catch(() => null);
  }

  return { setup, lines, warnings };
}

module.exports = {
  readGuildSetup,
  bootstrapChannels,
  applySetupToRuntimeConfig,
  applyRealServerIdsToGuildSetup,
  ensurePrivateVoiceLobbyInCategory,
  ensureSuggestionsChannel,
  removeSalonSetup,
  SETUP_PATH,
  MODULE_KEYS,
  normalizeModulesAllTrue,
  CH
};
