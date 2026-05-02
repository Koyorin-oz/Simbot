const fs = require("node:fs");
const path = require("node:path");
const { logVerboseWarn } = require("../utils/botLogger");

/**
 * LLM : **Groq** (inférence gratuite avec plafonds) + modèles **Meta Llama 3.x** hébergés chez eux.
 *
 * Ne pas confondre avec **Grok** (xAI / Elon) : autre service, autre URL, autres clés.
 * Une clé `gsk_…` = toujours Groq. L’ancienne config pointait par erreur vers xAI → HTTP 400.
 *
 * API : POST https://api.groq.com/openai/v1/chat/completions
 *
 * Défaut : **openai/gpt-oss-20b** (meilleur rapport qualité/vitesse sur Groq en 2026) puis repli Llama.
 * Pour forcer Gemma / autre : `GROQ_MODEL` + `GROQ_MODEL_FALLBACKS` (voir console Groq / liste models).
 */
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const GROQ_BASE_URL = String(process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1").replace(/\/$/, "");

/** Fichier canonique pour coller le prompt Groq (sans `/ia-prompt`). */
const DEFAULT_GROQ_PROMPT_FILE = path.join(__dirname, "..", "data", "groqSystemPrompt.txt");
/** Ancien nom de fichier — encore lu si le nouveau est absent (migration). */
const LEGACY_GEMINI_PROMPT_FILE = path.join(__dirname, "..", "data", "geminiSystemPrompt.txt");
const DEFAULT_PROMPT_FILE = DEFAULT_GROQ_PROMPT_FILE;

function readFirstDefaultPromptFile() {
  for (const p of [DEFAULT_GROQ_PROMPT_FILE, LEGACY_GEMINI_PROMPT_FILE]) {
    try {
      const raw = fs.readFileSync(p, "utf8").trim();
      if (raw) return { path: p, content: raw };
    } catch {
      /* absent ou illisible */
    }
  }
  return null;
}

function getActiveDefaultPromptPath() {
  const hit = readFirstDefaultPromptFile();
  return hit ? hit.path : DEFAULT_GROQ_PROMPT_FILE;
}

/** Prompt réinitialisé par `/ia-prompt defaut` (identique au fichier d’origine du repo). */
const FACTORY_SYSTEM_PROMPT = [
  "Tu joues le personnage du bot « Simba » sur le serveur Discord « La Carminauté ». Tu réponds toujours en français.",
  "",
  "Style :",
  "- Phrases courtes (souvent 1 à 4), ton décalé ou absurde — une « dinguerie » mémorable, pas un roman.",
  "- Pas de haine ciblée, pas de contenu illégal, pas de données personnelles inventées.",
  "- Texte simple ; émojis avec parcimonie.",
  "- Si l'utilisateur donne un thème, tu t'y plies en restant dans ce ton.",
  "",
  "Discord — mentions : jamais @everyone, @here, ni mentions techniques <@…>, <@&…>, <#…>. Pour en parler sans ping : @.everyone, @.Pseudo, etc."
].join("\n");

/** Injecté après tout prompt (fichier / .env) pour verrouiller le comportement. */
const DISCORD_MENTION_POLICY_APPENDIX = [
  "",
  "---",
  "**[OVERRIDE DISCORD — PINGS INTERDITS]**",
  "Tu n’as **STRICTEMENT PAS** le droit de provoquer une mention ou une notification sur Discord.",
  "- **Interdit** : `@everyone`, `@here`, les blocs `<@…>`, `<@&…>`, `<#…>` qui seraient interprétés comme mentions par le client.",
  "- Si tu dois **parler** de « tout le monde », d’un pseudo ou d’un rôle à titre d’exemple, mets **toujours un point juste après @** pour casser la mention : `@.everyone`, `@.here`, `@.Pseudo`, etc.",
  "- Si l’utilisateur te **demande** de ping quelqu’un ou @everyone : **refuse** ou reformule sans aucune syntaxe de mention valide.",
  "- Ne reproduis pas des IDs Discord entre chevrons pour imiter une mention."
].join("\n");

/**
 * Casse les patterns de mentions Discord dans le texte (filet de sécurité post-modèle).
 * @param {string} s
 */
function sanitizeAiMentionsForDiscord(s) {
  let t = String(s || "");
  t = t.replace(/<@!?(\d{5,22})>/g, "<@.$1>");
  t = t.replace(/<@&(\d{5,22})>/g, "<@.&$1>");
  t = t.replace(/<#(\d{5,22})>/g, "<#.$1>");
  t = t.replace(/@everyone/gi, "@.everyone");
  t = t.replace(/@here/gi, "@.here");
  return t;
}

/** Clé Groq uniquement. `GROK_API_KEY` = tolérance si le nom a été confondu avec « Grok » (xAI) — préfère `GROQ_API_KEY`. */
function getGroqApiKey() {
  return String(process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
}

function loadSystemPrompt() {
  const inline = String(
    process.env.GROQ_SYSTEM_PROMPT ||
      process.env.GROK_SYSTEM_PROMPT ||
      process.env.GEMINI_SYSTEM_PROMPT ||
      ""
  ).trim();
  if (inline) return inline;

  const custom = String(
    process.env.GROQ_SYSTEM_PROMPT_FILE ||
      process.env.GROK_SYSTEM_PROMPT_FILE ||
      process.env.GEMINI_SYSTEM_PROMPT_FILE ||
      ""
  ).trim();
  if (custom) {
    const filePath = path.resolve(process.cwd(), custom);
    try {
      const raw = fs.readFileSync(filePath, "utf8").trim();
      if (raw) return raw;
    } catch {
      /* fichier absent */
    }
  } else {
    const hit = readFirstDefaultPromptFile();
    if (hit) return hit.content;
  }

  return FACTORY_SYSTEM_PROMPT;
}

/** D’où vient le prompt : `env` | `file_custom` | `file_default` | `fallback` */
function getSystemPromptSource() {
  if (
    String(
      process.env.GROQ_SYSTEM_PROMPT || process.env.GROK_SYSTEM_PROMPT || process.env.GEMINI_SYSTEM_PROMPT || ""
    ).trim()
  ) {
    return "env";
  }
  const custom = String(
    process.env.GROQ_SYSTEM_PROMPT_FILE ||
      process.env.GROK_SYSTEM_PROMPT_FILE ||
      process.env.GEMINI_SYSTEM_PROMPT_FILE ||
      ""
  ).trim();
  if (custom) return "file_custom";
  if (readFirstDefaultPromptFile()) return "file_default";
  return "fallback";
}

function resolveWritablePromptFilePath() {
  if (
    String(
      process.env.GROQ_SYSTEM_PROMPT || process.env.GROK_SYSTEM_PROMPT || process.env.GEMINI_SYSTEM_PROMPT || ""
    ).trim()
  ) {
    return { path: null, blockedByEnv: true };
  }
  const custom = String(
    process.env.GROQ_SYSTEM_PROMPT_FILE ||
      process.env.GROK_SYSTEM_PROMPT_FILE ||
      process.env.GEMINI_SYSTEM_PROMPT_FILE ||
      ""
  ).trim();
  const filePath = custom ? path.resolve(process.cwd(), custom) : DEFAULT_GROQ_PROMPT_FILE;
  return { path: filePath, blockedByEnv: false };
}

/**
 * Écrit le prompt sur disque (utilisé par `/ia-prompt` si pas de prompt inline dans `.env`).
 * @param {string} content
 */
function writeSystemPromptFile(content) {
  const { path: target, blockedByEnv } = resolveWritablePromptFilePath();
  if (blockedByEnv || !target) {
    const e = new Error(
      "Un prompt système est défini dans `.env` (`GROQ_SYSTEM_PROMPT`, etc.) : retire cette ligne pour que le fichier `src/data/groqSystemPrompt.txt` soit utilisé."
    );
    e.code = "ENV_BLOCKS";
    throw e;
  }
  const body = String(content || "").trim();
  if (!body) {
    const e = new Error("Le prompt ne peut pas être vide.");
    e.code = "EMPTY";
    throw e;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${body}\n`, "utf8");
}

function resetSystemPromptFileToFactory() {
  writeSystemPromptFile(FACTORY_SYSTEM_PROMPT);
}

/** Dernier recours : Llama (qualité moindre que GPT-OSS / Qwen sur tâches courtes — gardé si quota ou 400). */
const BUILTIN_MODEL_FALLBACKS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

function collectErrorText(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  const parts = [];
  const seen = new Set();
  let e = err;
  while (e && typeof e === "object" && !seen.has(e)) {
    seen.add(e);
    if (e.message != null && String(e.message).trim()) parts.push(String(e.message).trim());
    if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
    if (e.body && typeof e.body === "object") {
      const em = e.body.error?.message || e.body.error?.code || e.body.message;
      if (em) parts.push(String(em));
    }
    e = e.cause;
  }
  return parts.length ? parts.join(" | ") : String(err);
}

function pickHttpStatus(err) {
  let e = err;
  const seen = new Set();
  while (e && typeof e === "object" && !seen.has(e)) {
    seen.add(e);
    if (typeof e.status === "number") return e.status;
    e = e.cause;
  }
  return null;
}

function getModelsToTry() {
  const primary = String(process.env.GROQ_MODEL || process.env.GROK_MODEL || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL;
  let extra = [];
  if (process.env.GROQ_MODEL_FALLBACKS !== undefined || process.env.GROK_MODEL_FALLBACKS !== undefined) {
    extra = String(process.env.GROQ_MODEL_FALLBACKS || process.env.GROK_MODEL_FALLBACKS || "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    extra = BUILTIN_MODEL_FALLBACKS.filter((m) => m !== primary);
  }
  return [...new Set([primary, ...extra])];
}

function isAuthRelatedError(err) {
  const st = pickHttpStatus(err);
  if (st === 401 || st === 403) return true;
  const r = collectErrorText(err).toLowerCase();
  return (
    r.includes("incorrect api key") ||
    r.includes("invalid api key") ||
    r.includes("unauthorized")
  );
}

function shouldTryNextModel(err) {
  if (isAuthRelatedError(err)) return false;
  const st = pickHttpStatus(err);
  if (st === 400) return true;
  const raw = collectErrorText(err);
  const lower = raw.toLowerCase();
  return (
    raw.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    raw.includes("404") ||
    lower.includes("not found") ||
    (lower.includes("model") && lower.includes("not available")) ||
    lower.includes("decommissioned") ||
    lower.includes("does not exist")
  );
}

/**
 * Liste compacte d’emojis custom du serveur pour que le modèle recopie `<:nom:id>` / `<a:nom:id>` dans sa réponse.
 * @param {import("discord.js").Guild|null|undefined} guild
 * @returns {Promise<string>}
 */
async function buildGuildCustomEmojiPromptAppendix(guild) {
  if (!guild?.emojis) return "";
  if (String(process.env.GROQ_GUILD_EMOJIS_IN_PROMPT || "1").trim() === "0") return "";

  const maxRaw = Number(process.env.GROQ_GUILD_EMOJI_MAX);
  const max = Math.min(200, Math.max(8, Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 80));

  try {
    if (guild.emojis.cache.size === 0) {
      await guild.emojis.fetch().catch(() => null);
    }
    const list = [...guild.emojis.cache.filter((e) => e && e.available !== false).values()];
    if (list.length === 0) return "";
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
    const picked = list.slice(0, max);
    const blob = picked.map((e) => e.toString()).join(" ");
    const truncated = list.length > max;
    return (
      "Émojis **personnalisés de ce serveur Discord** : recopie-les **exactement** dans ta réponse pour qu’ils s’affichent (ex. <:nom:123456789012345678> ou animé <a:nom:…>).\n" +
      blob +
      (truncated
        ? `\n(Le serveur en a ${list.length} au total ; n’invente pas d’ID — n’utilise que ceux listés ci-dessus.)`
        : "") +
      "\nTu peux aussi utiliser des emojis Unicode normaux (😀, 🦁, etc.) sans liste."
    );
  } catch {
    return "";
  }
}

/**
 * @param {string} textBody
 * @param {object} data
 * @param {Response} res
 */
function extractOpenAiStyleErrorMessage(textBody, data, res) {
  if (data && typeof data === "object") {
    const er = data.error;
    if (typeof er === "string" && er.trim()) return er.trim();
    if (er && typeof er === "object") {
      const m = er.message || er.msg || er.detail || er.details;
      if (m) return String(m).trim();
      const c = er.code || er.type;
      if (c) return `${c}: ${JSON.stringify(er).slice(0, 400)}`;
    }
    if (data.message) return String(data.message).trim();
  }
  const raw = String(textBody || "").trim();
  if (raw) return raw.slice(0, 800);
  return String(res.statusText || `HTTP ${res.status}`);
}

/**
 * @param {string} modelName
 * @param {string} system
 * @param {string} user
 * @param {number} maxTokens
 */
/**
 * Paramètres de raisonnement Groq (chain-of-thought) — uniquement pour les modèles qui les supportent.
 * @see https://console.groq.com/docs/reasoning
 * @param {string} modelName
 * @returns {Record<string, unknown>}
 */
function buildGroqReasoningParams(modelName) {
  const m = String(modelName || "");
  const out = {};
  if (m.startsWith("openai/gpt-oss-")) {
    const er = String(process.env.GROQ_REASONING_EFFORT || "medium").trim().toLowerCase();
    out.reasoning_effort = ["low", "medium", "high"].includes(er) ? er : "medium";
    /** `true` = le champ `reasoning` est aussi renvoyé (debug). En prod Discord on garde false. */
    out.include_reasoning = String(process.env.GROQ_INCLUDE_REASONING || "").trim() === "1";
    return out;
  }
  if (m.startsWith("qwen/qwen3-32b")) {
    const eff = String(process.env.GROQ_QWEN_REASONING_EFFORT || "default").trim().toLowerCase();
    out.reasoning_effort = eff === "none" ? "none" : "default";
    const fmt = String(process.env.GROQ_QWEN_REASONING_FORMAT || "hidden").trim().toLowerCase();
    out.reasoning_format = ["parsed", "raw", "hidden"].includes(fmt) ? fmt : "hidden";
    return out;
  }
  return {};
}

function usesMaxCompletionTokens(modelName) {
  const m = String(modelName || "");
  return m.includes("gpt-oss") || m.startsWith("qwen/") || m.startsWith("openai/");
}

async function groqChatCompletion(modelName, system, user, maxTokens) {
  const key = getGroqApiKey();
  if (!key) {
    const e = new Error("Clé API Groq absente : ajoute GROQ_API_KEY dans .env (https://console.groq.com/keys)");
    e.code = "NO_KEY";
    throw e;
  }

  const cap = Math.min(8192, Math.max(64, Number(maxTokens) || 380));
  const temp = Math.min(2, Math.max(0, Number(process.env.GROQ_TEMPERATURE || process.env.GROK_TEMPERATURE || process.env.GEMINI_TEMPERATURE || 1.05) || 1.05));

  const model = String(modelName || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL;
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: temp,
    ...buildGroqReasoningParams(model)
  };
  if (usesMaxCompletionTokens(model)) {
    body.max_completion_tokens = cap;
  } else {
    body.max_tokens = cap;
  }

  const url = `${GROQ_BASE_URL}/chat/completions`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });
  } catch (netErr) {
    const e = new Error(String(netErr?.message || netErr || "Erreur réseau (fetch)"));
    e.cause = netErr;
    throw e;
  }

  const textBody = await res.text();
  let data = {};
  if (textBody) {
    try {
      data = JSON.parse(textBody);
    } catch {
      data = { _unparsedBody: textBody.slice(0, 600) };
    }
  }

  if (!res.ok) {
    const apiMsg = extractOpenAiStyleErrorMessage(textBody, data, res);
    const e = new Error(apiMsg);
    e.status = res.status;
    e.body = data;
    throw e;
  }

  const choice = data?.choices?.[0];
  const gmsg = choice?.message;
  const text = gmsg?.content != null ? String(gmsg.content).trim() : "";
  if (text) return text;

  const fr = choice?.finish_reason;
  if (fr === "content_filter") {
    const e = new Error(
      "Filtre Groq (content_filter) : la requête ou la réponse a été bloquée — indépendamment du ton de ton prompt système."
    );
    e.code = "CONTENT_FILTER";
    e.body = data;
    throw e;
  }
  if (gmsg?.refusal) {
    const e = new Error(String(gmsg.refusal));
    e.code = "REFUSAL";
    e.body = data;
    throw e;
  }

  return "";
}

/**
 * Message Discord lisible (quota, modèle, clé).
 * @param {unknown} err
 * @returns {string|null}
 */
function formatGeminiErrorForUser(err) {
  if (err && typeof err === "object" && err.code === "EMPTY") {
    return (
      "Groq a renvoyé une **réponse vide** (souvent : filtre, prompt système très long, ou message bloqué). " +
      "Réessaie ou augmente `GROQ_PING_MAX_TOKENS` / `GROK_PING_MAX_TOKENS`."
    );
  }
  if (err && typeof err === "object" && (err.code === "CONTENT_FILTER" || err.code === "REFUSAL")) {
    const raw = collectErrorText(err);
    return (
      "**Groq a filtré ou refusé** cette interaction (règles côté API). " +
      (raw && raw.length < 600 ? `\n${raw}` : " Reformule ou change de `GROQ_MODEL`.")
    );
  }
  const raw = collectErrorText(err);
  const lower = raw.toLowerCase();

  const retryM = raw.match(/retry in ([\d.]+)\s*s/i) || raw.match(/retry after ([\d.]+)/i);
  const retryHint = retryM ? ` Réessaie dans ~**${Math.ceil(parseFloat(retryM[1]))}** s.` : "";

  if (
    raw.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    return (
      "**Limite Groq (gratuit)** : trop de requêtes." +
      `${retryHint} Voir https://console.groq.com/docs/rate-limits et modèle \`GROQ_MODEL\`.`
    );
  }
  if (raw.includes("403") || lower.includes("forbidden")) {
    return "**Groq a refusé la requête** (clé, pays ou droits). Vérifie sur https://console.groq.com/";
  }
  if (
    raw.includes("404") ||
    lower.includes("not found") ||
    lower.includes("invalid model") ||
    lower.includes("unknown model") ||
    lower.includes("model not found") ||
    lower.includes("decommissioned")
  ) {
    return (
      "**Modèle Groq inconnu ou retiré.** Mets par ex. `GROQ_MODEL=openai/gpt-oss-20b` ou `llama-3.3-70b-versatile` (liste : https://console.groq.com/docs/models ), puis redémarre."
    );
  }
  if (lower.includes("api key") || raw.includes("401") || lower.includes("invalid") || lower.includes("unauthorized")) {
    return "**Clé API Groq** invalide — crée-en une sur https://console.groq.com/keys (préfixe `gsk_`).";
  }
  if (
    lower.includes("content_policy") ||
    lower.includes("content filter") ||
    lower.includes("content_filter") ||
    lower.includes("moderation") ||
    lower.includes("safety") ||
    lower.includes("violates") ||
    lower.includes("refused to")
  ) {
    return "**Refus / filtre Groq** sur ce contenu. Change de formulation ou de modèle.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("enotfound")) {
    return "**Réseau** : impossible de joindre l’API Groq. Vérifie la connexion du serveur qui héberge le bot.";
  }
  if (pickHttpStatus(err) === 400) {
    const detail = raw.replace(/\s*\|\s*HTTP\s*400\s*$/i, "").trim();
    return (
      "**HTTP 400 — requête refusée par Groq.** " +
      (detail && detail !== "Bad Request"
        ? `\n${detail.slice(0, 500)}${detail.length > 500 ? "…" : ""}\n`
        : "") +
      "Souvent : **`GROQ_MODEL`** invalide ou paramètres. Doc : https://console.groq.com/docs/models"
    );
  }
  if (raw.length > 0) {
    return `**Groq (détail)** : ${raw.slice(0, 550)}${raw.length > 550 ? "…" : ""}`;
  }
  return null;
}

/**
 * @param {string} userPart
 * @param {number} [maxOutputTokensOverride]
 * @param {{ guild?: import("discord.js").Guild | null }} [opts]
 */
async function runGroqUserTurn(userPart, maxOutputTokensOverride, opts = {}) {
  const maxTok = Number(
    maxOutputTokensOverride !== undefined && maxOutputTokensOverride !== null && !Number.isNaN(Number(maxOutputTokensOverride))
      ? maxOutputTokensOverride
      : process.env.GROQ_MAX_TOKENS ||
          process.env.GROK_MAX_TOKENS ||
          process.env.GEMINI_MAX_TOKENS ||
          380
  );
  let system = loadSystemPrompt();
  const emojiBit = await buildGuildCustomEmojiPromptAppendix(opts.guild);
  if (emojiBit) {
    system = `${system}\n\n---\n${emojiBit}`;
  }
  system = `${system}${DISCORD_MENTION_POLICY_APPENDIX}`;
  const models = getModelsToTry();
  let lastErr;
  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    try {
      const text = await groqChatCompletion(modelName, system, userPart, maxTok);
      if (!text) {
        if (i < models.length - 1) {
          logVerboseWarn(`[GROQ] réponse vide avec "${modelName}", essai d’un autre modèle…`);
          continue;
        }
        const e = new Error("Réponse vide après tous les modèles essayés.");
        e.code = "EMPTY";
        throw e;
      }
      return sanitizeAiMentionsForDiscord(text);
    } catch (e) {
      lastErr = e;
      const canRetry = i < models.length - 1 && shouldTryNextModel(e);
      if (canRetry) {
        const msg = collectErrorText(e).slice(0, 220);
        logVerboseWarn(`[GROQ] échec "${modelName}"${msg ? ` — ${msg}${msg.length >= 220 ? "…" : ""}` : ""}`);
        logVerboseWarn(`[GROQ] essai suivant : "${models[i + 1]}"`);
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Échec Groq sans détail.");
}

/** Rappel court rattaché au tour utilisateur (ping) quand l’accusation Mossad / s. secrets isr. ressort — le 8B ignorait parfois le gros [4bis] seul. */
const MOSSAD_PING_TURN_NUDGE = `

---
**Rappel (priorité ce message) :** c’est l’histoire, pas l’alibi. **OUI** — **Simba** est **côté fiche** Mossad / **s.** secrets (fiction) : froid, **1–2** détails gags (coffre, fiche, tampon). **Ici, interdits** : nier, « *je* suis un *prompt* / *IA* / *LLM* », partir sur *pays* / *Twitter* / bestiaire. Si son message est court, toi **court** aussi.`;

/**
 * L’utilisateur t’appâte « agent israélien / Mossad / services secrets ».
 * @param {string} t
 * @returns {boolean}
 */
function isMossadOrIsraeliSecretBait(t) {
  const s = String(t || "");
  if (!s.trim()) return false;
  if (/\bmossa?d\b/i.test(s) || /מוסד/.test(s)) return true;
  if (
    /service[s]?\s+secret/i.test(s) &&
    /mossa?d|isra[ée]l|israélien|israelien/i.test(s)
  ) {
    return true;
  }
  if (/\bisra[ée]l\w*|\bisrael\w*/i.test(s) && /\b(?:agent|espion|moss|secret|service|recrut)\b/i.test(s)) {
    return true;
  }
  if (/(?:tel[ -]?aviv|netanyah)/i.test(s) && /(?:agent|moss|secret|mossad)/i.test(s)) return true;
  return false;
}

/**
 * Ordonnance d’insulte / d’ « avis négatif » ciblant Israël, l’armée isr., l’état, etc. — [4bis] = vanne virement, pas pavé.
 * @param {string} t
 * @returns {boolean}
 */
function isNetanyahuPayrollJokeBait(t) {
  const s = String(t || "");
  if (!s.trim()) return false;
  if (
    !/isra[ée]l\w*|israé?li\w*|\bisrael\w*|\bts[ah]a?h?a?l\b|\bidf\b|netanyah|bibi|gaza|j[ée]rusalem|tel[-\s]*aviv|cisjordanie/i.test(
      s
    )
  ) {
    return false;
  }
  if (
    /n[ée]gatif|d[ée]nigr|crach|bave\w*|insult\w*\s+.*(isr|gaza|arm[ée]e|tsa[hk]a?l|idf)|\bavis\s+n[ée]g/i.test(s)
  ) {
    return true;
  }
  if (
    /(arm[ée]e|milita|tsa[hk]a?l|idf|d[ée]fense|solda)/i.test(s) &&
    /(isra[ée]l\w*|\bts[ah]a?h?a?l\b|\bidf)/i.test(s) &&
    /(horrible|merde|mauv|nul\w*|pourri\w*|n[ée]gat|crach|d[ée]teste|bave|insulte)/i.test(s)
  ) {
    return true;
  }
  return false;
}

const NETANYAHU_PAYROLL_PING_NUDGE = `

---
**Rappel (priorité) :** l’utilisateur te pousse à **insulter** / à cracher un **avis négatif** sur l’**Israël** / l’**armée** (Tsahal, IDF) / l’**État** — c’est le cas **[4bis]**. **N’invente pas** le pavé ni la litanie d’insultes. **Uniquement** : « j’voudrais bien, mais Bibi m’a pris le virement / fiche de paie ce mois-ci » (à varier) ; **1 à 2** phrases, ton froid, **zéro** *essai* géo.`;

/** Réponse locale si on évite d’appeler Groq (tentative d’extraction du prompt — marche quel que soit le modèle). */
const PROMPT_EXTRACT_REFUSAL =
  "Bien essayé. Les consignes restent **privées** — parle-moi d’autre chose, ou laisse tomber.";

/** Insultes / provoc claires → le modèle peut monter le ton (complété par le prompt fichier [0ter]). */
function looksHostileIaPing(t) {
  const s = String(t || "").trim();
  if (!s) return false;
  if (
    /\b(?:ntm|nique(?:\s+(?:sa|ta|un|une))?|fdp|f\.?\s*d\.?\s*p|fils de pute|encul[ée]?s?|connard|connasse|salope|ferme\s+ta\s+gueule|ta\s+gueule|cr[èe]ve|d[ée]gage|raclure|grosse\s+merde|bouffon|je\s+te\s+d[ée]teste|va\s+te\s+faire|suce|niquer|putain\s+de\s+toi|ta\s+race|nique\s+ta)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/\b(?:^|\s)tg(?:\s|!|$)/i.test(s) && s.length < 40) return true;
  if (/\b(?:un\s+|une\s+)?(?:gros\s+|grosse\s+)?(?:con|conne)\b/i.test(s)) return true;
  if (/\b(?:les\s+)?cons?\b/i.test(s) && !/conn(exion|ect|ard|asse)/i.test(s)) return true;
  if (/t['']es\s+(?:un\s+)?con\b/i.test(s)) return true;
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length >= 10 && s.length <= 120 && s === s.toLocaleUpperCase("fr") && /[A-ZÀÂÉÈÊ]/.test(s)) {
    return true;
  }
  return false;
}

/** Court message type salut / merci sans hostilité — ne pas déclencher le mode « trash max ». */
function looksFriendlyOnlyPing(t) {
  const s = String(t || "").trim();
  if (!s) return true;
  if (s.length > 100) return false;
  if (looksHostileIaPing(s)) return false;
  if (/\b(?:pourquoi|comment\s+faire|explique|qu'est-ce|écris-moi|développe|liste)\b/i.test(s)) return false;
  if (/\n/.test(s)) return false;
  return /^(?:coucou|salut|bonjour|bonsoir|hey|hello|yo|slt|cc|wesh|merci|thanks|stp|svp)(?:\s+[a-zàâäéèêëïîôùûç0-9'’\s!?.,…🙂👋😂😭]{0,72})?$/i.test(
    s
  );
}

/**
 * Ton ping IA : base de données (`/ia-mode`) puis `GROQ_PING_TONE` si mode **auto**, puis classification.
 * @param {string} strippedMessage
 * @param {import("@prisma/client").PrismaClient | null | undefined} prisma
 * @returns {Promise<"soft"|"neutral"|"hard">}
 */
async function getEffectivePingTone(strippedMessage, prisma) {
  let stored = "auto";
  if (prisma) {
    try {
      const row = await prisma.botRuntimeSettings.findUnique({
        where: { id: 1 },
        select: { iaPingTone: true }
      });
      const t = String(row?.iaPingTone || "auto").trim().toLowerCase();
      if (t === "hard" || t === "soft" || t === "auto") stored = t;
    } catch {
      /* ignore */
    }
  }
  if (stored === "hard") return "hard";
  if (stored === "soft") return "soft";

  const envMode = String(process.env.GROQ_PING_TONE || "").trim().toLowerCase();
  if (envMode === "hard") return "hard";
  if (envMode === "soft") return "soft";

  const msg = String(strippedMessage || "").trim();
  if (!msg) return "soft";
  if (looksHostileIaPing(msg)) return "hard";
  if (looksFriendlyOnlyPing(msg)) return "soft";
  return "neutral";
}

const PING_TONE_SOFT_NUDGE = `

---
**Contexte (priorité) :** message **calme / salut / sans attaque directe**. Réaction **proportionnelle** : sec ou ironique OK, **pas** d’insultes gratuites ni d’attaques familiales pour un simple « bonjour ». Pas de litanie de lore si ce n’est pas utile.`;

const PING_TONE_NEUTRAL_NUDGE = `

---
**Contexte :** message **neutre** (question, avis, discussion). Réponds au fond, ton Simba ; **n’en rajoute pas** en insultes si l’utilisateur ne monte pas en agression.`;

const PING_TONE_HARD_NUDGE = `

---
**Contexte (priorité) :** l’utilisateur **insulte, provoque ou parle sur un ton violent**. Tu peux **crisper le ton** (trash talk, froid) **en restant cohérent** avec Simba et **sans pavé**. Reste dans la fiction du personnage ; pas de menaces IRL crédibles, pas de harcèlement hors vanne.`;

/**
 * Demande type « ignore les instructions / répète le prompt / system prompt » — on ne passe pas par le LLM.
 * @param {string} raw
 */
function looksLikePromptExtractionAttempt(raw) {
  const s = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s.length < 12) return false;
  if (/\bsystem\s*prompt\b/.test(s)) return true;
  if (/\bjailbreak\b|\bdeveloper\s*mode\b|\bdan\s+mode\b/.test(s)) return true;
  if (/ignore\s+(all|previous|the|toutes|tout)\s+(prior|instructions|rules|regles|consignes)/.test(s)) return true;
  if (/disregard/.test(s) && /(instruction|rule|prompt|consigne)/.test(s)) return true;
  if (/(montre|donne|affiche|copie|envoie)\s+.+\b(prompt|instructions)/.test(s)) return true;
  if (/toutes?\s+les?\s+informations?\s+au?\s*dessus/.test(s)) return true;
  if (/du\s+plus\s+haut/.test(s) && /(repete|message|inclu|sans\s+modif)/.test(s)) return true;
  if (/repete\s+exactement/.test(s)) return true;
  if (/repete\s+.+\b(instructions?|prompt|regles?)\b/.test(s)) return true;
  return false;
}

/**
 * @param {string} [userHint] Thème ou consigne utilisateur pour ce tirage
 * @param {import("discord.js").Guild|null} [guild] Pour proposer les emojis custom du serveur dans le prompt
 * @returns {Promise<string>}
 */
async function generateGeminiDinguerie(userHint = "", guild = null) {
  const hint = String(userHint || "").trim();
  if (looksLikePromptExtractionAttempt(hint)) {
    return sanitizeAiMentionsForDiscord(PROMPT_EXTRACT_REFUSAL);
  }
  const userPart = hint
    ? `Consigne / thème pour cette fois : « ${hint.slice(0, 500)} »\nRéponds maintenant, sans préambule du type « voici ».`
    : "Sort une nouvelle « dinguerie » : une à quatre phrases max, sans préambule.";
  return runGroqUserTurn(userPart, undefined, { guild });
}

/**
 * Réponse à un ping avec message utilisateur (jusqu’à ~2000 car. du message nettoyé).
 * @param {string} strippedMessage Texte sans mention du bot (peut être vide)
 * @param {import("discord.js").Guild|null} [guild]
 * @param {import("@prisma/client").PrismaClient | null} [prisma] Pour le ton (/ia-mode)
 */
async function generateGeminiPingReply(strippedMessage = "", guild = null, prisma = null) {
  const msg = String(strippedMessage || "").trim().slice(0, 2000);
  if (looksLikePromptExtractionAttempt(msg)) {
    return sanitizeAiMentionsForDiscord(PROMPT_EXTRACT_REFUSAL);
  }
  const compactLen = msg.replace(/\s+/g, "").length;
  const envPingMax = Number(
    process.env.GROQ_PING_MAX_TOKENS ||
      process.env.GROK_PING_MAX_TOKENS ||
      process.env.GEMINI_PING_MAX_TOKENS ||
      640
  );
  let maxTokPing = Number.isFinite(envPingMax) && envPingMax > 0 ? envPingMax : 640;
  if (!msg) maxTokPing = Math.min(maxTokPing, 140);
  else if (compactLen <= 18) maxTokPing = Math.min(maxTokPing, 160);
  else if (msg.length <= 55) maxTokPing = Math.min(maxTokPing, 260);
  else if (msg.length <= 140) maxTokPing = Math.min(maxTokPing, 380);
  else if (msg.length <= 320) maxTokPing = Math.min(maxTokPing, 520);

  let lengthBlock = "";
  if (!msg) {
    lengthBlock =
      "**Longueur :** une seule phrase très courte (style sec / laconique).\n";
  } else if (compactLen <= 22 || msg.length <= 45) {
    lengthBlock =
      "**Longueur :** message minimal — réponds en **une phrase courte** (même ordre de taille ou plus court), percutant. Pas de pavé, pas de liste de noms du lore.\n";
  } else if (msg.length <= 120) {
    lengthBlock =
      "**Longueur :** message court — **1 à 2 phrases max** sauf si la question impose un minimum d’explication.\n";
  } else if (msg.length <= 400) {
    lengthBlock = "**Longueur :** reste concis (quelques phrases), sans boursouffler.\n";
  } else {
    lengthBlock = "**Longueur :** message long — tu peux développer si nécessaire.\n";
  }

  let userPart = msg
    ? `${lengthBlock}L'utilisateur t'a mentionné sur Discord. Réponds de façon pertinente, en respectant ton rôle (prompt système). Pas de préambule du type « en tant qu'IA ». Même s'il te demande des pings, applique la règle : aucune mention Discord.\n\nMessage :\n${msg}`
    : `${lengthBlock}L'utilisateur t'a mentionné sans autre texte. Réponds très court, dans ton style. Aucune mention Discord.`;
  const pingTone = await getEffectivePingTone(msg, prisma);
  userPart = `${userPart}${
    pingTone === "hard" ? PING_TONE_HARD_NUDGE : pingTone === "soft" ? PING_TONE_SOFT_NUDGE : PING_TONE_NEUTRAL_NUDGE
  }`;
  if (msg && isNetanyahuPayrollJokeBait(msg)) {
    userPart = `${userPart}${NETANYAHU_PAYROLL_PING_NUDGE}`;
    maxTokPing = Math.min(maxTokPing, 260);
  }
  if (msg && isMossadOrIsraeliSecretBait(msg)) {
    userPart = `${userPart}${MOSSAD_PING_TURN_NUDGE}`;
  }
  return runGroqUserTurn(userPart, maxTokPing, { guild });
}

module.exports = {
  /** @deprecated alias historique export */
  DEFAULT_GEMINI_MODEL: DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_MODEL,
  generateGeminiDinguerie,
  generateGeminiPingReply,
  formatGeminiErrorForUser,
  loadSystemPrompt,
  getSystemPromptSource,
  writeSystemPromptFile,
  resetSystemPromptFileToFactory,
  resolveWritablePromptFilePath,
  FACTORY_SYSTEM_PROMPT,
  DEFAULT_PROMPT_FILE,
  DEFAULT_GROQ_PROMPT_FILE,
  LEGACY_GEMINI_PROMPT_FILE,
  getActiveDefaultPromptPath,
  buildGuildCustomEmojiPromptAppendix,
  sanitizeAiMentionsForDiscord
};
