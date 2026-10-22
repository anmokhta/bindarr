import { z } from "zod";

export const BINDER_TYPES = {
  "3x3": { label: "9-Pocket Pages", sub: "3 × 3 grid — standard sheets", count: 9, gridClass: "g9" },
  "2x2": { label: "4-Pocket Pages", sub: "2 × 2 grid — toploader / thick cards", count: 4, gridClass: "g4" },
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

export const plannerStateSchema = z.object({
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
export type PlannerState = z.infer<typeof plannerStateSchema>;

export function blankPage(count: number, n: number): BinderPage {
  return { name: `Page ${n}`, slots: new Array(count).fill(null) };
}

export function defaultState(): PlannerState {
  return {
    activeType: "3x3",
    activePageIndex: { "3x3": 0, "2x2": 0 },
    pages: {
      "3x3": [blankPage(BINDER_TYPES["3x3"].count, 1)],
      "2x2": [blankPage(BINDER_TYPES["2x2"].count, 1)],
    },
  };
}

/** Validate + normalize untrusted state (API body or legacy localStorage). Returns null if unusable. */
export function parsePlannerState(value: unknown): PlannerState | null {
  const result = plannerStateSchema.safeParse(value);
  if (!result.success) return null;
  const state = result.data;
  // Clamp page indices and pad/trim slot arrays to the binder-type size.
  (Object.keys(BINDER_TYPES) as BinderType[]).forEach((type) => {
    const { count } = BINDER_TYPES[type];
    state.pages[type].forEach((page) => {
      page.slots = Array.from({ length: count }, (_, i) => page.slots[i] ?? null);
    });
    state.activePageIndex[type] = Math.min(
      state.activePageIndex[type],
      state.pages[type].length - 1,
    );
  });
  return state;
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
