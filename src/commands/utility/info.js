const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
} = require("discord.js");
const { V2_MSG, ACCENT_COLOR } = require("../../utils/componentsV2Panels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("infos-serveur")
    .setDescription("Affiche des informations utiles")
    .addSubcommand((s) =>
      s
        .setName("role")
        .setDescription("Voir les informations d'un role")
        .addRoleOption((o) => o.setName("role").setDescription("Role cible").setRequired(true))
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "role") return;

    const role = interaction.options.getRole("role", true);
    const roles = [...interaction.guild.roles.cache.values()]
      .filter((r) => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position);

    const higherRoles = roles.filter((r) => r.position > role.position);
    const lowerRoles = roles.filter((r) => r.position < role.position);

    const colorHex = role.hexColor || "#000000";
    const mentionable = role.mentionable ? "oui" : "non";
    const hoist = role.hoist ? "oui" : "non";
    const managed = role.managed ? "oui" : "non";

    const higherText = formatRoleList(higherRoles, 20);
    const lowerText = formatRoleList(lowerRoles, 20);

    const container = new ContainerBuilder()
      .setAccentColor(ACCENT_COLOR)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Informations du role ${role}`))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `Nom: **${escapeMd(role.name)}**`,
            `ID: \`${role.id}\``,
            `Position hierarchie: **${role.position}**`,
            `Couleur HEX: **${colorHex}**`,
            `Membres: **${role.members.size}**`,
            `Mentionnable: **${mentionable}**`,
            `Affiche separement: **${hoist}**`,
            `Role gere par integration/bot: **${managed}**`
          ].join("\n")
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Roles au-dessus (avant lui)\n${higherText}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Roles en dessous (apres lui)\n${lowerText}`
        )
      );

    await interaction.reply({
      components: [container],
      ...V2_MSG
    });
  }
};

function formatRoleList(list, limit) {
  if (!list.length) return "Aucun.";
  const top = list.slice(0, limit).map((r, i) => `**${i + 1}.** ${r} (\`${r.name}\`)`);
  const remaining = list.length - top.length;
  if (remaining > 0) top.push(`... et **${remaining}** autre(s) role(s).`);
  return top.join("\n");
}

function escapeMd(value) {
  return String(value).replace(/[*_`~|]/g, "");
}
