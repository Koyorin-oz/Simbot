const config = require("../../config");
const { deleteIfOwnerEmpty, loadPrefs, safeJsonParseArray, createTempVoice, getOrInitSession } = require("../../services/privateRoomService");
const { sendModLog, baseEmbed } = require("../../services/modLogService");
const { isFrozen } = require("../../services/simbotRuntimeService");

function describeVoiceChannel(ch) {
  if (!ch) return "Inconnu";
  return `<#${ch.id}> (\`${ch.name}\` / \`${ch.id}\`)`;
}

module.exports = {
  name: "voiceStateUpdate",
  async execute(client, oldState, newState) {
    if (isFrozen()) return;
    const member = newState.member;
    if (
      member &&
      !member.user?.bot &&
      oldState.channelId !== newState.channelId &&
      String(newState.channelId || "") === String(config.privateRoom?.lobbyChannelId || "")
    ) {
      const session = await getOrInitSession(client, newState.guild.id, member.id);
      let hasActiveVoice = false;
      if (session.voiceChannelId) {
        const existing = await newState.guild.channels.fetch(session.voiceChannelId).catch(() => null);
        hasActiveVoice = Boolean(existing);
        if (!hasActiveVoice) {
          session.voiceChannelId = null;
        }
      }

      if (hasActiveVoice) {
        const existing = await newState.guild.channels.fetch(session.voiceChannelId).catch(() => null);
        if (existing?.isVoiceBased?.()) {
          await member.voice.setChannel(existing).catch(() => null);
        }
      } else {
        const prefs = await loadPrefs(client.prisma, newState.guild.id, member.id);
        await createTempVoice(client, client.prisma, member, {
          name: prefs.defaultName || "Salon vocal",
          limit: Number(prefs.defaultLimit) || 99,
          mode: prefs.defaultMode || "open",
          blacklistIds: safeJsonParseArray(prefs.blacklistIds),
          whitelistIds: safeJsonParseArray(prefs.whitelistIds)
        }).catch(() => null);
      }
    }

    if (!newState.member?.user?.bot) {
      const beforeId = oldState.channelId || null;
      const afterId = newState.channelId || null;

      if (beforeId !== afterId) {
        const member = newState.member;
        let title = "Activite vocale";
        let color = 0x5865f2;
        let description = "";

        if (!beforeId && afterId) {
          title = "Salon vocal rejoint";
          color = 0x57f287;
          description = `**Membre :** ${member.user.tag} (<@${member.id}>)\n**Salon :** ${describeVoiceChannel(newState.channel)}`;
        } else if (beforeId && !afterId) {
          title = "Salon vocal quitte";
          color = 0xed4245;
          description = `**Membre :** ${member.user.tag} (<@${member.id}>)\n**Salon :** ${describeVoiceChannel(oldState.channel)}`;
        } else if (beforeId && afterId) {
          title = "Salon vocal change";
          color = 0xfee75c;
          description = [
            `**Membre :** ${member.user.tag} (<@${member.id}>)`,
            `**Depuis :** ${describeVoiceChannel(oldState.channel)}`,
            `**Vers :** ${describeVoiceChannel(newState.channel)}`
          ].join("\n");
        }

        if (description) {
          const log = baseEmbed(title, color).setDescription(description);
          await sendModLog(newState.guild, log);
        }
      }
    }

    if (oldState.channelId) {
      const ch =
        oldState.channel ||
        (await oldState.guild.channels.fetch(oldState.channelId).catch(() => null));
      if (ch?.isVoiceBased()) await deleteIfOwnerEmpty(client, ch).catch(() => null);
    }
  }
};
