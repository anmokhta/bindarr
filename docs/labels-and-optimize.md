# Labels, slot binding, and Organize > Optimize

Design note for a future milestone. **No code yet** — this captures the intended
model so Tags / Collections scaffolding and the roadmap stay aligned.

## Goals

Let tags and collections do more than sit on bank cards:

1. **Slot / page / section labels** — attach a tag or collection to a binder
   slot, page, or section. Any card added to that slot inherits the label.
2. **Drag a label into a binder** — dragging a tag/collection onto a binder
   (or section/page) means “all cards with this label belong here”; matching
   cards are pulled into that region.
3. **Ordered label rules** — each binder (or section) has an ordered list of
   rules, e.g. “all Eevees” → “cards from set X only if holo” → “all sleepy
   Pokémon”. Rules can combine a label with filters; order defines layout order.
4. **Organize > Optimize** — a button that computes proposed changes (cards
   added from matching labels, others pushed forward/back) and shows a
   before/after diff. The user reviews and clicks Apply. Nothing changes unseen
   (same “preview before apply” contract as the rules / bulk-apply panels).

## Distinction: smart vs slot labels

| Kind | Membership | Where it lives |
| --- | --- | --- |
| **Smart tags / smart collections** | Computed from rules over name/set/artist/… | Taxonomy manager (already planned under Rules) |
| **Slot / section labels** | Manual / positional — “this pocket is for X” | Binder slots, pages, sections |

Smart labels answer “which cards match?”. Slot labels answer “what should this
pocket imply when I place a card?”. Optimize uses both: smart membership to find
candidates, ordered section rules to decide placement.

## Example

Binder section order:

1. Tag `eeveelution` (all Eevees)
2. Collection/set filter: *Sword & Shield — Vivid Voltage*, only if holo
3. Tag `sleepy`

Optimize would propose: fill pockets with matching bank cards in that order,
shift non-matching cards forward or back as needed, and surface the diff before
writing.

## Open questions

- Collections today are single-value per card — does slot inheritance overwrite
  or become multi-value?
- Conflict when a slot’s label and an ordered rule disagree — which wins?
- Binder runs out of room — truncate, spill to next section, or refuse Apply?
- Undo for Apply (single undo stack vs snapshot restore)?
- Does a card lose an inherited label when it leaves the slot?
- Wishlist (grayscale) cards — include in Optimize, or bank-have only?
- Write lease — Optimize is a bulk write; second clients stay read-only until
  the lease is free (same as other mutations).

## Near-term scaffolding

- Tags / Collections pages show a “Slot labels and Optimize” Planned panel.
- Roadmap lists Binder sections before Optimize (sections are the anchor).
- Future route (not wired): Binders > Organize.
