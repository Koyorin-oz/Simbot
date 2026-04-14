"use strict";

const {
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags
} = require("discord.js");
const config = require("../config");
const {
  getPrivateRoomStaffRoleId,
  parseVoicePanelButtonId,
  parseVoicePanelModalId,
  parseVocPanelOpenId,
  buildPrivateVoicePanelPayload
} = require("../utils/voiceRoomPanelBLZ");
const {
  sessionKey,
  getPrivateRoomVoiceMeta,
  registerPrivateRoomVoice,
  unregisterPrivateRoomVoice,
  loadPrefs,
  applyVoiceChannelSettings,
  safeJsonParseArray,
  resolvePrivateRoomNameFromPrefs,
  getOrInitSession
} = require("../services/privateRoomService");

function normalizePrivateRoomMode(raw) {
  const modeRaw = String(raw || "open").toLowerCase();
  const modeMap = { open: "open", blacklist: "blacklist", whitelist: "whitelist", both: "both" };
  return modeMap[modeRaw] || "open";
}

function sanitizeChannelName(raw) {
  return String(raw || "")
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, 100);
}

function canUseVoicePanel(interaction, voiceChannelId, restricted) {
  const member = interaction.member;
  if (!member || !interaction.guild) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const meta = getPrivateRoomVoiceMeta(interaction.client, voiceChannelId);
  if (!meta || meta.guildId !== interaction.guild.id) return false;

  const staffRole = getPrivateRoomStaffRoleId();
  const isStaff = staffRole ? member.roles.cache.has(staffRole) : false;
  const isOwner = member.id === meta.ownerId;

  if (restricted) {
    return isOwner || isStaff;
  }
  return true;
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 * @returns {Promise<boolean>} true si géré
 */
async function handleVoiceRoomPanelBLZButton(interaction) {
  const parsed = parseVoicePanelButtonId(interaction.customId);
  if (!parsed) return false;

  const { restricted, voiceChannelId, action } = parsed;
  const meta = getPrivateRoomVoiceMeta(interaction.client, voiceChannelId);

  if (!meta || meta.guildId !== interaction.guild?.id) {
    await interaction.reply({
      content: "Ce salon vocal n’est plus géré par le bot ou n’existe pas.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (!canUseVoicePanel(interaction, voiceChannelId, restricted)) {
    await interaction.reply({
      content: "Tu n’as pas accès à ce panneau (créateur du salon ou staff uniquement).",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const guild = interaction.guild;
  const channel = await guild.channels.fetch(voiceChannelId).catch(() => null);
  if (!channel?.isVoiceBased?.()) {
    await interaction.reply({ content: "Salon vocal introuvable.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const modeChar = parsed.mode === "r" ? "r" : parsed.mode === "e" ? "e" : "p";
  const modalBase = (kind) => `pvrm:${modeChar}:${voiceChannelId}:${kind}`;

  try {
    switch (action) {
      case "rename": {
        const modal = new ModalBuilder().setCustomId(modalBase("rename")).setTitle("Renommer le salon");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pvr_input_name")
              .setLabel("Nouveau nom du salon")
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(100)
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return true;
      }
      case "limit": {
        const modal = new ModalBuilder().setCustomId(modalBase("limit")).setTitle("Limite de places");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pvr_input_limit")
              .setLabel("Nombre de places (0 = illimité)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("0 à 99")
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return true;
      }
      case "kick": {
        const modal = new ModalBuilder().setCustomId(modalBase("kick")).setTitle("Expulser du salon vocal");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pvr_input_user")
              .setLabel("ID Discord du membre")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return true;
      }
      case "ban_room": {
        const modal = new ModalBuilder().setCustomId(modalBase("ban_room")).setTitle("Bannir du salon (ne plus voir / rejoindre)");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pvr_input_user")
              .setLabel("ID Discord du membre")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return true;
      }
      case "transfer": {
        const modal = new ModalBuilder().setCustomId(modalBase("transfer")).setTitle("Transférer la propriété");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pvr_input_user")
              .setLabel("ID du nouveau propriétaire")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
        return true;
      }
      case "lock": {
        await channel.permissionOverwrites.edit(guild.id, {
          ViewChannel: true,
          Connect: false,
          Speak: true
        });
        await interaction.reply({
          content:
            "Salon verrouillé : les membres ne peuvent plus rejoindre (sauf exceptions déjà définies).",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      case "unlock": {
        const prefs = await loadPrefs(interaction.client.prisma, guild.id, meta.ownerId);
        const ownerMember = await guild.members.fetch(meta.ownerId).catch(() => null);
        if (!ownerMember) {
          await interaction.reply({
            content: "Impossible de retrouver le créateur pour rétablir les permissions.",
            flags: MessageFlags.Ephemeral
          });
          return true;
        }
        const userLimit = Number.isFinite(Number(prefs.defaultLimit)) ? Math.max(0, Math.min(99, Number(prefs.defaultLimit))) : 0;
        const applied = await applyVoiceChannelSettings(interaction.client, interaction.client.prisma, ownerMember, channel.id, {
          name: resolvePrivateRoomNameFromPrefs(ownerMember, prefs.defaultName),
          limit: userLimit,
          mode: normalizePrivateRoomMode(prefs.defaultMode),
          blacklistIds: safeJsonParseArray(prefs.blacklistIds),
          whitelistIds: safeJsonParseArray(prefs.whitelistIds)
        });
        await interaction.reply({
          content: applied.ok
            ? "Permissions du salon réinitialisées (déverrouillé)."
            : applied.error || "Erreur.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      case "invite": {
        const url = `https://discord.com/channels/${guild.id}/${channel.id}`;
        await interaction.reply({
          content: `Lien vers le salon vocal :\n${url}`,
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      case "disconnect_others": {
        let n = 0;
        for (const [, vm] of channel.members) {
          if (vm.user.bot) continue;
          if (vm.id === meta.ownerId) continue;
          await vm.voice.disconnect().catch(() => null);
          n += 1;
        }
        await interaction.reply({
          content: n ? `${n} membre(s) déconnecté(s).` : "Aucun autre membre à déconnecter.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      case "delete": {
        await interaction.reply({ content: "Salon en cours de suppression…", flags: MessageFlags.Ephemeral });
        unregisterPrivateRoomVoice(interaction.client, channel.id);
        const keyOld = sessionKey(guild.id, meta.ownerId);
        if (!interaction.client.privateRoomSessions) interaction.client.privateRoomSessions = new Map();
        interaction.client.privateRoomSessions.set(keyOld, { voiceChannelId: null });
        await channel.delete("Panneau vocal privé — suppression").catch(() => null);
        return true;
      }
      case "timer":
      case "permit":
      case "ring":
      case "region":
      case "claim":
        await interaction.reply({
          content: "Cette option arrive bientôt.",
          flags: MessageFlags.Ephemeral
        });
        return true;
      default:
        await interaction.reply({ content: "Action inconnue.", flags: MessageFlags.Ephemeral });
        return true;
    }
  } catch (e) {
    console.error("[PVR_BLZ] button", e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Une erreur est survenue.", flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return true;
  }
}

/**
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleVoiceRoomPanelBLZModal(interaction) {
  const parsed = parseVoicePanelModalId(interaction.customId);
  if (!parsed) return false;

  const { restricted, voiceChannelId, kind } = parsed;

  if (!canUseVoicePanel(interaction, voiceChannelId, restricted)) {
    await interaction.reply({
      content: "Tu n’as plus la permission d’utiliser ce panneau.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const guild = interaction.guild;
  const meta = getPrivateRoomVoiceMeta(interaction.client, voiceChannelId);
  if (!meta || meta.guildId !== guild?.id) {
    await interaction.reply({ content: "Ce salon n’est plus enregistré.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const channel = await guild.channels.fetch(voiceChannelId).catch(() => null);
  if (!channel?.isVoiceBased?.()) {
    await interaction.reply({ content: "Salon vocal introuvable.", flags: MessageFlags.Ephemeral });
    return true;
  }

  try {
    if (kind === "rename") {
      const name = sanitizeChannelName(interaction.fields.getTextInputValue("pvr_input_name"));
      if (!name) {
        await interaction.reply({ content: "Nom invalide.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await channel.setName(name, "Panneau vocal privé — renommer");
      await interaction.reply({ content: `Salon renommé : **${name}**`, flags: MessageFlags.Ephemeral });
      return true;
    }

    if (kind === "limit") {
      const raw = interaction.fields.getTextInputValue("pvr_input_limit").trim();
      const n = parseInt(raw, 10);
      if (Number.isNaN(n) || n < 0 || n > 99) {
        await interaction.reply({
          content: "Entre un nombre entre 0 et 99 (0 = illimité).",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      await channel.setUserLimit(n, "Panneau vocal privé — limite");
      await interaction.reply({
        content: n === 0 ? "Limite retirée (illimité)." : `Limite fixée à **${n}** place(s).`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const userRaw = interaction.fields.getTextInputValue("pvr_input_user")?.trim() || "";
    if (!/^\d{17,22}$/.test(userRaw)) {
      await interaction.reply({ content: "ID membre invalide.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (kind === "kick") {
      if (userRaw === meta.ownerId) {
        await interaction.reply({ content: "Tu ne peux pas expulser le propriétaire ainsi.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const target = await guild.members.fetch(userRaw).catch(() => null);
      if (!target) {
        await interaction.reply({ content: "Membre introuvable sur ce serveur.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (target.voice?.channelId !== voiceChannelId) {
        await interaction.reply({ content: "Ce membre n’est pas dans ce salon vocal.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await target.voice.disconnect().catch(() => null);
      await interaction.reply({ content: `${target} a été expulsé du vocal.`, flags: MessageFlags.Ephemeral });
      return true;
    }

    if (kind === "ban_room") {
      if (userRaw === meta.ownerId) {
        await interaction.reply({ content: "Tu ne peux pas bannir le propriétaire du salon.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await channel.permissionOverwrites
        .edit(userRaw, {
          ViewChannel: false,
          Connect: false,
          Speak: false
        })
        .catch(() => null);
      const target = await guild.members.fetch(userRaw).catch(() => null);
      if (target?.voice?.channelId === voiceChannelId) {
        await target.voice.disconnect().catch(() => null);
      }
      await interaction.reply({
        content: "Membre banni de ce salon (permissions mises à jour).",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (kind === "transfer") {
      if (userRaw === meta.ownerId) {
        await interaction.reply({ content: "Ce membre est déjà propriétaire.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const newOwner = await guild.members.fetch(userRaw).catch(() => null);
      if (!newOwner || newOwner.user.bot) {
        await interaction.reply({ content: "Nouveau propriétaire introuvable ou invalide.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const prefs = await loadPrefs(interaction.client.prisma, guild.id, meta.ownerId);
      const applied = await applyVoiceChannelSettings(interaction.client, interaction.client.prisma, newOwner, channel.id, {
        name: channel.name,
        limit: channel.userLimit || 0,
        mode: normalizePrivateRoomMode(prefs.defaultMode),
        blacklistIds: safeJsonParseArray(prefs.blacklistIds),
        whitelistIds: safeJsonParseArray(prefs.whitelistIds)
      });
      if (!applied.ok) {
        await interaction.reply({ content: applied.error || "Transfert impossible.", flags: MessageFlags.Ephemeral });
        return true;
      }

      if (!interaction.client.privateRoomSessions) interaction.client.privateRoomSessions = new Map();
      interaction.client.privateRoomSessions.delete(sessionKey(guild.id, meta.ownerId));
      interaction.client.privateRoomSessions.set(sessionKey(guild.id, newOwner.id), { voiceChannelId });
      registerPrivateRoomVoice(interaction.client, guild.id, newOwner.id, voiceChannelId);

      await interaction.reply({
        content: `Propriété transférée à ${newOwner}.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    await interaction.reply({ content: "Action inconnue.", flags: MessageFlags.Ephemeral });
    return true;
  } catch (e) {
    console.error("[PVR_BLZ] modal", e);
    await interaction.reply({ content: "Une erreur est survenue.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleVocPanelOpenBLZButton(interaction) {
  const parsed = parseVocPanelOpenId(interaction.customId);
  if (!parsed || !interaction.guild) return false;

  let voiceChannelId;
  if (parsed.kind === "self") {
    const sess = await getOrInitSession(interaction.client, interaction.guild.id, interaction.user.id);
    if (!sess?.voiceChannelId) {
      await interaction.reply({
        content:
          "Tu n’as pas de salon vocal privé actif. Rejoins le lobby **Crée ton vocal** pour en créer un.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    voiceChannelId = sess.voiceChannelId;
  } else {
    voiceChannelId = parsed.channelId;
  }

  const meta = getPrivateRoomVoiceMeta(interaction.client, voiceChannelId);
  if (!meta || meta.guildId !== interaction.guild.id) {
    await interaction.reply({
      content: "Ce salon vocal n’est plus géré par le bot ou n’existe pas.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (parsed.kind === "self") {
    if (meta.ownerId !== interaction.user.id) {
      await interaction.reply({
        content: "Ce salon ne t’appartient pas. Utilise le lobby pour créer ton propre salon.",
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
  } else if (!canUseVoicePanel(interaction, voiceChannelId, true)) {
    await interaction.reply({
      content: "Ce panneau est réservé au **créateur** du salon ou au **staff**.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const ch = await interaction.guild.channels.fetch(voiceChannelId).catch(() => null);
  if (!ch?.isVoiceBased?.()) {
    await interaction.reply({
      content: "Salon vocal introuvable. Recrée-en un via le lobby.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  const pr = config.privateRoom;
  if (pr?.enabled && String(ch.parentId || "") !== String(pr.voiceCategoryId || "")) {
    await interaction.reply({
      content: "Ce salon n’est plus dans la catégorie des vocaux privés du bot.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    ...buildPrivateVoicePanelPayload(voiceChannelId, "restricted")
  });
  return true;
}

module.exports = {
  handleVoiceRoomPanelBLZButton,
  handleVoiceRoomPanelBLZModal,
  handleVocPanelOpenBLZButton
};
