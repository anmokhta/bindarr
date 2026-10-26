import type { BankItem } from "@bindarr/shared";
import { lookupCards, type TcgCard } from "./api.js";

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** Remove `[...]` segments from a card name and collapse whitespace. */
export function stripBracketTerms(name: string): string {
  return name.replace(/\[[^\]]*]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Lookup with progressive fallbacks on empty results only (errors rethrow):
 * 1) name + number + set
 * 2) strip `[...]` from name, same number/set
 * 3) if set was set, best name + number with no set (PriceCharting "Promo" ≠ TCG set.name)
 */
export async function lookupCardsWithFallbacks(opts: {
  name: string;
  number?: string;
  set?: string;
}): Promise<TcgCard[]> {
  const name = opts.name.trim();
  const number = (opts.number ?? "").trim();
  const set = (opts.set ?? "").trim();
  if (!name) return [];

  let cards = await lookupCards(name, number, set);
  if (cards.length > 0) return cards;

  const stripped = stripBracketTerms(name);
  const bestName = stripped && stripped !== name ? stripped : name;
  if (bestName !== name) {
    cards = await lookupCards(bestName, number, set);
    if (cards.length > 0) return cards;
  }

  if (set) {
    cards = await lookupCards(bestName, number, "");
  }
  return cards;
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
