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
