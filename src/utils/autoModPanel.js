const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const BTN_MODAL = "automod:modal";
const BTN_TOGGLE = "automod:toggle";
const BTN_LIST = "automod:list";
const BTN_REFRESH = "automod:refresh";
const SELECT_DEL = "automod:del";

/**
 * @param {{ enabled: boolean, categories: { id: number, name: string, terms: string[] }[] }} payload
 */
function buildAutoModEmbed(payload) {
  const n = payload.categories.length;
  const totalTerms = payload.categories.reduce((acc, c) => acc + c.terms.length, 0);
  const lines = payload.categories
    .slice(0, 12)
    .map((c) => `• **${c.name}** — ${c.terms.length} terme(s)`)
    .join("\n");
  const more = n > 12 ? `\n_… et ${n - 12} autre(s) catégorie(s) (\`/settings-auto-moderation liste\`)_` : "";

  return new EmbedBuilder()
    .setColor(payload.enabled ? 0x57f287 : 0xed4245)
    .setTitle("Auto-modération")
    .setDescription(
      [
        "Les messages contenant un des termes configurés sont **supprimés** automatiquement.",
        "",
        "**Statut :** " + (payload.enabled ? "activé" : "désactivé"),
        `**Catégories :** ${n} · **Termes au total :** ${totalTerms}`,
        "",
        lines || "_Aucune catégorie — utilise le bouton **Ajouter / modifier**._",
        more
      ].join("\n")
    )
    .setFooter({ text: "Même principe que DraftBot : listes par thème, séparateurs virgule ou ligne." })
    .setTimestamp();
}

/**
 * @param {{ enabled: boolean, categories: { id: number, name: string, terms: string[] }[] }} payload
 */
function buildAutoModRows(payload) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_MODAL)
      .setLabel("Ajouter / modifier une catégorie")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(BTN_TOGGLE)
      .setLabel(payload.enabled ? "Désactiver" : "Activer")
      .setStyle(payload.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(BTN_LIST).setLabel("Liste détaillée").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BTN_REFRESH).setLabel("Actualiser").setStyle(ButtonStyle.Secondary)
  );

  const rows = [row1];

  const cats = payload.categories.slice(0, 25);
  if (cats.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SELECT_DEL)
          .setPlaceholder("Supprimer une catégorie…")
          .addOptions(
            cats.map((c) => ({
              label: c.name.slice(0, 100),
              description: `${c.terms.length} terme(s)`.slice(0, 100),
              value: `del:${c.id}`
            }))
          )
      )
    );
  }

  return rows;
}

module.exports = {
  buildAutoModEmbed,
  buildAutoModRows,
  BTN_MODAL,
  BTN_TOGGLE,
  BTN_LIST,
  BTN_REFRESH,
  SELECT_DEL
};
