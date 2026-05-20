const { sendServerLog, baseEmbed } = require("../../services/modLogService");
const { recordNativeMuteFromAudit } = require("../../services/moderatorProfileService");
const config = require("../../config");
const { stripWelcomeUnverifiedRoles } = require("../../services/welcomeVerifyService");
const { maybeSyncBoosterRoleAfterUpdate } = require("../../services/serverBoosterRoleService");

module.exports = {
  name: "guildMemberUpdate",
  async execute(client, oldMember, newMember) {
    await recordNativeMuteFromAudit(client, oldMember, newMember).catch(() => null);
    await maybeSyncBoosterRoleAfterUpdate(oldMember, newMember).catch(() => null);

    const guild = newMember.guild;
    const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

    const wv = config.welcomeVerify;
    if (
      wv?.enabled &&
      wv.roleVerifiedId &&
      added.has(wv.roleVerifiedId) &&
      !oldMember.roles.cache.has(wv.roleVerifiedId)
    ) {
      await stripWelcomeUnverifiedRoles(guild, newMember.id, { passes: 2 }).catch(() => null);
    }

    const oldNick = oldMember.nickname ?? null;
    const newNick = newMember.nickname ?? null;
    const nicknameChanged = oldNick !== newNick;

    if (added.size === 0 && removed.size === 0 && !nicknameChanged) return;

    const formatRole = (role) => `<@&${role.id}> (\`${role.name}\` / \`${role.id}\`)`;

    if (added.size || removed.size) {
      const roleLines = [`**Membre :** ${newMember.user.tag} (<@${newMember.id}>)`];
      if (added.size) {
        const first = added.first();
        const extra = added.size > 1 ? ` *(+${added.size - 1} autre(s) ajoute(s) en meme temps)*` : "";
        roleLines.push(`**Role ajoute :** ${formatRole(first)}${extra}`);
      }
      if (removed.size) {
        const first = removed.first();
        const extra = removed.size > 1 ? ` *(+${removed.size - 1} autre(s) retire(s) en meme temps)*` : "";
        roleLines.push(`**Role retire :** ${formatRole(first)}${extra}`);
      }
      const roleEmbed = baseEmbed("Roles membre mis a jour", 0x5865f2).setDescription(roleLines.join("\n"));
      await sendServerLog(guild, roleEmbed, "message");
    }

    if (nicknameChanged) {
      const nickEmbed = baseEmbed("Pseudo membre mis a jour", 0x57f287).setDescription(
        [
          `**Membre :** ${newMember.user.tag} (<@${newMember.id}>)`,
          `**Pseudo avant :** ${oldNick ?? "*(aucun)*"}`,
          `**Pseudo apres :** ${newNick ?? "*(aucun)*"}`
        ].join("\n")
      );
      await sendServerLog(guild, nickEmbed, "message");
    }
  }
};
