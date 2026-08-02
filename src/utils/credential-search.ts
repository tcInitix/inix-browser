export interface CredentialSearchFields {
  origin: string;
  username: string;
  title: string;
}

export function credentialHostname(origin: string | null | undefined): string {
  const value = (origin ?? "").trim();
  if (!value || value === "null") return "Unknown site";
  try {
    return new URL(value).hostname.replace(/^www\./, "") || value;
  } catch {
    return value;
  }
}

export function scoreCredentialMatch(c: CredentialSearchFields, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const hostname = credentialHostname(c.origin).toLowerCase();
  const haystacks = [hostname, c.origin.toLowerCase(), c.username.toLowerCase(), c.title.toLowerCase()];

  let best = 0;
  for (const haystack of haystacks) {
    if (!haystack) continue;
    if (haystack === q) best = Math.max(best, 100);
    else if (haystack.startsWith(q)) best = Math.max(best, 85);
    else if (haystack.split(/[@./_-]/).some((part) => part.startsWith(q))) best = Math.max(best, 75);
    else if (haystack.includes(q)) best = Math.max(best, 65);
    else {
      let qi = 0;
      for (let i = 0; i < haystack.length && qi < q.length; i++) {
        if (haystack[i] === q[qi]) qi++;
      }
      if (qi === q.length) best = Math.max(best, 40 + (q.length / haystack.length) * 20);
    }
  }
  return best;
}

export function filterCredentials<T extends CredentialSearchFields>(items: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({ item, score: scoreCredentialMatch(item, q) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        credentialHostname(a.item.origin).localeCompare(credentialHostname(b.item.origin))
    )
    .map(({ item }) => item);
}
