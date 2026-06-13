/** Contexte emploi / CV pro — ne pas expandre « cv » en « ça va ». */
const PRO_CV_RE =
  /\b(curriculum\s*vitae|cv\s+prof(?:essionnel)?|mon\s+cv|ton\s+cv|un\s+cv|le\s+cv|ma\s+cv|postuler|embauch|recrut|entretien|linkedin|stage\b|travail\b|job\b|recruteur)\b/i;

/** @type {[RegExp, string][]} */
const PHRASE_CV_EXPANSIONS = [
  [/\bcomment\s+cv\b/gi, "comment ça va"],
  [/\bcommen\s+cv\b/gi, "comment ça va"],
  [/\bet\s+cv\b/gi, "et ça va"],
  [/\balors?\s+cv\b/gi, "alors ça va"],
  [/\bou\s+cv\b/gi, "ou ça va"],
  [/\bcv\s+et\s+toi\b/gi, "ça va et toi"],
  [/\btu\s+cv\b/gi, "tu vas bien"],
  [/\b[cç]a\s+cv\b/gi, "ça va"]
];

/** @type {[RegExp, string][]} */
const GENERAL_EXPANSIONS = [
  [/\bcc\b/gi, "coucou"],
  [/\bbjr\b/gi, "bonjour"],
  [/\bbsr\b/gi, "bonsoir"],
  [/\bslt\b/gi, "salut"],
  [/\btkt\b/gi, "t'inquiète"],
  [/\btk?t\b/gi, "t'inquiète"],
  [/\bjsp\b/gi, "je sais pas"],
  [/\bpq\b/gi, "pourquoi"],
  [/\bpk\b/gi, "pourquoi"],
  [/\bstp\b/gi, "s'il te plaît"],
  [/\bsvp\b/gi, "s'il vous plaît"],
  [/\bvrmt\b/gi, "vraiment"],
  [/\bvrm\b/gi, "vraiment"],
  [/\bbcp\b/gi, "beaucoup"],
  [/\boklm\b/gi, "au calme"],
  [/\bgl\b/gi, "bonne chance"]
];

function isProbablyProfessionalCvContext(text) {
  return PRO_CV_RE.test(String(text || ""));
}

/**
 * Développe les abréviations SMS / Discord fréquentes pour l’IA.
 * @param {string} raw
 * @returns {{ text: string, hints: string[], expanded: boolean }}
 */
function expandFrenchChatAbbreviations(raw) {
  let t = String(raw || "").trim();
  const hints = [];
  if (!t) return { text: t, hints, expanded: false };

  const before = t;
  const proCv = isProbablyProfessionalCvContext(t);

  if (!proCv) {
    if (/^\s*cv\s*[.!?…]*\s*$/i.test(t)) {
      t = "ça va";
    } else {
      for (const [re, rep] of PHRASE_CV_EXPANSIONS) {
        t = t.replace(re, rep);
      }
      if (/\bcv\b/i.test(t) && t.length <= 90 && /\b(comment|salut|coucou|hey|bjr|bonjour|yo|wesh)\b/i.test(t)) {
        t = t.replace(/\bcv\b/gi, "ça va");
      }
    }
  }

  for (const [re, rep] of GENERAL_EXPANSIONS) {
    t = t.replace(re, rep);
  }

  const expanded = t !== before;
  if (expanded && !proCv && /\b(c[aâ]\s*va|comment\s+[cç]a\s*va)/i.test(t)) {
    hints.push("« cv » = « ça va » (salut / formule de politesse, **pas** curriculum vitae).");
  }

  return { text: t, hints, expanded };
}

/**
 * Bloc prompt quand des abréviations ont été normalisées.
 * @param {{ hints: string[], expanded: boolean }} pack
 */
function buildAbbreviationPromptAppendix(pack) {
  if (!pack?.expanded) return "";
  const hintLine = pack.hints?.length ? pack.hints.join(" ") : "";
  return (
    "\n\n---\n**[ABRÉVIATIONS DISCORD]**" +
    " Les jeunes du serveur écrivent souvent en SMS : **cv** = **ça va**, **cc** = coucou, **stp/svp**, **tkt**, **jsp**, **pk/pq**, etc." +
    " Interprète le message dans ce sens **sauf** si l’utilisateur parle clairement d’emploi ou de curriculum vitae." +
    (hintLine ? `\n${hintLine}` : "")
  );
}

module.exports = {
  expandFrenchChatAbbreviations,
  buildAbbreviationPromptAppendix,
  isProbablyProfessionalCvContext
};
