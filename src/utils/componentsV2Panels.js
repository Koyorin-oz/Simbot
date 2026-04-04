const {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const { formatSC } = require("./currency");

const V2_MSG = {
  flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
  embeds: []
};

/** Couleur barre gauche demandée pour tous les panneaux V2. */
const ACCENT_COLOR = 0x1b1825;

function buildShopPanel(config, simbaCoins, timeLabel, selected, shopState = {}) {
  const canBuyCustomRole = shopState.canBuyCustomRole !== false;
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://shop-banner.png")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "## :star: Shop",
          "Bienvenue dans la boutique ! Ici, tu peux retrouver l'ensemble des choses que tu peux acheter avec tes Simba Coins !",
          "➜ Pour consulter les informations d'un article, utilise le menu déroulant.",
          "",
          `Tu possèdes actuellement **${formatSC(simbaCoins)} Simba Coins** • Aujourd'hui à **${timeLabel}**`
        ].join("\n")
      )
    );

  if (selected) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildShopDetailText(config, selected)));
  }

  const options = [
    {
      label: "☕ Café",
      value: "coffee",
      description: `Item inventaire • +${config.shop.coffeeBoostRangePct[0]}-${config.shop.coffeeBoostRangePct[1]}%`
    },
    {
      label: "👑 Couronne",
      value: "crown",
      description: `Boost permanent • ${formatSC(config.shop.crownPrice)} SC`
    },
    {
      label: "🗃️ Tirelire Simba",
      value: "piggy",
      description: `Boost permanent • ${formatSC(config.shop.piggyPrice)} SC`
    }
  ];
  if (canBuyCustomRole) {
    options.push({
      label: "🧩 Role Perso",
      value: "custom_role",
      description: `Item inventaire • ${formatSC(config.shop.customRolePrice)} SC`
    });
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("shop_item").setPlaceholder("Choisir un article.").addOptions(options)
  );

  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shop_buy").setLabel("Acheter").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("shop_refresh").setLabel("Rafraichir").setStyle(ButtonStyle.Secondary)
  );

  container.addActionRowComponents(selectRow, buttonsRow);
  return { components: [container], ...V2_MSG };
}

/** Jours moyens par mois (année grégorienne) pour convertir j → mois. */
const AVG_DAYS_PER_MONTH = 365.25 / 12;

/**
 * Estime le temps pour se payer la Tirelire : récompenses fixes + messages SC/jour (hors café / vocal).
 * @param {typeof import("../config")} config
 */
function buildPiggyGrindEstimateText(config) {
  const price = config.shop.piggyPrice;
  const opts = config.rewards.dailyOptions;
  const avgJournalier = opts.reduce((a, b) => a + b, 0) / opts.length;
  const minJournalier = Math.min(...opts);
  const { weekly, monthly } = config.rewards;
  /** Équivalent « lissé » /jour : journalier + hebdo + mensuel (même logique que l’ancien 24h mais ici on parle d’ordre de grandeur). */
  const cmdPerDayAvg = avgJournalier + weekly / 7 + monthly / AVG_DAYS_PER_MONTH;
  const cmdPerDayWorst = minJournalier + weekly / 7 + monthly / AVG_DAYS_PER_MONTH;
  const [scLo, scHi] = config.economy.messageGain.sc;
  const avgScPerMessage = (scLo + scHi) / 2;
  /** Milieu de la fourchette « 2–3 messages » / jour qui donnent des SC. */
  const msgScPerDay23 = 2.5 * avgScPerMessage;

  const daysTypical23 = Math.max(1, Math.ceil(price / (cmdPerDayAvg + msgScPerDay23)));
  const days45AvgFast = Math.max(1, Math.ceil(price / (cmdPerDayAvg + 5 * avgScPerMessage)));
  const days45AvgSlow = Math.max(1, Math.ceil(price / (cmdPerDayAvg + 4 * avgScPerMessage)));
  const daysPessimistic = Math.max(1, Math.ceil(price / (cmdPerDayWorst + 2 * avgScPerMessage)));
  const daysPess45Fast = Math.max(1, Math.ceil(price / (cmdPerDayWorst + 5 * avgScPerMessage)));
  const daysPess45Slow = Math.max(1, Math.ceil(price / (cmdPerDayWorst + 4 * avgScPerMessage)));
  const moisTypical23 = (daysTypical23 / AVG_DAYS_PER_MONTH).toFixed(1);
  const moisPess = (daysPessimistic / AVG_DAYS_PER_MONTH).toFixed(1);
  const d45aMin = Math.min(days45AvgFast, days45AvgSlow);
  const d45aMax = Math.max(days45AvgFast, days45AvgSlow);
  const d45pMin = Math.min(daysPess45Fast, daysPess45Slow);
  const d45pMax = Math.max(daysPess45Fast, daysPess45Slow);
  const mois45aMin = (d45aMin / AVG_DAYS_PER_MONTH).toFixed(1);
  const mois45aMax = (d45aMax / AVG_DAYS_PER_MONTH).toFixed(1);
  const mois45pMin = (d45pMin / AVG_DAYS_PER_MONTH).toFixed(1);
  const mois45pMax = (d45pMax / AVG_DAYS_PER_MONTH).toFixed(1);

  return (
    `\n\n**Temps pour se la payer (ordre de grandeur)**\n` +
    `Hypothèses : **/journalier**, **/hebdomadaire**, **/mensuel** réclamés dès que possible ; messages qui **donnent des SC** ; **sans** café ni vocal.\n` +
    `• **~2–3 messages**/jour — journalier en moyenne (~**${Math.round(avgJournalier)}** SC/j) : **~${daysTypical23} j** (~**${moisTypical23} mois**). Journalier souvent au min (**${minJournalier}** SC) : **~${daysPessimistic} j** (~**${moisPess} mois**).\n` +
    `• **~4–5 messages**/jour — journalier en moyenne : **~${d45aMin}–${d45aMax} j** (~**${mois45aMin}–${mois45aMax} mois**). Journalier au min : **~${d45pMin}–${d45pMax} j** (~**${mois45pMin}–${mois45pMax} mois**).`
  );
}

function buildShopDetailText(config, selected) {
  if (selected === "coffee") {
    return (
      `### ☕ Café\n` +
      `Prix: **${formatSC(config.shop.coffeePrice)} SC**\n` +
      `Boost: **+${config.shop.coffeeBoostRangePct[0]}% a +${config.shop.coffeeBoostRangePct[1]}%**\n` +
      `Duree: **${config.shop.coffeeMinutesRange[0]} a ${config.shop.coffeeMinutesRange[1]} minutes**\n` +
      "Le cafe est stocke dans l'inventaire. Utilisation manuelle via `/inventaire` (cooldown 10 min)."
    );
  }
  if (selected === "crown") {
    return `### 👑 Couronne\nPrix: **${formatSC(config.shop.crownPrice)} SC**\n+15% gains LP & SP permanent (vocal + écrit).`;
  }
  if (selected === "piggy") {
    return (
      `### 🗃️ Tirelire Simba\n` +
      `Prix: **${formatSC(config.shop.piggyPrice)} SC**\n` +
      `+**${config.shop.piggyBoostPct}%** gains SC permanents (vocal + écrit).` +
      buildPiggyGrindEstimateText(config)
    );
  }
  if (selected === "custom_role") {
    return `### 🧩 Role Perso\nPrix: **${formatSC(config.shop.customRolePrice)} SC**\nAjoute un item dans l'inventaire. Utilise-le via \`/inventaire\` pour ouvrir le popup de creation.`;
  }
  return "Article inconnu.";
}

const LEADERBOARD_HEADINGS = {
  lp: "Classement LP (Level Points)",
  sc: "Classement SC (Simba Coins)",
  sp: "Classement SP (Simba Points)"
};

function leaderboardLineName(guild, userId) {
  if (!guild?.members) return `Utilisateur`;
  const m = guild.members.cache.get(userId);
  if (m) {
    const n = String(m.displayName || m.user?.username || "").trim();
    if (n) return n;
  }
  return `Utilisateur (\`${userId}\`)`;
}

/**
 * @param {"sc"|"sp"|"lp"} metric
 * @param {number} rank
 * @param {string} userId
 * @param {number} value
 */
function formatLeaderboardViewerPlacement(guild, metric, rank, userId, value) {
  const metricLabel = metric.toUpperCase();
  const name = leaderboardLineName(guild, userId);
  const display = metric === "sc" ? `${formatSC(value)} SC` : `${Number(value).toLocaleString("fr-FR")} ${metricLabel}`;
  return `**Ta place : #${rank}** — ${name} — **${display}**`;
}

/**
 * @param {"sc"|"sp"|"lp"} metric
 * @param {number} page
 * @param {object[]} users
 * @param {import("discord.js").Guild|null} guild Pour afficher le pseudo sans @mention (pas de ping).
 * @param {string|null} [viewerPlacementFooter] Ligne affichée sous le top 10 (classement du membre).
 */
function buildLeaderboardPanel(metric, page, users, guild = null, viewerPlacementFooter = null) {
  const metricLabel = metric.toUpperCase();
  const heading = LEADERBOARD_HEADINGS[metric] || `Classement ${metricLabel}`;
  const lines = users.length
    ? users.map((u, i) => {
        const value = getMetricValue(u, metric);
        const display = metric === "sc" ? `${formatSC(value)} SC` : `${Number(value).toLocaleString("fr-FR")} ${metricLabel}`;
        const name = leaderboardLineName(guild, u.userId);
        return `**#${page * 10 + i + 1}** ${name} — **${display}**`;
      })
    : ["Aucune donnée."];

  const body = [`## :trophy: ${heading}`, lines.join("\n")];
  if (viewerPlacementFooter) body.push("", "---", viewerPlacementFooter);
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body.join("\n"))
  );

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb:prev:${metric}:${page}`)
      .setLabel("Precedent")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`lb:next:${metric}:${page}`).setLabel("Suivant").setStyle(ButtonStyle.Secondary).setDisabled(users.length < 10),
    new ButtonBuilder()
      .setCustomId("lb:sc:0")
      .setLabel("SC (Simba Coins)")
      .setStyle(metric === "sc" ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lb:sp:0")
      .setLabel("SP (Simba Points)")
      .setStyle(metric === "sp" ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lb:lp:0")
      .setLabel("LP (Level Points)")
      .setStyle(metric === "lp" ? ButtonStyle.Success : ButtonStyle.Primary)
  );

  container.addActionRowComponents(controls);
  return {
    components: [container],
    ...V2_MSG,
    /** Pas de notification ping pour les <@id> dans le classement. */
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false }
  };
}

function buildModlogPanel(target, sanctions) {
  const text = sanctions.length
    ? sanctions
        .map((s, i) => `**${i + 1}.** #${s.id} • **${s.type}** • ${s.reason}\n<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>`)
        .join("\n")
    : "Aucune sanction.";

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## :bookmark_tabs: ModLog de ${target.tag}\n${text}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("modlog_delete").setLabel("Supprimer une sanction").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("modlog_edit").setLabel("Modifier une sanction").setStyle(ButtonStyle.Primary)
  );
  container.addActionRowComponents(row);

  return { components: [container], ...V2_MSG };
}

function buildModeratorProfilePanel(moderator, view) {
  const safeTag = moderator?.tag || moderator?.username || moderator?.id || "Moderateur";
  const modId = moderator?.id || "0";
  const filter = view?.filter || "ALL";
  const counts = view?.counts || { BAN: 0, WARN: 0, MUTE: 0, KICK: 0 };
  const total = Number(view?.total || 0);
  const sanctions = Array.isArray(view?.sanctions) ? view.sanctions : [];

  const filterLabel = filter === "ALL" ? "ENTIER" : filter;
  const listText = sanctions.length
    ? sanctions
        .map(
          (s, i) =>
            `**${i + 1}.** #${s.id} • **${s.type}** • cible <@${s.userId}> • ${s.reason}\n<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>`
        )
        .join("\n")
    : "Aucune sanction pour ce filtre.";

  const content = [
    `## :shield: Profil moderateur - ${safeTag}`,
    `Moderateur: <@${modId}> (\`${modId}\`)`,
    `Total (BAN/WARN/MUTE/KICK): **${total}**`,
    `BAN: **${counts.BAN || 0}** • WARN: **${counts.WARN || 0}** • MUTE: **${counts.MUTE || 0}** • KICK: **${counts.KICK || 0}**`,
    "",
    `### Filtre actif: **${filterLabel}**`,
    listText
  ].join("\n");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`modprof:BAN:${modId}`)
      .setLabel("BAN")
      .setStyle(filter === "BAN" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`modprof:WARN:${modId}`)
      .setLabel("WARN")
      .setStyle(filter === "WARN" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`modprof:MUTE:${modId}`)
      .setLabel("MUTE")
      .setStyle(filter === "MUTE" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`modprof:KICK:${modId}`)
      .setLabel("KICK")
      .setStyle(filter === "KICK" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`modprof:ALL:${modId}`)
      .setLabel("ENTIER")
      .setStyle(filter === "ALL" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addActionRowComponents(row);

  return { components: [container], ...V2_MSG };
}

function getMetricValue(user, metric) {
  if (metric === "sc") return user.simbaCoins;
  if (metric === "sp") return user.simbaPoints;
  return user.levelPoints;
}

module.exports = {
  ACCENT_COLOR,
  V2_MSG,
  buildShopPanel,
  buildShopDetailText,
  buildLeaderboardPanel,
  formatLeaderboardViewerPlacement,
  buildModlogPanel,
  buildModeratorProfilePanel,
  getMetricValue
};
