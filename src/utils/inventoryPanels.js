const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { V2_MSG, ACCENT_COLOR } = require("./componentsV2Panels");

function buildInventoryPanel(interaction, snapshot) {
  const { user, coffeeCount, customRoleCount, coffeeCooldownRemainingMs } = snapshot;
  const username = interaction.user?.username || "membre";
  const hasCoffeeCooldown = coffeeCooldownRemainingMs > 0;
  const canUseCustomRoleItem = customRoleCount > 0 && !user.customRoleUnlocked && !user.customRoleId;

  const lines = [
    `## 🎒 Inventaire de ${username}`,
    "",
    "### ☕ Cafe energisant",
    `Quantite: **${coffeeCount}**`,
    "Effet: boost aleatoire SC/SP/LP (30 a 60 min).",
    hasCoffeeCooldown
      ? `Statut: en cooldown (encore **${Math.ceil(coffeeCooldownRemainingMs / 60000)} min**).`
      : "Statut: disponible."
  ];

  lines.push(
    "",
    "### 🧩 Role perso (ticket)",
    `Quantite: **${customRoleCount}**`,
    canUseCustomRoleItem
      ? "Statut: disponible (ouvre un popup de creation)."
      : user.customRoleId
        ? "Statut: deja cree (1 role perso max)."
        : user.customRoleUnlocked
          ? "Statut: deja debloque."
          : "Statut: indisponible."
  );

  if (user.crownOwned) lines.push("", "👑 **Couronne**: possedee (+30% SP/LP).");
  if (user.piggyOwned) lines.push("🗃️ **Tirelire**: possedee (+35% SC).");
  if (user.customRoleUnlocked) lines.push("🧩 **Role perso**: debloque.");

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("inv_use_coffee")
          .setLabel("Utiliser le cafe")
          .setStyle(ButtonStyle.Success)
          .setDisabled(coffeeCount < 1 || hasCoffeeCooldown),
        new ButtonBuilder()
          .setCustomId("inv_use_custom_role")
          .setLabel("Utiliser role perso")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canUseCustomRoleItem),
        new ButtonBuilder()
          .setCustomId("inv_refresh")
          .setLabel("Rafraichir")
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return { components: [container], ...V2_MSG };
}

module.exports = { buildInventoryPanel };
