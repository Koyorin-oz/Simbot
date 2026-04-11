const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");
const config = require("../config");
const { ACCENT_COLOR } = require("./componentsV2Panels");

function buildDeployMenu() {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## Deploiement serveur",
          "Choisis une action ci-dessous. **Tout deployer** : categories → verification → bienvenues → rangs → **tickets generaux** → **tickets accueil** → suggestions."
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("deploy_select")
          .setPlaceholder("Que veux-tu deployer ?")
          .addOptions(
            {
              label: "Bienvenue Principal",
              description: "Salon principal : carte + Reglement / Verif / Repertoire",
              value: "bienvenue_panel"
            },
            {
              label: "Bienvenue Accueil",
              description: "2e salon : meme carte + Repertoire / Reglement / Ticket",
              value: "bienvenue_alt_panel"
            },
            {
              label: "Panel verification",
              description: "Panneau verification Components V2 (salon regles)",
              value: "verification_panel"
            },
            {
              label: "Roles de rang",
              description: "Creer / mettre a jour tous les roles de rang (couleurs, ordre)",
              value: "rank_roles"
            },
            {
              label: "Tickets generaux",
              description: "Panel moderation / admins (salon ticket habituel)",
              value: "ticket_panel"
            },
            {
              label: "Tickets processus accueil",
              description: "Panel verification — salon dedie uniquement",
              value: "ticket_welcome_panel"
            },
            {
              label: "Intro suggestions",
              description: "Message d'accueil Components V2 dans le salon suggestions",
              value: "suggestions_intro"
            },
            {
              label: "Categories accueil",
              description: "Sync permissions : nouveaux + communaute (verify)",
              value: "categories_accueil"
            },
            {
              label: "Tout deployer",
              description: "Enchaine tout (Principal + Accueil + le reste)",
              value: "tout"
            }
          )
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: []
  };
}

/** Cles valides pour `runDeployAction` (hors alias texte). */
const DEPLOY_ACTION_KEYS = [
  "categories_accueil",
  "verification_panel",
  "bienvenue_panel",
  "bienvenue_alt_panel",
  "rank_roles",
  "ticket_panel",
  "ticket_welcome_panel",
  "suggestions_intro",
  "tout"
];

function getDeployActionKeys() {
  const extra = (config.pingRolesPanel?.deployTargets || [])
    .map((t) => String(t.key || "").trim())
    .filter(Boolean);
  return [...DEPLOY_ACTION_KEYS, ...extra];
}

/**
 * Message ephemere avec menu deroulant : chaque option encode `0|1:key` (0=ajouter, 1=reinitialiser).
 * Evite le modal Discord (labels max 45 caracteres — l’ancien modal cassait showModal).
 */
function buildDevDeployerSelectMessage() {
  /** [key, titre menu, description courte option « ajouter » (sinon defaut)] */
  const rows = [
    ["categories_accueil", "Categories accueil", null],
    ["verification_panel", "Panel verification", null],
    [
      "bienvenue_panel",
      "Bienvenue Principal",
      "Meme carte que l’autre ; boutons Reglement / Verification / Repertoire"
    ],
    [
      "bienvenue_alt_panel",
      "Bienvenue Accueil",
      "Meme carte ; boutons Repertoire / Reglement / Ticket (sans verification)"
    ],
    ["rank_roles", "Roles de rang", null],
    [
      "ticket_panel",
      "Tickets generaux",
      "Panel classique ; bouton actif seulement dans le salon du panel general"
    ],
    [
      "ticket_welcome_panel",
      "Tickets processus accueil",
      "Verification / accueil ; categorie dediee ; bouton seulement dans le salon du panel"
    ],
    ["suggestions_intro", "Intro suggestions", null],
    ["tout", "Tout deployer (chaine complete)", null]
  ];

  for (const t of config.pingRolesPanel?.deployTargets || []) {
    const key = String(t.key || "").trim();
    if (!key) continue;
    rows.push([
      key,
      String(t.selectTitle || "Roles ping").slice(0, 100),
      t.selectDescription ? String(t.selectDescription).slice(0, 100) : null
    ]);
  }

  const descAjouterDef = "Envoie / applique sans vider le salon";
  const descReinitDef = "Supprime les derniers msgs du bot puis deploie";

  const options = [];
  for (const row of rows) {
    const [key, title, descAjouterExtra] = row;
    const descA = (descAjouterExtra || descAjouterDef).slice(0, 100);
    options.push({
      label: `${title} — ajouter`.slice(0, 100),
      value: `0:${key}`,
      description: descA
    });
    options.push({
      label: `${title} — reinit.`.slice(0, 100),
      value: `1:${key}`,
      description: descReinitDef.slice(0, 100)
    });
  }

  return {
    content:
      "**Deploiement**\n" +
      "Choisis une ligne ci-dessous : **ajouter** = deploiement simple ; **reinit.** = vide les derniers messages du bot dans le salon concerne (quand ca s’applique), puis deploie.\n\n" +
      "**Bienvenue Principal** et **Bienvenue Accueil** : meme image / meme texte ; seuls les **boutons** changent (voir la description de chaque option). **Tout** enchaine toute la serie.",
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("dev_deploy_select")
          .setMinValues(1)
          .setMaxValues(1)
          .setPlaceholder("Choisir quoi deployer…")
          .addOptions(options)
      )
    ]
  };
}

module.exports = {
  buildDeployMenu,
  buildDevDeployerSelectMessage,
  DEPLOY_ACTION_KEYS,
  getDeployActionKeys
};
