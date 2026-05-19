const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  SeparatorSpacingSize
} = require("discord.js");
const { ACCENT_COLOR } = require("./componentsV2Panels");

function basePayload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
    embeds: []
  };
}

function wrap(...parts) {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);
  for (const p of parts) p(container);
  return basePayload(container);
}

function buildBootstrapBienvenueV2() {
  return wrap((c) =>
    c
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## :wave: Bienvenue\nPense à lire le règlement et à passer par la vérification si besoin."
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "_Les messages automatiques du serveur utilisent le format **Components V2** (pas d’embed classique)._"
        )
      )
  );
}

function buildBootstrapReglementV2(verifMention) {
  return wrap((c) =>
    c
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("## :scroll: Règlement"))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "Lis le règlement (épingles / messages du staff).",
            "",
            `Pour accéder au reste du serveur : ${verifMention} puis **Accéder au serveur**.`
          ].join("\n")
        )
      )
  );
}

function buildBootstrapLogsV2() {
  return wrap((c) =>
    c
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## :lock: Logs modération\nArrivées / départs, rôles, salons, invites, bans, emojis… Les membres ne postent pas ici."
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("_Salon lecture seule — **Components V2**._")
      )
  );
}

function buildBootstrapLogsServerV2() {
  return wrap((c) =>
    c
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## :satellite: Logs serveur & vocal\n" +
            "Vocal (rejoint / quitte / move), **salons** (créer / modifier / supprimer), **pseudos**, arrivées / départs, invites, bans, emojis…"
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("_Salon lecture seule — **Components V2**._")
      )
  );
}

function buildBootstrapLogsMessageV2() {
  return wrap((c) =>
    c
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "## :pencil: Logs messages & rôles\nSuppressions / modifications de messages + **rôles ajoutés ou retirés** sur un membre (hors bots)."
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("_Salon lecture seule — **Components V2**._")
      )
  );
}

function buildBootstrapCommandesV2(verifiedRoleId) {
  const desc = verifiedRoleId
    ? "Ici tu peux utiliser les **commandes slash** du bot. Réservé aux **membres vérifiés**."
    : "**Tests** : tout le monde peut utiliser les commandes ici tant que `roleVerifiedId` n'est pas défini dans la config.";
  return wrap((c) =>
    c
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("## :satellite: Salon commandes"))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
  );
}

function buildBootstrapPanelVocV2(lobbyChannelId) {
  return wrap((c) =>
    c
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("## :microphone2: Panneau vocaux privés"))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**1.** Rejoins <#${lobbyChannelId}> (vocal **Creer votre salon**).`,
            "**2.** Le bot te place dans ton vocal prive (categorie dediee) et poste le panneau dans le chat de cette voc.",
            "",
            "_Tout se fait automatiquement._"
          ].join("\n")
        )
      )
  );
}

function buildBootstrapSuggestionsIntroV2() {
  return wrap((c) =>
    c
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("## :bulb: Suggestions\nEspace de propositions pour la communauté.")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "• Utilise **`/suggestion`** (titre + texte ; image en **lien** ou **piece jointe**) — un fil de discussion s’ouvre sous le message.",
            "• **Vote** : Pour / Neutre / Contre ; la **couleur** du message change selon les votes (rouge si majorité de contre, vert-jaune si majorité de pour).",
            "• Les **membres vérifiés** lisent et votent ; le **staff** peut commenter ici."
          ].join("\n")
        )
      )
  );
}

module.exports = {
  buildBootstrapBienvenueV2,
  buildBootstrapReglementV2,
  buildBootstrapLogsV2,
  buildBootstrapLogsServerV2,
  buildBootstrapLogsVoiceV2: buildBootstrapLogsServerV2,
  buildBootstrapLogsMessageV2,
  buildBootstrapCommandesV2,
  buildBootstrapPanelVocV2,
  buildBootstrapSuggestionsIntroV2
};
