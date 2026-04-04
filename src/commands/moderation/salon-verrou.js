const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} = require("discord.js");
const config = require("../../config");
const {
  getLockState,
  lockChannel,
  closeChannelVisually,
  unlockChannel
} = require("../../services/channelLockService");

const LOCKABLE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread
];

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {import("discord.js").Role | null} optionRole
 */
function resolveStaffRole(interaction, optionRole) {
  if (optionRole) return optionRole;
  const envId = String(process.env.LOCK_CHANNEL_STAFF_ROLE_ID || process.env.STAFF_ROLE_ID || "").trim();
  if (envId) {
    const r = interaction.guild.roles.cache.get(envId);
    if (r) return r;
  }
  const fallback = String(config.tickets.staffRoleId || "").trim();
  return fallback ? interaction.guild.roles.cache.get(fallback) : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("salon-verrou")
    .setDescription("Verrouiller (parler), fermer (cacher) ou restaurer un salon pour le staff")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("verrouiller")
        .setDescription("Interdit d’écrire (ou de parler en vocal) à @everyone ; autorise le rôle staff")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon cible (défaut : salon où tu lances la commande)")
            .addChannelTypes(...LOCKABLE_CHANNEL_TYPES)
            .setRequired(false)
        )
        .addRoleOption((o) =>
          o
            .setName("role_staff")
            .setDescription("Rôle qui garde le droit de parler (défaut : .env ou rôle tickets)")
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("fermer")
        .setDescription("Masque le salon : @everyone ne le voit plus ; le rôle staff garde l’accès complet")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon cible (défaut : salon où tu lances la commande)")
            .addChannelTypes(...LOCKABLE_CHANNEL_TYPES)
            .setRequired(false)
        )
        .addRoleOption((o) =>
          o
            .setName("role_staff")
            .setDescription("Rôle qui reste autorisé (défaut : .env ou rôle tickets)")
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("deverrouiller")
        .setDescription("Restaure les permissions (après verrouiller ou fermer)")
        .addChannelOption((o) =>
          o
            .setName("salon")
            .setDescription("Salon cible (défaut : salon actuel)")
            .addChannelTypes(...LOCKABLE_CHANNEL_TYPES)
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("statut")
        .setDescription("Indique si ce salon est marqué comme verrouillé par le bot")
    ),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const me = interaction.guild.members.me;

    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "Le bot doit avoir la permission **Gérer les salons**.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const target =
      interaction.options.getChannel("salon") ||
      (sub === "statut" ? interaction.channel : null) ||
      interaction.channel;

    if (!target || !("guild" in target) || !target.guild) {
      await interaction.reply({ content: "Salon invalide.", flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = await interaction.guild.channels.fetch(target.id).catch(() => null);
    if (!channel || !channel.permissionOverwrites) {
      await interaction.reply({ content: "Impossible de charger ce salon.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "Le bot doit pouvoir **gérer les permissions** de ce salon.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "statut") {
      const st = getLockState(interaction.guildId, channel.id);
      if (!st) {
        await interaction.reply({
          content: "Ce salon n’est **pas** enregistré comme verrouillé par `/salon-verrou`.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const modeLabel =
        st.mode === "ferme" ? "**fermé** (invisible pour @everyone)" : "**verrouillé messages** (messagerie / vocal)";
      await interaction.reply({
        content:
          `État bot : ${modeLabel}\n` +
          `Rôle staff : <@&${st.staffRoleId}>\n` +
          `Le ${st.lockedAt} — par ${st.lockedByTag}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "verrouiller") {
      const staffRole = resolveStaffRole(interaction, interaction.options.getRole("role_staff"));
      if (!staffRole) {
        await interaction.reply({
          content:
            "Rôle staff introuvable. Utilise l’option **role_staff**, ou configure `LOCK_CHANNEL_STAFF_ROLE_ID`, `STAFF_ROLE_ID`, ou le rôle tickets dans la config.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const result = await lockChannel(channel, staffRole.id, interaction.user.tag);
        if (!result.ok) {
          const msg =
            result.code === "already_locked"
              ? "Ce salon est **déjà** géré par le bot (`verrouiller` ou `fermer`). Utilise `/salon-verrou deverrouiller` d’abord."
              : result.code === "unsupported"
                ? "Type de salon non pris en charge."
                : "Impossible de modifier les permissions de ce salon.";
          await interaction.editReply({ content: msg });
          return;
        }
        await interaction.editReply({
          content:
            `🔒 Salon ${channel} verrouillé.\n` +
            `**@everyone** ne peut plus envoyer de messages (ou parler en vocal). Rôle autorisé : ${staffRole}.\n` +
            `_Les administrateurs Discord peuvent toujours contourner selon les réglages du serveur._`
        });
      } catch (e) {
        await interaction.editReply({
          content: `Erreur : ${e?.message || String(e)}`
        });
      }
      return;
    }

    if (sub === "fermer") {
      const staffRole = resolveStaffRole(interaction, interaction.options.getRole("role_staff"));
      if (!staffRole) {
        await interaction.reply({
          content:
            "Rôle staff introuvable. Utilise l’option **role_staff**, ou configure `LOCK_CHANNEL_STAFF_ROLE_ID`, `STAFF_ROLE_ID`, ou le rôle tickets dans la config.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const result = await closeChannelVisually(channel, staffRole.id, interaction.user.tag);
        if (!result.ok) {
          const msg =
            result.code === "already_locked"
              ? "Ce salon est **déjà** géré par le bot (`verrouiller` ou `fermer`). Utilise `/salon-verrou deverrouiller` d’abord."
              : "Impossible de modifier les permissions de ce salon.";
          await interaction.editReply({ content: msg });
          return;
        }
        await interaction.editReply({
          content:
            `🚪 Salon ${channel} **fermé** pour @everyone (ils ne voient plus le salon).\n` +
            `Accès conservé pour ${staffRole}.\n` +
            `Pour tout remettre comme avant : \`/salon-verrou deverrouiller\`.`
        });
      } catch (e) {
        await interaction.editReply({
          content: `Erreur : ${e?.message || String(e)}`
        });
      }
      return;
    }

    if (sub === "deverrouiller") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const result = await unlockChannel(channel, interaction.user.tag);
        if (!result.ok) {
          const msg =
            result.code === "not_locked"
              ? "Ce salon n’a **pas** été verrouillé par le bot (ou l’état a été perdu). Les permissions n’ont pas été modifiées."
              : "Impossible de restaurer les permissions.";
          await interaction.editReply({ content: msg });
          return;
        }
        await interaction.editReply({ content: `🔓 Salon ${channel} : permissions **restaurées** comme avant le verrouillage.` });
      } catch (e) {
        await interaction.editReply({
          content: `Erreur : ${e?.message || String(e)}`
        });
      }
    }
  }
};
