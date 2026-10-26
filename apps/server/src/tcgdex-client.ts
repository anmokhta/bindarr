import TCGdex, { Query } from "@tcgdex/sdk";

export interface TcgCardResult {
  id: string;
  name: string;
  number: string;
  setName: string;
  imageSmall: string | null;
  artist: string | null;
  evolvesFrom: string | null;
  evolvesTo: string[];
}

export type TcgFetch = typeof fetch;

export interface SearchCardsOpts {
  name: string;
  number?: string;
  set?: string;
  pageSize?: number;
}

export interface SearchArtistOpts {
  illustrator: string;
  page?: number;
  pageSize?: number;
}

type BriefLike = {
  id?: string;
  localId?: string | number;
  name?: string;
  image?: string;
};

type DetailLike = BriefLike & {
  illustrator?: string;
  evolveFrom?: string;
  evolveTo?: string | string[] | null;
  set?: { name?: string } | string;
};

/** Map a TCGdex card (resume or full) into the Bindarr lookup contract. */
export function mapTcgdexCard(brief: BriefLike, detail?: DetailLike | null): TcgCardResult {
  const src = detail ?? brief;
  const imageBase = String(src.image ?? brief.image ?? "").replace(/\/$/, "");
  const evolveTo = detail?.evolveTo;
  const setName =
    typeof detail?.set === "string" ? detail.set : detail?.set?.name ?? "";
  return {
    id: String(src.id ?? brief.id ?? ""),
    name: String(src.name ?? brief.name ?? ""),
    number: String(src.localId ?? brief.localId ?? ""),
    setName,
    imageSmall: imageBase ? `${imageBase}/low.webp` : null,
    artist: detail?.illustrator ?? null,
    evolvesFrom: detail?.evolveFrom ?? null,
    evolvesTo: Array.isArray(evolveTo) ? evolveTo : evolveTo ? [String(evolveTo)] : [],
  };
}

export function isPokemontcgImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "images.pokemontcg.io";
  } catch {
    return false;
  }
}

export function isTcgdexImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "assets.tcgdex.net";
  } catch {
    return false;
  }
}

/** No-op cache: Bindarr already persists successes in SQLite. */
class NoSdkCache {
  get(): undefined {
    return undefined;
  }
  set(): void {}
  delete(): void {}
  clear(): void {}
  has(): boolean {
    return false;
  }
}

/**
 * TCGdex-backed lookups. Uses @tcgdex/sdk; override `TCGdex.fetch` via
 * {@link createTcgdexClient} for tests.
 */
export function createTcgdexClient(customFetch?: TcgFetch) {
  if (customFetch) {
    TCGdex.fetch = customFetch as typeof fetch;
  }
  const sdk = new TCGdex("en");
  // SDK defaults to an hour of in-memory caching; that would hide upstream
  // failures from our retry/stale-SQLite path. Disable it.
  sdk.setCache(new NoSdkCache() as never);

  async function enrichBriefs(briefs: BriefLike[], limit: number): Promise<TcgCardResult[]> {
    const slice = briefs.slice(0, limit);
    const details = await Promise.all(
      slice.map(async (brief) => {
        const id = brief.id?.trim();
        if (!id) return null;
        try {
          return (await sdk.card.get(id)) as DetailLike | undefined;
        } catch {
          return null;
        }
      }),
    );
    return slice.map((brief, i) => mapTcgdexCard(brief, details[i] ?? null));
  }

  async function searchCards(opts: SearchCardsOpts): Promise<TcgCardResult[]> {
    const name = opts.name.trim();
    if (!name) return [];
    const pageSize = opts.pageSize ?? 8;
    let q = Query.create().contains("name", name);
    const number = (opts.number ?? "").trim();
    if (number) q = q.contains("localId", number);
    const set = (opts.set ?? "").trim();
    if (set) q = q.contains("set.name", set);
    q = q.paginate(1, pageSize);
    const briefs = (await sdk.card.list(q)) as BriefLike[];
    return enrichBriefs(briefs ?? [], pageSize);
  }

  async function searchByArtist(opts: SearchArtistOpts): Promise<{ cards: TcgCardResult[]; page: number; pageSize: number }> {
    const illustrator = opts.illustrator.trim();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(48, Math.max(1, opts.pageSize ?? 24));
    if (!illustrator) return { cards: [], page, pageSize };
    const q = Query.create().equal("illustrator", illustrator).paginate(page, pageSize);
    const briefs = (await sdk.card.list(q)) as BriefLike[];
    const cards = await enrichBriefs(briefs ?? [], pageSize);
    return { cards, page, pageSize };
  }

  async function getCardById(id: string): Promise<TcgCardResult | null> {
    const clean = id.trim();
    if (!clean) return null;
    try {
      const detail = (await sdk.card.get(clean)) as DetailLike | undefined;
      if (!detail) return null;
      return mapTcgdexCard(detail, detail);
    } catch {
      return null;
    }
  }

  return { searchCards, searchByArtist, getCardById, sdk };
}

export type TcgdexClient = ReturnType<typeof createTcgdexClient>;
