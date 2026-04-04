const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");
const config = require("../config");
const { getRankFromSp } = require("./economyService");

const RANKS_ANCHOR_ROLE_ID_A = "1238420772888772638";
const RANKS_ANCHOR_ROLE_ID_B = "1233349823244275862";
const FORCED_RANK_ORDER_BOTTOM_TO_TOP = [
  "hyene_1",
  "hyene_2",
  "hyene_3",
  "pumba_1",
  "pumba_2",
  "pumba_3",
  "shenzi_1",
  "shenzi_2",
  "shenzi_3",
  "timon_1",
  "timon_2",
  "timon_3",
  "nala_1",
  "nala_2",
  "nala_3",
  "scar",
  "cardinal"
];

function rankRolePermissionOverwrites(rankKey) {
  if (rankKey === "scar" || rankKey === "cardinal") {
    return [PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.UseExternalEmojis];
  }
  return [];
}

async function ensureScarCardinalGifPerms(role, rankKey) {
  const extra = rankRolePermissionOverwrites(rankKey);
  if (!extra.length || !role.editable) return;
  const need = new PermissionsBitField(extra);
  if (role.permissions.has(need)) return;
  const merged = new PermissionsBitField(role.permissions.bitfield).add(need);
  await role.edit({ permissions: merged }, "Permissions GIF rang eleve").catch(() => null);
}

const RANK_STYLE_BY_KEY = {
  hyene_1: { color: "#6E6E73", emoji: "⚙️" },
  hyene_2: { color: "#7A7A80", emoji: "⚙️" },
  hyene_3: { color: "#8A8A90", emoji: "⚙️" },
  pumba_1: { color: "#8C5A2B", emoji: "🟤" },
  pumba_2: { color: "#A36832", emoji: "🟤" },
  pumba_3: { color: "#C27A3E", emoji: "🟤" },
  shenzi_1: { color: "#C8C4CE", emoji: "⚪" },
  shenzi_2: { color: "#D8D4DE", emoji: "⚪" },
  shenzi_3: { color: "#E8E4EE", emoji: "⚪" },
  timon_1: { color: "#D9B43B", emoji: "🟨" },
  timon_2: { color: "#E3BE47", emoji: "🟨" },
  timon_3: { color: "#F0CA55", emoji: "🟨" },
  nala_1: { color: "#7EC8E8", emoji: "💎" },
  nala_2: { color: "#5EB8E0", emoji: "💎" },
  nala_3: { color: "#46A8D8", emoji: "💎" },
  scar: { color: "#5C1018", emoji: "🩸" },
  cardinal: { color: "#3958D8", emoji: "👑" }
};

function buildLegacyDeletableNames() {
  const out = new Set();
  const add = (s) => out.add(normalizeRankName(s));

  const oldLabels = ["Fer", "Bronze", "Argent", "Or", "Platine", "Diamant"];
  for (const fr of oldLabels) {
    for (const n of [1, 2, 3]) add(`${fr} ${n}`);
    for (const r of ["I", "II", "III"]) add(`${fr} ${r}`);
  }
  for (const t of ["Pumba", "Timon", "Mufasa", "Simba"]) add(t);
  add("Scar");
  add("Sarabi");

  for (const n of [1, 2, 3]) {
    add(`Hyene ${n}`);
    add(`Hyène ${n}`);
  }
  for (const r of ["I", "II", "III"]) {
    add(`Hyene ${r}`);
    add(`Hyène ${r}`);
  }

  for (const base of ["Pumba", "Shenzi", "Timon", "Nala"]) {
    for (const n of [1, 2, 3]) add(`${base} ${n}`);
  }

  return out;
}

const LEGACY_DELETABLE_NAMES = buildLegacyDeletableNames();

function ensureRankRoleCache(client) {
  if (!client.rankRoleMapByGuild) client.rankRoleMapByGuild = new Map();
}

async function ensureRankRolesForGuild(client, guild) {
  ensureRankRoleCache(client);

  const mapping = {};
  for (const tier of config.rankSystem.thresholds) {
    const configuredId = config.rankSystem.roleMap?.[tier.key];
    let role = configuredId ? guild.roles.cache.get(configuredId) : null;
    const styledName = buildStyledRankName(tier.key, tier.name);

    if (!role) {
      role = guild.roles.cache.find((r) => normalizeRankName(r.name) === normalizeRankName(styledName)) || null;
    }
    if (!role && tier.key === "scar") {
      role = guild.roles.cache.find((r) => normalizeRankName(r.name) === "scar") || null;
    }

    if (!role) {
      // eslint-disable-next-line no-await-in-loop
      role = await guild.roles
        .create({
          name: styledName,
          color: RANK_STYLE_BY_KEY[tier.key]?.color,
          mentionable: false,
          permissions: rankRolePermissionOverwrites(tier.key),
          reason: "Creation auto des roles de rang"
        })
        .catch(() => null);
    }

    if (role) {
      mapping[tier.key] = role.id;

      if (role.editable) {
        const style = RANK_STYLE_BY_KEY[tier.key];
        const shouldRename = role.name !== styledName;
        const shouldRecolor = style?.color && role.hexColor?.toUpperCase() !== style.color.toUpperCase();
        if (shouldRename || shouldRecolor) {
          // eslint-disable-next-line no-await-in-loop
          await role
            .edit(
              {
                name: styledName,
                color: style?.color || role.color
              },
              "Style auto des roles de rang"
            )
            .catch(() => null);
        }
        // eslint-disable-next-line no-await-in-loop
        await ensureScarCardinalGifPerms(role, tier.key);
      }
    }
  }

  await reorderRankRoles(guild, mapping);
  client.rankRoleMapByGuild.set(guild.id, mapping);
  return mapping;
}

function getRankRoleMap(client, guildId) {
  ensureRankRoleCache(client);
  return client.rankRoleMapByGuild.get(guildId) || config.rankSystem.roleMap || {};
}

async function syncRankRoleForMember(client, member, simbaPoints) {
  if (!member || member.user?.bot) return { ok: false, reason: "invalid_member" };
  let map = getRankRoleMap(client, member.guild.id);
  const rank = getRankFromSp(simbaPoints);
  let targetRoleId = map[rank.key];
  if (!targetRoleId) {
    // Lazy init: si la map n'est pas prête, on tente de créer/récupérer les rôles.
    await ensureRankRolesForGuild(client, member.guild).catch(() => null);
    map = getRankRoleMap(client, member.guild.id);
    targetRoleId = map[rank.key];
  }
  if (!targetRoleId) return { ok: false, reason: "missing_target_role", rankKey: rank.key };

  const allRankRoleIds = config.rankSystem.thresholds.map((t) => map[t.key]).filter(Boolean);
  if (!allRankRoleIds.length) return { ok: false, reason: "missing_rank_roles", rankKey: rank.key };

  const alreadyHadRole = member.roles.cache.has(targetRoleId);
  if (!alreadyHadRole) {
    const removeResult = await member.roles.remove(allRankRoleIds).then(() => true).catch(() => false);
    const addResult = await member.roles.add(targetRoleId).then(() => true).catch(() => false);
    if (!removeResult || !addResult) {
      return { ok: false, reason: "role_update_failed", rankKey: rank.key, roleId: targetRoleId };
    }
    return { ok: true, changed: true, rankKey: rank.key, roleId: targetRoleId };
  }
  return { ok: true, changed: false, rankKey: rank.key, roleId: targetRoleId };
}

async function ensureAllGuildRankRoles(client) {
  for (const guild of client.guilds.cache.values()) {
    // eslint-disable-next-line no-await-in-loop
    await ensureRankRolesForGuild(client, guild).catch(() => null);
  }
}

async function removeRankRolesForGuild(client, guild) {
  ensureRankRoleCache(client);
  const cached = client.rankRoleMapByGuild.get(guild.id) || {};
  const configuredIds = Object.values(config.rankSystem.roleMap || {}).filter(Boolean);
  const cachedIds = Object.values(cached).filter(Boolean);
  const possibleNames = new Set();

  for (const tier of config.rankSystem.thresholds) {
    const styled = buildStyledRankName(tier.key, tier.name);
    possibleNames.add(normalizeRankName(tier.name));
    possibleNames.add(normalizeRankName(styled));
    const legacyArabic = legacyArabicRankLabel(tier.key);
    if (legacyArabic) possibleNames.add(normalizeRankName(legacyArabic));
  }

  for (const n of LEGACY_DELETABLE_NAMES) possibleNames.add(n);

  const targets = guild.roles.cache.filter((role) => {
    const byId = configuredIds.includes(role.id) || cachedIds.includes(role.id);
    const byName = possibleNames.has(normalizeRankName(role.name));
    return role.id !== guild.id && role.editable && (byId || byName);
  });

  let deleted = 0;
  for (const role of targets.values()) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await role.delete("Suppression des roles de rang (commande admin)").then(() => true).catch(() => false);
    if (ok) deleted += 1;
  }

  client.rankRoleMapByGuild.delete(guild.id);
  return { deleted };
}

function buildStyledRankName(rankKey, baseName) {
  const emoji = RANK_STYLE_BY_KEY[rankKey]?.emoji;
  return emoji ? `${emoji} ${baseName}` : baseName;
}

function normalizeRankName(name) {
  return String(name).replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();
}

/** Anciens noms arabes (ex. Hyene 1, Fer 2) pour suppression admin. */
function legacyArabicRankLabel(rankKey) {
  const m = String(rankKey).match(/^(hyene|pumba|shenzi|timon|nala)_(1|2|3)$/i);
  if (m) {
    const base = { hyene: "Hyene", pumba: "Pumba", shenzi: "Shenzi", timon: "Timon", nala: "Nala" }[m[1].toLowerCase()];
    return base ? `${base} ${m[2]}` : null;
  }
  const old = String(rankKey).match(/^(fer|bronze|argent|or|platine|diamant)_(1|2|3)$/i);
  if (!old) return null;
  const base = { fer: "Fer", bronze: "Bronze", argent: "Argent", or: "Or", platine: "Platine", diamant: "Diamant" }[
    old[1].toLowerCase()
  ];
  return base ? `${base} ${old[2]}` : null;
}

async function reorderRankRoles(guild, map) {
  const fallbackBySp = [...config.rankSystem.thresholds]
    .sort((a, b) => a.minSp - b.minSp)
    .map((t) => t.key);
  const forcedKnown = FORCED_RANK_ORDER_BOTTOM_TO_TOP.filter((k) => fallbackBySp.includes(k));
  const missingKeys = fallbackBySp.filter((k) => !forcedKnown.includes(k));
  const orderedKeys = [...forcedKnown, ...missingKeys];

  const ids = orderedKeys.map((key) => map[key]).filter(Boolean);
  const roles = ids.map((id) => guild.roles.cache.get(id)).filter(Boolean);
  if (!roles.length) return;

  const anchorA = guild.roles.cache.get(RANKS_ANCHOR_ROLE_ID_A) || (await guild.roles.fetch(RANKS_ANCHOR_ROLE_ID_A).catch(() => null));
  const anchorB = guild.roles.cache.get(RANKS_ANCHOR_ROLE_ID_B) || (await guild.roles.fetch(RANKS_ANCHOR_ROLE_ID_B).catch(() => null));
  if (!anchorA || !anchorB) {
    console.warn("[RANK_ROLES] Anchors introuvables, reorder ignore.");
    return;
  }

  const nonEditable = roles.filter((r) => !r.editable);
  if (nonEditable.length) {
    console.warn("[RANK_ROLES] Certains roles de rank ne sont pas editables, reorder annule.");
    return;
  }

  const top = anchorA.position; // doit rester au-dessus des ranks
  let bottom = anchorB.position; // doit rester en dessous des ranks
  if (top <= bottom) {
    console.warn(
      `[RANK_ROLES] Mauvais ordre des ancres: top(${RANKS_ANCHOR_ROLE_ID_A})=${top} <= bottom(${RANKS_ANCHOR_ROLE_ID_B})=${bottom}. Reorder annule.`
    );
    return;
  }
  let freeSlotsBetween = Math.max(0, top - bottom - 1);
  if (roles.length > freeSlotsBetween) {
    const neededBottomPos = Math.max(1, top - roles.length - 1);
    if (!anchorB.editable) {
      console.warn(
        `[RANK_ROLES] Espace insuffisant entre anchors (${freeSlotsBetween} places, ${roles.length} roles) et ancre basse non editable. Reorder annule.`
      );
      return;
    }
    await guild.roles.setPositions([{ role: anchorB, position: neededBottomPos }]).catch(() => null);
    bottom = neededBottomPos;
    freeSlotsBetween = Math.max(0, top - bottom - 1);
    if (roles.length > freeSlotsBetween) {
      console.warn(
        `[RANK_ROLES] Espace toujours insuffisant apres deplacement ancre basse (${freeSlotsBetween} places, ${roles.length} roles). Reorder annule.`
      );
      return;
    }
  }

  // On colle le bloc de ranks juste sous l'ancre haute:
  // Cardinal finit en top-1, et l'ordre descend jusqu'aux Hyenes.
  let nextPos = top - roles.length;
  const positions = [];
  for (const role of roles) {
    positions.push({ role, position: nextPos });
    nextPos += 1;
  }

  await guild.roles.setPositions(positions).catch(() => null);
}

module.exports = {
  ensureRankRolesForGuild,
  ensureAllGuildRankRoles,
  syncRankRoleForMember,
  removeRankRolesForGuild,
  buildStyledRankName
};
