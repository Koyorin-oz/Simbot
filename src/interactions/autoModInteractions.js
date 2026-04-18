const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags
} = require("discord.js");
const {
  getGuildAutoModPayload,
  parseWordsInput,
  upsertCategoryWords,
  setGuildAutoModEnabled,
  invalidateGuildCache
} = require("../services/autoModService");
const { buildAutoModEmbed, buildAutoModRows, BTN_MODAL, BTN_TOGGLE, BTN_LIST, BTN_REFRESH, SELECT_DEL } = require("../utils/autoModPanel");
const {
  getModerationCommandRoleId,
  getCommandOwnerBypassUserId
} = require("../services/staffCommandPermissionsService");
const { logApiError } = require("../utils/botLogger");

const MODAL_SUBMIT = "automod:submit";

async function prismaEnsureGuildRow(prisma, guildId) {
  const row = await prisma.autoModGuild.findUnique({ where: { guildId } });
  if (!row) {
    await prisma.autoModGuild.create({ data: { guildId, enabled: false } });
    invalidateGuildCache(guildId);
  }
}

function canConfigureAutoMod(interaction) {
  const owner = String(getCommandOwnerBypassUserId() || "").trim();
  if (owner && interaction.user?.id === owner) return true;
  return Boolean(interaction.member?.roles?.cache?.has(getModerationCommandRoleId()));
}

async function replyDenied(interaction) {
  const p = {
    content: "Réservé au **staff modération** du bot (ou propriétaire autorisé).",
    flags: MessageFlags.Ephemeral
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(p).catch(() => null);
  else await interaction.reply(p).catch(() => null);
}

function buildEditModal() {
  const modal = new ModalBuilder().setCustomId(MODAL_SUBMIT).setTitle("Auto-mod — catégorie");

  const nameInput = new TextInputBuilder()
    .setCustomId("automod_category")
    .setLabel("Nom de la catégorie (ex. Raciste, Insultes)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);

  const wordsInput = new TextInputBuilder()
    .setCustomId("automod_words")
    .setLabel("Mots ou URL (cat. « LIEN autorise » = liens permis)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);

  return modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(wordsInput)
  );
}

async function refreshPanelMessage(interaction, client) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const payload = await getGuildAutoModPayload(client.prisma, guildId);
  const embed = buildAutoModEmbed(payload);
  const components = buildAutoModRows(payload);
  const data = { embeds: [embed], components };

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.update(data);
      return;
    }
    if (interaction.message && typeof interaction.message.edit === "function") {
      await interaction.message.edit(data);
      return;
    }
    await interaction.editReply(data);
  } catch (err) {
    const code = err?.code;
    if (code === 10008 || code === 10062) {
      await interaction
        .followUp({
          content:
            "Impossible de mettre à jour le panneau (message supprimé ou interaction expirée). Relance `/settings-auto-moderation panel`.",
          flags: MessageFlags.Ephemeral
        })
        .catch(() => null);
      return;
    }
    logApiError("AUTOMOD_REFRESH", err, { maxDetailChars: 300 });
  }
}

/**
 * @returns {Promise<boolean>}
 */
async function handleAutoModInteraction(client, interaction) {
  if (!interaction.inGuild()) return false;

  const id = interaction.customId;
  const isOur =
    (interaction.isButton() && [BTN_MODAL, BTN_TOGGLE, BTN_LIST, BTN_REFRESH].includes(id)) ||
    (interaction.isModalSubmit() && id === MODAL_SUBMIT) ||
    (interaction.isStringSelectMenu() && id === SELECT_DEL);

  if (!isOur) return false;

  if (!canConfigureAutoMod(interaction)) {
    await replyDenied(interaction);
    return true;
  }

  try {
    if (interaction.isButton() && id === BTN_MODAL) {
      await interaction.showModal(buildEditModal());
      return true;
    }

    if (interaction.isButton() && id === BTN_TOGGLE) {
      await interaction.deferUpdate();
      const guildId = interaction.guildId;
      const payload = await getGuildAutoModPayload(client.prisma, guildId);
      await setGuildAutoModEnabled(client.prisma, guildId, !payload.enabled);
      await refreshPanelMessage(interaction, client);
      return true;
    }

    if (interaction.isButton() && id === BTN_REFRESH) {
      await interaction.deferUpdate();
      await refreshPanelMessage(interaction, client);
      return true;
    }

    if (interaction.isButton() && id === BTN_LIST) {
      const payload = await getGuildAutoModPayload(client.prisma, interaction.guildId);
      const chunks = [];
      for (const c of payload.categories) {
        const preview = c.terms.slice(0, 35).join(", ");
        const more = c.terms.length > 35 ? ` … (+${c.terms.length - 35})` : "";
        const nm = String(c.name).slice(0, 55);
        chunks.push(`**${nm}** (${c.terms.length}) : ${preview || "—"}${more}`.slice(0, 320));
      }
      const body = chunks.length ? chunks.join("\n\n") : "_Aucune catégorie._";
      const head = "## Listes auto-mod\n";
      await interaction.reply({
        content: `${head}${body}`.slice(0, 2000),
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    if (interaction.isStringSelectMenu() && id === SELECT_DEL) {
      await interaction.deferUpdate();
      const raw = String(interaction.values?.[0] || "");
      const m = /^del:(\d+)$/.exec(raw);
      if (!m) {
        await interaction.followUp({ content: "Sélection invalide.", flags: MessageFlags.Ephemeral }).catch(() => null);
        return true;
      }
      const catId = Number(m[1]);
      const guildId = interaction.guildId;
      const row = await client.prisma.autoModCategory.findFirst({
        where: { id: catId, guildId }
      });
      if (!row) {
        await interaction.followUp({ content: "Catégorie introuvable.", flags: MessageFlags.Ephemeral }).catch(() => null);
        await refreshPanelMessage(interaction, client);
        return true;
      }
      await client.prisma.autoModCategory.delete({ where: { id: catId } });
      invalidateGuildCache(guildId);
      await refreshPanelMessage(interaction, client);
      return true;
    }

    if (interaction.isModalSubmit() && id === MODAL_SUBMIT) {
      const guildId = interaction.guildId;
      const catName = interaction.fields.getTextInputValue("automod_category");
      const wordsRaw = interaction.fields.getTextInputValue("automod_words");
      const words = parseWordsInput(wordsRaw);
      if (words.length === 0) {
        await interaction.reply({
          content: "Aucun terme valide. Ajoute des mots (ligne ou virgule).",
          flags: MessageFlags.Ephemeral
        });
        return true;
      }
      await upsertCategoryWords(client.prisma, guildId, catName, words);
      await prismaEnsureGuildRow(client.prisma, guildId);
      const on = (await getGuildAutoModPayload(client.prisma, guildId)).enabled;
      await interaction.reply({
        content: `Catégorie **${String(catName).trim()}** enregistrée : **${words.length}** terme(s). Auto-mod : **${on ? "activée" : "désactivée"}** — utilise **Activer** sur le panneau si besoin.`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
  } catch (e) {
    logApiError("AUTOMOD_UI", e, { maxDetailChars: 500 });
    const msg = e?.message?.includes("Limite") ? e.message : "Erreur en enregistrant l’auto-mod.";
    if (interaction.isModalSubmit() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else if (interaction.deferred) {
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return true;
  }

  return false;
}

module.exports = { handleAutoModInteraction, buildEditModal, MODAL_SUBMIT };
