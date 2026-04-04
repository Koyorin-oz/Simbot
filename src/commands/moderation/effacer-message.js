const {SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("effacer-message")
    .setDescription("Supprime les messages entre deux IDs")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("message_debut").setDescription("ID du premier message").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("message_fin").setDescription("ID du dernier message").setRequired(true)
    ),
  async execute(client, interaction) {
    const startRaw = interaction.options.getString("message_debut", true).trim();
    const endRaw = interaction.options.getString("message_fin", true).trim();
    const channel = interaction.channel;
    const me = interaction.guild.members.me;

    if (!/^\d{17,20}$/.test(startRaw) || !/^\d{17,20}$/.test(endRaw)) {
      await interaction.reply({ content: "IDs invalides. Utilise des IDs Discord valides.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!channel?.isTextBased() || !("messages" in channel) || !("bulkDelete" in channel)) {
      await interaction.reply({ content: "Commande utilisable uniquement dans un salon texte.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!me?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: "Le bot doit avoir la permission Gerer les messages.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const lowerId = toBigInt(startRaw) <= toBigInt(endRaw) ? startRaw : endRaw;
    const upperId = lowerId === startRaw ? endRaw : startRaw;

    const rangeMessages = await collectBetween(channel, lowerId, upperId);
    const endpoints = await Promise.all([
      channel.messages.fetch(lowerId).catch(() => null),
      channel.messages.fetch(upperId).catch(() => null)
    ]);

    const unique = new Map();
    for (const msg of rangeMessages) unique.set(msg.id, msg);
    for (const msg of endpoints) {
      if (msg) unique.set(msg.id, msg);
    }

    const messages = [...unique.values()].sort((a, b) => {
      const aId = toBigInt(a.id);
      const bId = toBigInt(b.id);
      if (aId === bId) return 0;
      return aId > bId ? 1 : -1;
    });
    if (!messages.length) {
      await interaction.editReply("Aucun message trouve dans cette plage.");
      return;
    }

    const now = Date.now();
    const recent = [];
    const old = [];
    for (const msg of messages) {
      const ageMs = now - msg.createdTimestamp;
      if (ageMs < 14 * 24 * 60 * 60 * 1000) recent.push(msg);
      else old.push(msg);
    }

    let deleted = 0;
    for (let i = 0; i < recent.length; i += 100) {
      const chunk = recent.slice(i, i + 100);
      // bulkDelete accepte Collection ou Array de messages.
      // eslint-disable-next-line no-await-in-loop
      const removed = await channel.bulkDelete(chunk, true).catch(() => null);
      if (removed) deleted += removed.size;
    }

    for (const msg of old) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await msg.delete().then(() => true).catch(() => false);
      if (ok) deleted += 1;
    }

    const skipped = messages.length - deleted;
    await interaction.editReply(
      skipped > 0
        ? `${deleted} message(s) supprime(s) sur ${messages.length}. ${skipped} non supprime(s).`
        : `${deleted} message(s) supprime(s) sur ${messages.length}.`
    );
  }
};

function toBigInt(id) {
  return BigInt(id);
}

async function collectBetween(channel, lowerId, upperId) {
  const out = [];
  let before = upperId;

  while (out.length < 5000) {
    // Remonte l'historique vers le bas de la plage.
    // eslint-disable-next-line no-await-in-loop
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;

    for (const message of batch.values()) {
      const id = toBigInt(message.id);
      if (id > toBigInt(upperId)) continue;
      if (id < toBigInt(lowerId)) continue;
      out.push(message);
    }

    const oldest = batch.last();
    if (!oldest) break;
    if (toBigInt(oldest.id) <= toBigInt(lowerId)) break;
    before = oldest.id;
  }

  return out;
}
