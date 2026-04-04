const {SlashCommandBuilder, PermissionFlagsBits, GuildVerificationLevel, MessageFlags} = require("discord.js");

const LEVEL_FR = {
  [GuildVerificationLevel.None]: "Aucun",
  [GuildVerificationLevel.Low]: "Faible (e-mail verifie)",
  [GuildVerificationLevel.Medium]: "Moyen",
  [GuildVerificationLevel.High]: "Eleve",
  [GuildVerificationLevel.VeryHigh]: "Le plus eleve — **numero de telephone verifie** requis pour entrer"
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verification-telephone")
    .setDescription(
      "Active ou desactive l'exigence Discord : compte avec numero de telephone verifie pour rejoindre"
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("activer")
        .setDescription(
          "Met le niveau max : seuls les comptes avec telephone verifie peuvent rejoindre le serveur"
        )
    )
    .addSubcommand((s) =>
      s
        .setName("desactiver")
        .setDescription("Repasser au niveau Faible (e-mail verifie sur le compte Discord)")
    )
    .addSubcommand((s) => s.setName("etat").setDescription("Afficher le niveau de verification actuel")),
  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content:
          "Le bot doit avoir la permission **Gerer le serveur** pour modifier le niveau de verification.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "etat") {
      const name = LEVEL_FR[guild.verificationLevel] ?? String(guild.verificationLevel);
      await interaction.reply({
        content: `Niveau actuel : **${name}**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (sub === "activer") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await guild.setVerificationLevel(
          GuildVerificationLevel.VeryHigh,
          `Par ${interaction.user.tag} — /verification-telephone activer`
        );
        await interaction.editReply({
          content:
            "**C'est active.** Discord exige maintenant un **numero de telephone verifie** sur le compte pour **rejoindre** ce serveur (comme dans Parametres du serveur > Securite > Niveau de verification > le plus eleve).\n\n" +
            "Les membres **deja presents** ne sont pas expulses ; ca s'applique aux **nouvelles** adhesions."
        });
      } catch (e) {
        await interaction.editReply({ content: `Impossible : ${e.message || e}` });
      }
      return;
    }

    if (sub === "desactiver") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await guild.setVerificationLevel(
          GuildVerificationLevel.Low,
          `Par ${interaction.user.tag} — /verification-telephone desactiver`
        );
        await interaction.editReply({
          content:
            "**Desactive.** Niveau repasse a **Faible** (e-mail verifie). Tu peux regler autrement dans **Parametres du serveur > Securite**."
        });
      } catch (e) {
        await interaction.editReply({ content: `Impossible : ${e.message || e}` });
      }
    }
  }
};
