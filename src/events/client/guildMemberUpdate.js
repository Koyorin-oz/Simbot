const { sendModLog, baseEmbed } = require("../../services/modLogService");
const { recordNativeMuteFromAudit } = require("../../services/moderatorProfileService");
const config = require("../../config");
const { stripWelcomeUnverifiedRoles } = require("../../services/welcomeVerifyService");

module.exports = {
  name: "guildMemberUpdate",
  async execute(client, oldMember, newMember) {
    await recordNativeMuteFromAudit(client, oldMember, newMember).catch(() => null);

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
    const lines = [`**Membre :** ${newMember.user.tag} (<@${newMember.id}>)`];

    /**
     * On n'affiche que le/les roles CHANGES lors de cet event (diff old vs new),
     * jamais la liste complete des roles du membre.
     * Si plusieurs roles ajoutes/retires en meme temps (onboarding, auto-role, bulk bot),
     * on ne montre que le 1er + compteur « +N autres » pour garder un log propre.
     */
    if (added.size) {
      const first = added.first();
      const extra = added.size > 1 ? ` *(+${added.size - 1} autre(s) ajoute(s) en meme temps)*` : "";
      lines.push(`**Role ajoute :** ${formatRole(first)}${extra}`);
    }
    if (removed.size) {
      const first = removed.first();
      const extra = removed.size > 1 ? ` *(+${removed.size - 1} autre(s) retire(s) en meme temps)*` : "";
      lines.push(`**Role retire :** ${formatRole(first)}${extra}`);
    }
    if (nicknameChanged) {
      lines.push(`**Pseudo avant :** ${oldNick ?? "*(aucun)*"}`);
      lines.push(`**Pseudo apres :** ${newNick ?? "*(aucun)*"}`);
    }

    const title = nicknameChanged && added.size === 0 && removed.size === 0
      ? "Pseudo membre mis a jour"
      : "Membre mis a jour";
    const e = baseEmbed(title, 0x57f287).setDescription(lines.join("\n"));
    await sendModLog(guild, e);
  }
};
