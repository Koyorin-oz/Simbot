const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { getCommandOwnerBypassUserId } = require("../../services/staffCommandPermissionsService");

const DELETE_DELAY_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * IDs utilisateurs : ne jamais fermer le MP avec eux (sanctions, preuves, staff).
 * @param {string} [extraFromSlash] liste "id,id" depuis la commande
 */
function buildProtectSet(extraFromSlash) {
  const set = new Set();
  const fromEnv = String(process.env.DM_PURGE_PROTECT_USER_IDS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));
  for (const id of fromEnv) set.add(id);
  if (extraFromSlash) {
    for (const id of String(extraFromSlash)
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{17,20}$/.test(s))) {
      set.add(id);
    }
  }
  return set;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("del-dm-all")
    .setDescription(
      "Ferme tous les salons MP 1:1 du bot (sauf exclusions). Admin ou proprietaire commandes."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName("confirmer")
        .setDescription("Ecris exactement SUPPRIMER pour confirmer")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("ids_proteges")
        .setDescription("IDs supplementaires a ne jamais fermer (virgule). S additionne a DM_PURGE_PROTECT_USER_IDS")
        .setRequired(false)
        .setMaxLength(400)
    ),
  async execute(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Utilise cette commande **sur un serveur** (pas en MP).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const ownerId = getCommandOwnerBypassUserId();
    const isOwner = interaction.user.id === ownerId;
    const isAdmin = Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
    if (!isOwner && !isAdmin) {
      await interaction.reply({
        content: "Reserve aux **administrateurs** du serveur ou au **proprietaire des commandes** du bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.options.getString("confirmer", true) !== "SUPPRIMER") {
      await interaction.reply({
        content: "Pour confirmer, mets **confirmer** = exactement `SUPPRIMER` (majuscules).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const extraProtect = interaction.options.getString("ids_proteges");
    const protect = buildProtectSet(extraProtect || "");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const allDm = [...client.channels.cache.values()].filter(
      (c) => c.type === ChannelType.DM && c.recipient && !c.recipient.bot
    );

    const protectedList = allDm.filter((c) => protect.has(c.recipient.id));
    const toClose = allDm.filter((c) => !protect.has(c.recipient.id));

    if (toClose.length === 0) {
      await interaction.editReply({
        content:
          `Aucun salon MP a fermer (${allDm.length} MP 1:1 au total` +
          (protectedList.length ? `, **${protectedList.length}** protege(s) par la liste — voir \`DM_PURGE_PROTECT_USER_IDS\` / **ids_proteges**).` : ").")
      });
      return;
    }

    let closed = 0;
    let failed = 0;
    let i = 0;
    for (const ch of toClose) {
      i += 1;
      try {
        await ch.delete(`del-dm-all par ${interaction.user.tag}`);
        closed += 1;
      } catch {
        failed += 1;
      }
      if (i % 15 === 0) {
        await interaction
          .editReply({
            content: `Fermeture… **${i}/${toClose.length}** traites (fermes **${closed}**, echecs **${failed}**).`
          })
          .catch(() => null);
      }
      if (i < toClose.length) await sleep(DELETE_DELAY_MS);
    }

    const lines = [
      "**Fermeture des MP terminee**",
      `Salons MP 1:1 fermes : **${closed}**`,
      `Echecs : **${failed}**`,
      `Proteges (non fermes) : **${protectedList.length}**`,
      "",
      "_Les MP listes dans `DM_PURGE_PROTECT_USER_IDS` (.env) ou dans **ids_proteges** ne sont pas fermes (ex. suivi sanctions)._"
    ];
    await interaction.editReply({ content: lines.join("\n") }).catch(() => null);
  }
};
