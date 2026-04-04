/**
 * VRAIS IDs serveur (stockage uniquement, PAS appliqués automatiquement pour l'instant).
 *
 * But:
 * - Garder une source de vérité des IDs prod fournis par le propriétaire.
 * - Servira à la future commande `/deployer-vrai-ids`.
 */
module.exports = {
  guildId: "735584468420657292",

  roles: {
    unverifiedId: "1431475677789425754",
    verifiedId: "973960786290544690",
    suggestionsStaffRoleId: "740999121812586567",
    /** Acces salons tickets (staff + transcript / fermeture cote ticketService). */
    ticketsStaffRoleId: "740999121812586567"
  },

  channels: {
    welcomeChannelId: "1487455251152769226",
    /** 2e bienvenue (meme carte) : boutons Repertoire / Reglement / Ticket — voir `config.welcomeAlt`. */
    welcomeAltChannelId: "735656109980778566",
    ticketPanelChannelId: "740157072158621736",

    // À intégrer dans le message de vérification.
    reglementChannelId: "1428410217170866177",
    repertoireChannelId: "1428411223531196446",

    verificationChannelId: "1428411187300667493",

    // Salon logs serveur (prod) fourni par Koyor.
    modLogChannelId: "735986472141848678",

    commandsChannelId: "735810600348680212",
    suggestionsChannelId: "1386016926475489442"
  },

  /**
   * Panneau /panel-repertoire : salons et recherche de rôles par mots-clés (tous les mots d’un groupe doivent être dans le nom du rôle).
   */
  repertoire: {
    /** Salon #discussion pour les mentions ; sinon le bot cherche un salon dont le nom contient « discussion ». */
    discussionChannelId: null,
    /** Défaut : channels.ticketPanelChannelId */
    ticketChannelId: null,
    /**
     * Deux rôles « milieu » du panneau. Ex. [["partenaire"], ["premium"]]
     * Tableau vide = le bot tente des noms courants (partenaire, premium, donateur…).
     */
    extraRoleKeywordGroups: [],

    /**
     * Répertoire des rôles (1er panneau) : IDs optionnels si la recherche par nom échoue.
     */
    directory: {
      recruitRoleId: "1430525877434843206",
      recruitKeywords: ["recrutement", "recrue"]
    }
  },

  categories: {
    /** Categorie ou sont crees les salons ticket (texte). */
    ticketCategoryId: "1488047230039625829",

    // Categorie voc (panel voc + lobby vocal créés dedans par la commande existante).
    voiceCategoryId: "735856720751886437",

    // TODO(koyor): IDs verify finaux pas encore fournis — reminder au moment du switch prod.
    verifyTestCategoryId: null,
    verifyMainCategoryId: null
  }
};

