import type { BankItem } from "@bindarr/shared";
import { lookupCards, type TcgCard } from "./api.js";
import { normalizeCardLookupName } from "./bankImport.js";

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** Remove `[...]` segments from a card name and collapse whitespace. */
export function stripBracketTerms(name: string): string {
  return name.replace(/\[[^\]]*]/g, " ").replace(/\s+/g, " ").trim();
}

export function isJapaneseBankItem(item: Pick<BankItem, "language" | "set">): boolean {
  if ((item.language ?? "").trim().toLowerCase() === "ja") return true;
  return /^japanese\b/i.test((item.set ?? "").trim());
}

export function isCarddassSet(set: string | null | undefined): boolean {
  return /carddass/i.test(set ?? "");
}

/** Skip auto-Identify for non-TCG lines that otherwise match EN numbers (e.g. Carddass → 151). */
export function shouldSkipAutoIdentify(item: Pick<BankItem, "set">): boolean {
  return isCarddassSet(item.set);
}

/** TCG Pocket hits (A1/B2/… ids or /tcgp/ assets) — prefer main TCG when available. */
export function isPocketTcgHit(card: Pick<TcgCard, "id" | "imageSmall">): boolean {
  if (/\/tcgp\//i.test(card.imageSmall ?? "")) return true;
  if (/^[AB]\d/i.test(card.id.trim())) return true;
  return false;
}

export function isPocketApiId(apiId: string | null | undefined): boolean {
  if (!apiId) return false;
  return /^[AB]\d/i.test(apiId.trim());
}

export function isPocketImageUrl(url: string | null | undefined): boolean {
  return /\/tcgp\//i.test(url ?? "");
}

/** Bad auto-matches to clear before re-Identify: Carddass TCG hits, or JP rows glued to Pocket. */
export function hasFalseLookupMatch(item: BankItem): boolean {
  if (isCarddassSet(item.set) && (item.apiId || /pokemontcg\.io|assets\.tcgdex\.net/i.test(item.image ?? ""))) {
    return true;
  }
  if (isJapaneseBankItem(item) && (isPocketApiId(item.apiId) || isPocketImageUrl(item.image))) {
    return true;
  }
  return false;
}

/** Clear apiId + image so Identify can run again. */
export function clearFalseLookupMatch(item: BankItem): BankItem {
  return { ...item, apiId: null, image: null };
}

/** Prefer first non-Pocket TCGdex hit when any exist. */
export function pickLookupCard(cards: TcgCard[]): TcgCard | null {
  if (!cards.length) return null;
  return cards.find((c) => !isPocketTcgHit(c)) ?? cards[0] ?? null;
}

function stripLvX(name: string): string {
  return name.replace(/\bLV\.X\b/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Lookup with progressive fallbacks on empty results only (errors rethrow):
 * 1) name + number + set
 * 2) normalized / bracket-stripped name, same number/set
 * 3) drop set (Promo / JP marketing sets ≠ TCGdex set.name)
 * 4) if Japanese: drop number (JP collector # ≠ EN localId)
 * 5) if name has LV.X: retry without suffix (TCGdex sometimes omits it)
 */
export async function lookupCardsWithFallbacks(opts: {
  name: string;
  number?: string;
  set?: string;
  language?: string | null;
}): Promise<TcgCard[]> {
  const name = opts.name.trim();
  const number = (opts.number ?? "").trim();
  const set = (opts.set ?? "").trim();
  if (!name) return [];

  const japanese =
    (opts.language ?? "").trim().toLowerCase() === "ja" || /^japanese\b/i.test(set);

  const seen = new Set<string>();
  const attempts: Array<[string, string, string]> = [];
  const push = (n: string, num: string, s: string) => {
    const clean = n.trim();
    if (!clean) return;
    const key = `${clean}\0${num}\0${s}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push([clean, num, s]);
  };

  const nameVariants = new Set<string>();
  nameVariants.add(name);
  const normalized = normalizeCardLookupName(name);
  if (normalized) nameVariants.add(normalized);
  const noBrackets = stripBracketTerms(name);
  if (noBrackets) nameVariants.add(noBrackets);
  const normNoBrackets = normalizeCardLookupName(noBrackets);
  if (normNoBrackets) nameVariants.add(normNoBrackets);

  for (const n of nameVariants) push(n, number, set);

  if (set) {
    for (const n of nameVariants) push(n, number, "");
  }

  if (japanese && number) {
    for (const n of nameVariants) {
      push(n, "", set);
      push(n, "", "");
    }
  }

  const withLvX = [...nameVariants].filter((n) => /\bLV\.X\b/i.test(n));
  for (const n of withLvX) {
    const stripped = stripLvX(normalizeCardLookupName(n));
    if (!stripped || stripped === n) continue;
    push(stripped, number, set);
    if (set) push(stripped, number, "");
    if (japanese) {
      push(stripped, "", set);
      push(stripped, "", "");
    } else if (number) {
      // EN LV.X naming gaps (e.g. Gliscor): name without LV.X + number + set
      push(stripped, number, set);
    }
  }

  for (const [n, num, s] of attempts) {
    const cards = await lookupCards(n, num, s);
    if (cards.length > 0) return cards;
  }
  return [];
}

/** Build a patch from the first TCG lookup hit: set image when missing; fill other empty fields only. */
export function applyFirstLookupToItem(item: BankItem, card: TcgCard): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...item };

  if (isEmpty(item.image) && card.imageSmall) {
    patch.image = card.imageSmall;
  }
  if (isEmpty(item.apiId) && card.id) {
    patch.apiId = card.id;
  }
  // Keep PriceCharting / JP set labels; only fill set when empty.
  if (isEmpty(item.set) && card.setName) {
    patch.set = card.setName;
  }
  if (isEmpty(item.number) && card.number) {
    patch.number = card.number;
  }
  if (isEmpty(item.artist) && card.artist) {
    patch.artist = card.artist;
  }
  if (isEmpty(item.evolutionLine) && (card.evolvesFrom || card.name)) {
    patch.evolutionLine = card.evolvesFrom ?? card.name;
  }

  return patch;
}

export function needsImageEnrich(item: BankItem): boolean {
  return isEmpty(item.image);
}

export type BankSortBy = "name" | "set" | "number" | "artist";
export type BankSortOrder = "asc" | "desc";

function compareNumbers(a: string, b: string): number {
  const an = a.trim();
  const bn = b.trim();
  if (!an && !bn) return 0;
  if (!an) return 1;
  if (!bn) return -1;
  const ai = /^\d+$/.test(an) ? Number(an) : NaN;
  const bi = /^\d+$/.test(bn) ? Number(bn) : NaN;
  if (!Number.isNaN(ai) && !Number.isNaN(bi)) return ai - bi;
  return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
}

function compareText(a: string, b: string): number {
  const an = a.trim();
  const bn = b.trim();
  if (!an && !bn) return 0;
  if (!an) return 1;
  if (!bn) return -1;
  return an.localeCompare(bn, undefined, { sensitivity: "base" });
}

export function sortBankItems(
  items: BankItem[],
  sortBy: BankSortBy,
  order: BankSortOrder,
): BankItem[] {
  const dir = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = compareText(a.name, b.name);
    else if (sortBy === "set") cmp = compareText(a.set ?? "", b.set ?? "");
    else if (sortBy === "number") cmp = compareNumbers(a.number ?? "", b.number ?? "");
    else cmp = compareText(a.artist ?? "", b.artist ?? "");
    if (cmp === 0 && sortBy !== "name") cmp = compareText(a.name, b.name);
    return cmp * dir;
  });
}

export type ImageFilter = "all" | "with" | "without";

export function filterByImage(items: BankItem[], imageFilter: ImageFilter): BankItem[] {
  if (imageFilter === "with") return items.filter((i) => !needsImageEnrich(i));
  if (imageFilter === "without") return items.filter((i) => needsImageEnrich(i));
  return items;
}
