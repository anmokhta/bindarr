import { z } from "zod";

export const BINDER_TYPES = {
  "3x3": { label: "9-Pocket Pages", sub: "3 × 3 grid — standard sheets", count: 9, gridClass: "g9" },
  "2x2": { label: "4-Pocket Pages", sub: "2 × 2 grid — toploader / thick cards", count: 4, gridClass: "g4" },
  "4x3": { label: "12-Pocket Pages", sub: "4 × 3 grid — landscape sheets", count: 12, gridClass: "g12" },
} as const;

export type BinderType = keyof typeof BINDER_TYPES;

export const TAGS = {
  none: { label: "No tag", color: null },
  showcase: { label: "Showcase", color: "var(--tag-showcase)" },
  set: { label: "Set build", color: "var(--tag-set)" },
  trade: { label: "Trade / bulk", color: "var(--tag-trade)" },
} as const;

export type CardTag = keyof typeof TAGS;

export const cardSlotSchema = z.object({
  name: z.string().min(1),
  tag: z.enum(["none", "showcase", "set", "trade"]),
  note: z.string(),
  image: z.string().nullable(),
  bankId: z.string().nullable().optional(),
});
export type CardSlot = z.infer<typeof cardSlotSchema>;

export const binderPageSchema = z.object({
  name: z.string().min(1),
  slots: z.array(cardSlotSchema.nullable()),
});
export type BinderPage = z.infer<typeof binderPageSchema>;

export const binderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layout: z.enum(["3x3", "2x2", "4x3"]),
  pages: z.array(binderPageSchema).min(1),
  activePageIndex: z.number().int().min(0).default(0),
  archivedAt: z.string().nullable().default(null),
});
export type Binder = z.infer<typeof binderSchema>;

export const plannerStateSchema = z.object({
  binders: z.array(binderSchema),
  activeBinderId: z.string(),
});
export type PlannerState = z.infer<typeof plannerStateSchema>;

/** Pre-multiple-binders shape: two fixed buckets keyed by layout. */
const legacyPlannerStateSchema = z.object({
  activeType: z.enum(["3x3", "2x2"]),
  activePageIndex: z.object({
    "3x3": z.number().int().min(0),
    "2x2": z.number().int().min(0),
  }),
  pages: z.object({
    "3x3": z.array(binderPageSchema).min(1),
    "2x2": z.array(binderPageSchema).min(1),
  }),
});

export function blankPage(count: number, n: number): BinderPage {
  return { name: `Page ${n}`, slots: new Array(count).fill(null) };
}

export function makeBinder(id: string, name: string, layout: BinderType, sheetCount = 1): Binder {
  const sheets = Math.max(1, Math.min(200, Math.floor(sheetCount) || 1));
  return {
    id,
    name,
    layout,
    pages: Array.from({ length: sheets * 2 }, (_, i) => blankPage(BINDER_TYPES[layout].count, i + 1)),
    activePageIndex: 0,
    archivedAt: null,
  };
}

/** A binder's physical size: pages are individual sides of double-sided sheets. */
export function sheetCountOf(binder: Binder): number {
  return Math.ceil(binder.pages.length / 2);
}

export function totalSlotsOf(binder: Binder): number {
  return binder.pages.length * BINDER_TYPES[binder.layout].count;
}

export type ResizeResult =
  | { ok: true; binder: Binder }
  | { ok: false; reason: string; blockedPage: string; cardCount: number };

/** Grow/shrink a binder to `targetSheets` physical sheets (2 sides each). Shrinking never drops a card. */
export function resizeBinderSheets(binder: Binder, targetSheets: number): ResizeResult {
  const target = Math.max(1, Math.min(200, Math.floor(targetSheets) || 1));
  const targetSides = target * 2;
  const next: Binder = structuredClone(binder);
  if (targetSides < next.pages.length) {
    const removed = next.pages.slice(targetSides);
    const cardCount = removed.reduce((n, p) => n + p.slots.filter(Boolean).length, 0);
    if (cardCount > 0) {
      const blocked = removed.find((p) => p.slots.some(Boolean))!;
      return {
        ok: false,
        reason: `"${blocked.name}" still has cards — clear or move them before shrinking this binder.`,
        blockedPage: blocked.name,
        cardCount,
      };
    }
    next.pages = next.pages.slice(0, targetSides);
  } else {
    const { count } = BINDER_TYPES[next.layout];
    while (next.pages.length < targetSides) next.pages.push(blankPage(count, next.pages.length + 1));
  }
  next.activePageIndex = Math.min(next.activePageIndex, next.pages.length - 1);
  return { ok: true, binder: next };
}

/** Spread index for a side: side 0 is solo, then pairs (1,2), (3,4), ... */
export function spreadIndexForSide(sideIndex: number): number {
  return sideIndex === 0 ? 0 : Math.floor((sideIndex + 1) / 2);
}

/** Side indices shown in a spread: [0], [1,2], [3,4], ... */
export function spreadSides(spreadIndex: number, sideCount: number): number[] {
  if (spreadIndex === 0) return sideCount > 0 ? [0] : [];
  const start = spreadIndex * 2 - 1;
  return [start, start + 1].filter((i) => i < sideCount);
}

export function spreadCount(sideCount: number): number {
  return sideCount === 0 ? 0 : 1 + Math.ceil((sideCount - 1) / 2);
}

export function spreadLabel(spreadIndex: number, pages: BinderPage[]): string {
  const sides = spreadSides(spreadIndex, pages.length);
  if (sides.length <= 1) return pages[sides[0]]?.name ?? `Page ${spreadIndex + 1}`;
  return `Pages ${sides[0] + 1}–${sides[1] + 1}`;
}

export function defaultState(): PlannerState {
  return {
    activeBinderId: "legacy-3x3",
    binders: [
      makeBinder("legacy-3x3", "9-Pocket Binder", "3x3"),
      makeBinder("legacy-2x2", "4-Pocket Binder", "2x2"),
    ],
  };
}

function normalize(state: PlannerState): PlannerState | null {
  if (state.binders.length === 0) return defaultState();
  state.binders.forEach((binder) => {
    const { count } = BINDER_TYPES[binder.layout];
    if (binder.pages.length === 0) binder.pages = [blankPage(count, 1)];
    binder.pages.forEach((page) => {
      page.slots = Array.from({ length: count }, (_, i) => page.slots[i] ?? null);
    });
    // Sheets are double-sided: pad an odd side count with a blank back side.
    if (binder.pages.length % 2 === 1) binder.pages.push(blankPage(count, binder.pages.length + 1));
    binder.activePageIndex = Math.min(Math.max(0, binder.activePageIndex), binder.pages.length - 1);
  });
  // Guarantee at least one unarchived binder and a valid selection.
  if (!state.binders.some((b) => !b.archivedAt)) state.binders[0].archivedAt = null;
  const active = state.binders.find((b) => b.id === state.activeBinderId && !b.archivedAt);
  if (!active) state.activeBinderId = state.binders.find((b) => !b.archivedAt)!.id;
  return state;
}

/** Validate + normalize untrusted state (API body or legacy localStorage). Returns null if unusable. */
export function parsePlannerState(value: unknown): PlannerState | null {
  const current = plannerStateSchema.safeParse(value);
  if (current.success) return normalize(current.data);

  const legacy = legacyPlannerStateSchema.safeParse(value);
  if (legacy.success) {
    const l = legacy.data;
    const mk = (layout: "3x3" | "2x2", name: string): Binder => ({
      id: `legacy-${layout}`,
      name,
      layout,
      pages: l.pages[layout].map((p, i) => ({ name: p.name || `Page ${i + 1}`, slots: [...p.slots] })),
      activePageIndex: l.activePageIndex[layout],
      archivedAt: null,
    });
    return normalize({
      activeBinderId: `legacy-${l.activeType}`,
      binders: [mk("3x3", "9-Pocket Binder"), mk("2x2", "4-Pocket Binder")],
    });
  }
  return null;
}

export const STORAGE_KEY = "binderPlannerState_v1";

// --- Games & card bank -------------------------------------------------------

/** TCG games Bindarr knows about. Only Pokémon has lookup support for now. */
export const GAMES = {
  pokemon: { label: "Pokémon", implemented: true },
  magic: { label: "Magic: The Gathering", implemented: false },
  yugioh: { label: "Yu-Gi-Oh!", implemented: false },
  lorcana: { label: "Disney Lorcana", implemented: false },
  onepiece: { label: "One Piece", implemented: false },
} as const;

export type GameId = keyof typeof GAMES;

/** Which bank an item lives in: a game's bank, or the misc bank. */
export type BankId = GameId | "misc";

export const BANK_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(GAMES).map(([id, g]) => [id, `${g.label} Bank`])),
  misc: "Misc Bank",
};

export const bankItemSchema = z.object({
  id: z.string().min(1),
  game: z.string().min(1), // GameId or "misc"
  have: z.boolean().default(true),
  want: z.boolean().default(false),
  apiId: z.string().nullable().default(null),
  name: z.string().min(1),
  set: z.string().default(""),
  number: z.string().default(""),
  artist: z.string().nullable().default(null),
  evolutionLine: z.string().nullable().default(null),
  collection: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  image: z.string().nullable().default(null),
  note: z.string().default(""),
  // Misc-bank extras
  appliesToGame: z.string().nullable().default(null),
  maker: z.string().nullable().default(null),
  year: z.number().int().nullable().default(null),
  language: z.string().nullable().default(null),
  condition: z.string().nullable().default(null),
});
export type BankItem = z.infer<typeof bankItemSchema>;

export function parseBankItem(value: unknown): BankItem | null {
  const r = bankItemSchema.safeParse(value);
  return r.success ? r.data : null;
}

export const appSettingsSchema = z.object({
  visibleGames: z.array(z.string()).default(["pokemon", "misc"]),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export function defaultSettings(): AppSettings {
  return { visibleGames: ["pokemon", "misc"] };
}

export function parseAppSettings(value: unknown): AppSettings {
  const r = appSettingsSchema.safeParse(value);
  return r.success ? r.data : defaultSettings();
}

/** Convert a bank item into a pocket slot (snapshot, linked by bankId). */
export function bankItemToSlot(item: BankItem): CardSlot {
  const noteParts = [item.set, item.number ? `#${item.number}` : ""].filter(Boolean);
  return {
    name: item.name,
    tag: "none",
    note: item.note || noteParts.join(" "),
    image: item.image,
    bankId: item.id,
  };
}
