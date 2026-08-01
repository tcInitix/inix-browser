const GREETING_RE =
  /^(hi|hello|hey|yo|sup|howdy|hiya|good\s+(morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|nice|lol|haha|bye|goodbye|goodnight|good night)[!.?\s]*$/i;

const SMALLTALK_RE =
  /^(how are you|how're you|what's up|whats up|how's it going|how are things|how do you do)[?.!\s]*$/i;

/** User is asking about Inix AI itself — not interview advice, not web lookup. */
const ABOUT_AI_RE =
  /\b(tell me about (yourself|yourselves|yourselve|you)|who are you|what are you|about you|introduce yourself|what can you do|what do you do|what are you (like|capable of)|how do you work)\b/i;

export function isAboutAiMessage(message: string): boolean {
  return ABOUT_AI_RE.test(message.trim());
}

/** Greetings and small talk — never run web search or suggest links. */
export function isCasualChatMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return true;
  if (isAboutAiMessage(t)) return true;
  if (GREETING_RE.test(t) || SMALLTALK_RE.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !t.includes("?")) return true;
  return false;
}

/** Only search when the message looks like a factual or lookup request. */
export function shouldSearchWebForMessage(message: string, hasUrls = false): boolean {
  const t = message.trim();
  if (!t) return false;
  if (isCasualChatMessage(t)) return false;
  if (hasUrls) return true;

  const words = t.split(/\s+/).filter(Boolean);
  const hasQuestionMark = t.includes("?");
  const startsWithQuestionWord =
    /^(what|when|where|who|why|how|which|is|are|can|could|does|do)\b/i.test(t);
  const isExplicitLookup = /^(look up|search for|find (me |the |a ))/i.test(t);
  const isTellMeLookup =
    /^tell me (about|how|what|why|when|where|who)\b/i.test(t) && !isAboutAiMessage(t);
  const needsFreshInfo =
    /\b(latest|current|today|now|price|news|patch|version|update|release|score|weather|stock|official)\b/i.test(
      t
    );

  if (needsFreshInfo) return true;
  if (isExplicitLookup || isTellMeLookup) return true;
  if ((hasQuestionMark || startsWithQuestionWord) && words.length >= 3) return true;
  if (words.length >= 6) return true;

  return false;
}
