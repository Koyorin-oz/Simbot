const fs = require("fs");
const path = require("path");

/** Serveur principal La Carminauté (même valeur que `realServerIds.guildId`). */
const MAIN_GUILD_ID = "735584468420657292";

/** Serveur cible pour channelSetup.json. Lit GUILD_ID ou DISCORD_GUILD_ID, sinon serveur principal. */
const GUILD_ID = String(process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || MAIN_GUILD_ID).trim();

/** IDs generes par `/setup-salons` (prioritaires sur les valeurs par defaut ci-dessous). */
function loadChannelSetupForGuild() {
  try {
    const p = path.join(__dirname, "data", "channelSetup.json");
    if (!fs.existsSync(p)) return {};
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j[GUILD_ID] || {};
  } catch {
    return {};
  }
}

const ch = loadChannelSetupForGuild();

/**
 * Vocaux-lobby qui declenchent la creation d'un salon prive (plusieurs IDs possibles).
 * Sur La Carminauté : deux lobbies historiques reconnus ; surcharge avec PRIVATE_ROOM_LOBBY_IDS.
 */
function buildPrivateRoomLobbyChannelIds() {
  const set = new Set();
  const add = (x) => {
    const s = String(x || "").trim();
    if (/^\d{17,20}$/.test(s)) set.add(s);
  };
  add(ch.lobbyChannelId);
  for (const p of String(process.env.PRIVATE_ROOM_LOBBY_IDS || "").split(/[,;\s]+/)) add(p);
  add(process.env.PRIVATE_ROOM_LOBBY_CHANNEL_ID);
  if (String(GUILD_ID) === String(MAIN_GUILD_ID)) {
    add("1486092416896209098");
    add("1405664011655315456");
  }
  if (set.size === 0) add("1486092416896209098");
  return [...set];
}

const privateRoomLobbyChannelIds = buildPrivateRoomLobbyChannelIds();

module.exports = {
  /** ID fixe du serveur principal (surchargé par .env pour un serveur de test si besoin). */
  mainGuildId: MAIN_GUILD_ID,
  economy: {
    messageCooldownMs: 45_000,
    messageMinLength: 6,
    messageGain: { sc: [35, 90], sp: [20, 55], lp: [24, 65] },
    voiceTickMinutes: 10,
    voiceGain: { sc: 220, sp: 120, lp: 170 },
    levelBase: 180,
    levelExponent: 1.45,
    /**
     * Perte de SP si inactif (message ou vocal avec gain) — a partir du rang Nala (SP >= minSp Nala I).
     * Sarabi / Cardinal : perte plus forte + permissions GIF sur le role (Embed + emojis externes).
     */
    spDecay: {
      enabled: true,
      /** Heures sans activite avant la premiere perte. */
      graceHours: 24,
      /** Intervalle minimum entre deux pertes pour un meme membre (heures). */
      tickHours: 6,
      /** Le bot verifie l'inactivite toutes les N minutes (independant de tickHours). */
      checkIntervalMinutes: 30,
      /** SP retires par tick (Nala I / II / III). */
      nalaSpPerTick: 18,
      /** SP retires par tick (Sarabi). */
      scarSpPerTick: 48,
      /** SP retires par tick (Cardinal). */
      cardinalSpPerTick: 72
    }
  },
  rewards: {
    dailyOptions: [2000, 5000, 7000, 10000],
    weekly: 25000,
    monthly: 50000
  },
  shop: {
    /**
     * Prix ajustés (hors café) : objectif ~2 mois pour la Tirelire (item permanent le moins cher)
     * avec un membre moyennement actif (commandes + quelques messages), ~1 mois pour un membre très actif.
     * Rapports Couronne : Tirelire : Rôle perso inchangés (2 : 1 : 2).
     */
    crownPrice: 1400000,
    piggyPrice: 700000,
    coffeePrice: 5500,
    customRolePrice: 1400000,
    crownBoostPct: 30,
    piggyBoostPct: 35,
    coffeeBoostRangePct: [20, 45],
    coffeeMinutesRange: [30, 60]
  },
  rankSystem: {
    // IDs Discord optionnels par cle de rang (sinon detection par nom ou creation auto).
    roleMap: {
      hyene_1: "",
      hyene_2: "",
      hyene_3: "",
      pumba_1: "",
      pumba_2: "",
      pumba_3: "",
      shenzi_1: "",
      shenzi_2: "",
      shenzi_3: "",
      timon_1: "",
      timon_2: "",
      timon_3: "",
      nala_1: "",
      nala_2: "",
      nala_3: "",
      scar: "",
      cardinal: ""
    },
    thresholds: [
      { key: "hyene_1", name: "Hyene I", minSp: 0 },
      { key: "hyene_2", name: "Hyene II", minSp: 450 },
      { key: "hyene_3", name: "Hyene III", minSp: 900 },
      { key: "pumba_1", name: "Pumba I", minSp: 1500 },
      { key: "pumba_2", name: "Pumba II", minSp: 2300 },
      { key: "pumba_3", name: "Pumba III", minSp: 3200 },
      { key: "shenzi_1", name: "Shenzi I", minSp: 4300 },
      { key: "shenzi_2", name: "Shenzi II", minSp: 5600 },
      { key: "shenzi_3", name: "Shenzi III", minSp: 7100 },
      { key: "timon_1", name: "Timon I", minSp: 9000 },
      { key: "timon_2", name: "Timon II", minSp: 11200 },
      { key: "timon_3", name: "Timon III", minSp: 13800 },
      { key: "nala_1", name: "Nala I", minSp: 17000 },
      { key: "nala_2", name: "Nala II", minSp: 20800 },
      { key: "nala_3", name: "Nala III", minSp: 25400 },
      { key: "scar", name: "Sarabi", minSp: 40000 },
      { key: "cardinal", name: "Cardinal", minSp: 100000 }
    ]
  },
  welcome: {
    // TODO(prod): owner a demandé de retirer le flow welcome sur le vrai serveur.
    // Rappel: voir `src/data/realServerIds.js` avant `/deployer-vrai-ids`.
    // Priorite : ID cree par /setup-salons (bienvenue), sinon valeur ci-dessous.
    channelId: ch.welcomeChannelId || "1487455251152769226",
    // Fond du canvas : chemin absolu optionnel. Sinon voir assets/welcome-canvas-background.* ou .env WELCOME_CANVAS_BACKGROUND.
    canvasBackgroundPath: "",
    rulesChannelId: "1428410217170866177",
    helpChannelId: "740157072158621736"
  },

  /**
   * Bienvenue Accueil (2e salon) : meme carte que Bienvenue Principal ;
   * boutons Repertoire / Reglement / Ticket — sans verification.
   * Deploiement : /dev-deployer ou `bienvenue_alt` / `tout`.
   */
  welcomeAlt: {
    panelChannelId: "735656109980778566",
    reglementChannelId: "1428410217170866177",
    repertoireChannelId: "736505256178876496",
    /** Lien « Ticket » sur la carte Accueil → salon du panel tickets processus d'accueil. */
    ticketChannelId: "1428411994578620587"
  },

  /**
   * Salon de logs moderation / serveur (serveur TEST).
   * TODO(prod): pas de salon mod-log fixe selon owner (mode staff/permissions).
   */
  modLog: {
    channelId: ch.modLogChannelId || "735986472141848678"
  },

  /**
   * Accueil securise : panneau verification Components V2.
   * Mentions reglement / repertoire : defaut = serveur definitif ; channelSetup peut surcharger.
   */
  welcomeVerify: {
    enabled: true,
    /** Lien **règlement** dans le panneau verification (ID serveur principal). */
    reglementChannelId: ch.reglementChannelId || "1428410217170866177",
    /** Salon verification (Components V2). */
    rulesChannelId: ch.rulesChannelId || "1428411187300667493",
    /** Lien **repertoire** dans le panneau verification (defaut prod). */
    repertoireChannelId: ch.repertoireChannelId || "1428411223531196446",
    /** Legacy — plus utilise dans le panneau verification. */
    informationChannelId: ch.informationChannelId || "",
    // Categories optionnelles (laisser vide si non utilisees).
    testCategoryId: ch.verifyTestCategoryId || "",
    mainCategoryId: ch.verifyMainCategoryId || "",
    /**
     * Categorie optionnelle (legacy JSON). Plus sync auto — cree manuellement si besoin.
     */
    informationSharedCategoryId: ch.informationSharedCategoryId || "",
    /**
     * Salon `📡 | commandes` : membres verifies y utilisent les slash commands (overwrites au setup).
     * Rempli par /setup-salons si tu coches salon_commandes.
     */
    commandsChannelId: ch.commandsChannelId || "735810600348680212",
    /** Role "nouveau arrivant" (attribue automatiquement a l'arrivee). */
    roleUnverifiedId: "1431475677789425754",
    /** Role membre verifie (serveur principal). */
    roleVerifiedId: "973960786290544690"
  },

  /**
   * Musique dans le vocal : @discordjs/voice + YouTube (recherche / lien) ; liens Spotify publics si creds API.
   * Desactiver : MUSIC_ENABLED=false
   */
  music: {
    enabled: String(process.env.MUSIC_ENABLED || "true").toLowerCase() !== "false",
    maxPlaylistTracks: Math.min(50, Math.max(5, Number(process.env.MUSIC_MAX_PLAYLIST_TRACKS) || 25)),
    /** En-tete Cookie brut (navigateur connecte a YouTube) pour limiter les 403 / flux sans URL si ytdl decroche. Optionnel : YOUTUBE_COOKIE */
    youtubeCookie: String(process.env.YOUTUBE_COOKIE || "").trim(),
    /** Chemin absolu vers le binaire yt-dlp (prioritaire sur celui de youtube-dl-exec). Optionnel : YT_DLP_PATH */
    ytDlpBinaryPath: String(process.env.YT_DLP_PATH || "").trim(),
    spotifyClientId: String(process.env.SPOTIFY_CLIENT_ID || "").trim(),
    spotifyClientSecret: String(process.env.SPOTIFY_CLIENT_SECRET || "").trim(),
    /**
     * Staff musique : meme role pour bypass vocal prive (bot) et pour utiliser le **panneau musique**
     * d’un autre membre (boutons suffixes par leur userId). Surcharge : MUSIC_PRIVATE_ROOM_STAFF_ROLE_ID
     */
    privateRoomStaffBypassRoleId: String(
      process.env.MUSIC_PRIVATE_ROOM_STAFF_ROLE_ID || "740999121812586567"
    ).trim(),
    /**
     * Lavalink (serveur Java separe) + Shoukaku : si LAVALINK_HOST et LAVALINK_PASSWORD sont definis,
     * la lecture vocale passe par le noeud (souvent plus stable que le flux direct YouTube).
     */
    lavalinkHost: String(process.env.LAVALINK_HOST || "").trim(),
    lavalinkPort: Math.min(65535, Math.max(1, Number(process.env.LAVALINK_PORT) || 2333)),
    lavalinkPassword: String(process.env.LAVALINK_PASSWORD || "").trim(),
    lavalinkSecure: String(process.env.LAVALINK_SECURE || "").toLowerCase() === "true",
    lavalinkNodeName: String(process.env.LAVALINK_NODE_NAME || "main").trim() || "main",
    /**
     * Ignorer Lavalink meme si LAVALINK_* est defini (noeud HS / Pebble sans acces au serveur Java).
     * Lecture uniquement @discordjs/voice + play-dl / yt-dlp / ytdl-core.
     */
    forceNativePlayback: String(process.env.MUSIC_FORCE_NATIVE || "").toLowerCase() === "true"
  },

  /** Salons vocaux temporaires : rejoindre le lobby = creation auto du vocal prive + chat associe. */
  privateRoom: {
    enabled: true,
    /** ID affiche dans les panneaux (mention du lobby principal). */
    lobbyChannelId:
      ch.lobbyChannelId ||
      String(process.env.PRIVATE_ROOM_LOBBY_CHANNEL_ID || "").trim() ||
      privateRoomLobbyChannelIds[0] ||
      "1486092416896209098",
    /** Tous les salons vocaux-lobby qui declenchent creation + deplacement + panneau. */
    lobbyChannelIds: privateRoomLobbyChannelIds,
    /** Categorie parente des vocaux prives crees par le bot (lobby + salons crees). */
    voiceCategoryId: ch.voiceCategoryId || "735856720751886437",
    /** Salon texte de panneau (legacy /voc-panel, optionnel). */
    panelTextChannelId: ch.panelTextChannelId || ""
  },

  /**
   * Roles-reactions : laisse bindings vide ou ajoute { messageId, emoji ("✅" ou id custom), roleId }.
   * Publie un message, mets son ID ici, emoji correspondant = attribution du role.
   */
  reactionRoles: {
    bindings: []
  },

  /**
   * Suggestions : salon déployé via /setup-salons (option suggestions).
   * Staff : variable d'environnement SUGGESTIONS_STAFF_ROLE_ID (messages dans le salon).
   * Ping : role mentionne a chaque nouvelle suggestion (SUGGESTIONS_PING_ROLE_ID ou ID ci-dessous).
   */
  suggestions: {
    channelId: ch.suggestionsChannelId || "1386016926475489442",
    staffRoleId: String(process.env.SUGGESTIONS_STAFF_ROLE_ID || "").trim(),
    pingRoleId: String(process.env.SUGGESTIONS_PING_ROLE_ID || "1311064337984651344").trim()
  },

  /** Tickets support (général — modération / admins). */
  tickets: {
    categoryId: ch.ticketCategoryId || "1488047230039625829",
    /** Salon texte ou poster le panel "Ouvrir un ticket" (via /deployer). */
    panelChannelId: ch.ticketPanelChannelId || "740157072158621736",
    /** Role staff tickets (voir / gerer). Sur le serveur prod, `ticketService` peut aussi lire `realServerIds`. */
    staffRoleId: String(process.env.TICKETS_STAFF_ROLE_ID || "").trim() || "740999121812586567",
    panelEmbedIntro:
      "Utilise un ticket pour **solliciter la modération** ou **écrire aux administrateurs**.\n\n" +
      "Ticket **troll**, inutile ou abusif : ça peut finir en **sanction**. Merci de rester **sérieux et courtois** ✅\n\n" +
      "⬇️ **C'est par là :**"
  },

  /**
   * Tickets « processus d'accueil » : categorie dediee, panel uniquement dans `panelChannelId`.
   * Le bouton n'ouvre un ticket que si l'interaction vient de ce salon.
   */
  ticketsWelcome: {
    categoryId: "1482747454926356624",
    panelChannelId: "1428411994578620587",
    /** ID salon verification (mention dans le texte du panel). */
    verificationChannelId: "1428411187300667493",
    panelEmbedIntro:
      "Tu bloques sur la **vérification** ou tu n’accèdes pas au reste du serveur ? Ce fil est fait pour t’aider dans ce cadre.\n\n" +
      "Normalement, tout passe d’abord par le salon de vérification : {{VERIFY_CHANNEL}}.\n\n" +
      "Si tu **n’y arrives vraiment pas** (téléphone, salons invisibles, bug technique…), clique sur le bouton ci-dessous et **explique ton cas** : le staff te répondra ici. Ce n’est pas un raccourci pour ignorer la vérif quand tout fonctionne de ton côté.\n\n" +
      "Merci de rester **clair et respectueux** — abus ou troll = sanction possible."
  },

  /** Compteur vocal/catégorie/salon du nombre de membres. */
  serverStats: {
    memberCounterChannelId: "1235231648048746516"
  },

  /**
   * Liens : YouTube / TikTok / Instagram uniquement dans `mediaChannelId` ; Tenor + cadeaux Discord partout.
   * Invitations serveur (`discord.gg`, `/invite/`) bloquées sauf rôles bypass.
   * `LINK_BYPASS_ROLE_IDS` = liste séparée par virgules (sinon deux rôles par défaut + `LINK_BYPASS_ROLE_ID` seul si défini).
   */
  linkPolicy: (() => {
    const fromMulti = String(process.env.LINK_BYPASS_ROLE_IDS || "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const fromSingle = String(process.env.LINK_BYPASS_ROLE_ID || "").trim();
    const defaultPair = ["740999121812586567", "735585964386418699"];
    const bypassRoleIds =
      fromMulti.length > 0 ? fromMulti : fromSingle ? [fromSingle] : defaultPair;
    return {
      bypassRoleIds,
      mediaChannelId: String(process.env.LINK_MEDIA_CHANNEL_ID || "735644918789439496").trim()
    };
  })(),

  /**
   * Notifications YouTube (RSS) : message type NotifEye (texte + embed rouge + bouton lien).
   * Desactiver : YOUTUBE_NOTIFY_ENABLED=false
   */
  youtubeNotify: {
    enabled: String(process.env.YOUTUBE_NOTIFY_ENABLED || "true").toLowerCase() !== "false",
    guildId: String(process.env.YOUTUBE_NOTIFY_GUILD_ID || MAIN_GUILD_ID).trim(),
    channelId: String(process.env.YOUTUBE_NOTIFY_CHANNEL_ID || "735681234847531078").trim(),
    pollIntervalMinutes: Math.max(2, Number(process.env.YOUTUBE_NOTIFY_POLL_MINUTES) || 5),
    /** Chaque entree : `channelId` OU `handle` (@ sans le @). displayName = gras dans le message. */
    sources: [
      { channelId: "UCFwHronrvO5k4Iyp4jm4sxw", displayName: "Carminator" },
      { handle: "Carmineoff", displayName: "Carmineoff" }
    ]
  }
};
