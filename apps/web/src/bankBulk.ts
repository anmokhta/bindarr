import type { BankItem } from "@bindarr/shared";

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Parse a comma-separated tag string into trimmed unique tags. */
export function parseTagList(text: string): string[] {
  return normalizeTags(text.split(","));
}

export function addTags(item: BankItem, tags: string[]): BankItem {
  const add = normalizeTags(tags);
  if (!add.length) return item;
  const existing = new Set(item.tags.map((t) => t.toLowerCase()));
  const merged = [...item.tags];
  for (const t of add) {
    if (!existing.has(t.toLowerCase())) {
      existing.add(t.toLowerCase());
      merged.push(t);
    }
  }
  return { ...item, tags: merged };
}

export function removeTags(item: BankItem, tags: string[]): BankItem {
  const remove = new Set(normalizeTags(tags).map((t) => t.toLowerCase()));
  if (!remove.size) return item;
  return { ...item, tags: item.tags.filter((t) => !remove.has(t.toLowerCase())) };
}

export function setCollection(item: BankItem, collection: string | null): BankItem {
  const next = collection?.trim() || null;
  return { ...item, collection: next };
}
