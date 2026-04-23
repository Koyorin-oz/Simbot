const { EmbedBuilder, ChannelType } = require("discord.js");

/**
 * Salon ou sont crees les fils prives de notification quand un DM de sanction fail.
 * Le staff doit avoir **Gerer les fils** (MANAGE_THREADS) sur ce salon pour voir / repondre.
 */
const SANCTION_FALLBACK_CHANNEL_ID = "738884759287103610";

/** @typedef {"MUTE"|"WARN"|"KICK"} PostSanctionDmType */

const TYPE_META = {
  MUTE: { title: "Mute", past: "mis en sourdine (timeout)" },
  WARN: { title: "Avertissement", past: "averti" },
  KICK: { title: "Expulsion", past: "expulsé du serveur" }
};

const COLORS = {
  MUTE: 0xd62828,
  WARN: 0xfee75c,
  KICK: 0xf26522
};

/**
 * MP **après** la sanction (sauf ban : garder le flux pré-ban + appel séparé).
 * @param {{ guildName: string, type: PostSanctionDmType, reason: string, byLabel: string, endsAt?: Date }} p
 */
function buildPostSanctionDmEmbed({ guildName, type, reason, byLabel, endsAt }) {
  const meta = TYPE_META[type] || { title: "Sanction", past: "sanctionné" };
  const embed = new EmbedBuilder()
    .setColor(COLORS[type] ?? 0xd62828)
    .setTitle(meta.title)
    .setDescription(`Vous avez été **${meta.past}** sur **${guildName}**.`)
    .addFields(
      { name: "Sanctionné par", value: byLabel, inline: true },
      { name: "Raison", value: reason || "Aucune raison", inline: false }
    );

  if (endsAt) {
    const ts = Math.floor(endsAt.getTime() / 1000);
    embed.addFields({ name: "Fin du mute", value: `<t:${ts}:F> (<t:${ts}:R>)`, inline: false });
  }

  embed.setTimestamp();
  return embed;
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {boolean} anonymous
 */
function moderatorLabelForDm(interaction, anonymous) {
  if (anonymous) return "Anonyme";
  return interaction.user.tag;
}

/**
 * @param {import("discord.js").User} user
 * @param {import("discord.js").EmbedBuilder} embed
 */
async function trySendSanctionDm(user, embed) {
  return user.send({ embeds: [embed] }).then(() => true).catch(() => false);
}

/**
 * Fallback quand le DM de sanction ne peut pas etre envoye (DM fermes / bot bloque / quarantaine).
 * Cree un **fil prive** dans `SANCTION_FALLBACK_CHANNEL_ID`, y ajoute la cible (ce qui la ping),
 * poste l'embed de sanction, puis **verrouille** le fil : la cible peut lire mais pas ecrire.
 * Les membres du staff ayant **MANAGE_THREADS** sur le salon parent voient / repondent.
 *
 * @param {{ guild: import("discord.js").Guild, user: import("discord.js").User, embed: import("discord.js").EmbedBuilder }} p
 * @returns {Promise<{ ok: boolean; threadId?: string; url?: string; reason?: string }>}
 */
async function sendSanctionChannelFallback({ guild, user, embed }) {
  try {
    if (!guild || !user) return { ok: false, reason: "missing_guild_or_user" };

    const channel =
      guild.channels.cache.get(SANCTION_FALLBACK_CHANNEL_ID) ||
      (await guild.channels.fetch(SANCTION_FALLBACK_CHANNEL_ID).catch(() => null));
    if (!channel || typeof channel.threads?.create !== "function") {
      return { ok: false, reason: "channel_not_found_or_no_threads" };
    }

    const baseName = String(user.username || user.tag || user.id || "membre").slice(0, 60);
    const threadName = `Sanction - ${baseName}`.slice(0, 100);

    const thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: "Notification de sanction (DM impossible)"
    });

    await thread.members.add(user.id).catch(() => null);

    await thread
      .send({
        content: `<@${user.id}>`,
        embeds: [embed],
        allowedMentions: { users: [user.id] }
      })
      .catch(() => null);

    await thread
      .setLocked(true, "Empecher la cible d'ecrire dans le fil de notification")
      .catch(() => null);

    return {
      ok: true,
      threadId: thread.id,
      url: `https://discord.com/channels/${guild.id}/${thread.id}`
    };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 200) };
  }
}

module.exports = {
  SANCTION_FALLBACK_CHANNEL_ID,
  buildPostSanctionDmEmbed,
  moderatorLabelForDm,
  trySendSanctionDm,
  sendSanctionChannelFallback
};
