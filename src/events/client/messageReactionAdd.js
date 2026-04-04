const config = require("../../config");

function emojiKey(reaction) {
  return reaction.emoji.id || reaction.emoji.name;
}

module.exports = {
  name: "messageReactionAdd",
  async execute(client, reaction, user) {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
    } catch {
      return;
    }
    if (!reaction.message.guild) return;
    const bindings = config.reactionRoles?.bindings || [];
    if (!bindings.length) return;

    const msgId = reaction.message.id;
    const key = emojiKey(reaction);
    const match = bindings.find((b) => b.messageId === msgId && (b.emoji === key || b.emoji === reaction.emoji.toString()));
    if (!match?.roleId) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member || member.roles.cache.has(match.roleId)) return;
    await member.roles.add(match.roleId).catch(() => null);
  }
};
