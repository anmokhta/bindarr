import { SPECIES_TO_LINE_ROOT } from "./evolutionLines.data.js";

/** Strip TCG variant noise so a card name maps to a base species. */
export function normalizeSpeciesName(raw: string): string {
  let s = raw.trim();
  if (!s) return "";

  // Drop bracketed marketing terms: [Fossil Museum Exclusive]
  s = s.replace(/\[[^\]]*]/g, " ");

  // Owner / trainer possessive prefixes (Lt. Surge's, Team Rocket's, Brock's, …)
  s = s.replace(/^(?:Lt\.?\s+|Team\s+)?[A-Za-z][A-Za-z.'-]*'s\s+/i, "");

  // Leading adjective / form prefixes common on older cards
  s = s.replace(/^(?:Dark|Light|Shining|Crystal|Radiant|Shadow|Primal|Ancient|Hisuian|Galarian|Alolan|Paldean|Bloodmoon)\s+/i, "");

  // Mega / M forms: "Mega Charizard X", "M Charizard-EX"
  s = s.replace(/^M(?:ega)?\s+/i, "");

  // Trailing stage / mechanic suffixes (order matters: longer first).
  // Allow optional hyphen/space before the suffix ("Charizard-EX", "Charizard EX").
  s = s.replace(
    /[\s-]*(?:V-UNION|VSTAR|VMAX|LV\.?\s*X|δ|Delta|BREAK|Prime|LEGEND|GX|EX|ex|V|TAG\s*TEAM|☆|★|\*|GL|G|FB|C)\s*$/gi,
    "",
  );
  // Form letters after mega/base: "Charizard X", "Charizard Y" left after Mega strip
  s = s.replace(/\s+[XY]$/i, "");

  s = s.replace(/[\s-]+$/g, "").replace(/\s+/g, " ").trim();

  // Title-case single tokens that are all-caps (RAICHU → Raichu) but keep ♀♂ and punctuation
  if (/^[A-Z0-9♀♂.'-: ]+$/.test(s) && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  return s.trim();
}

function lookupRoot(species: string): string | null {
  if (!species) return null;
  if (SPECIES_TO_LINE_ROOT[species]) return SPECIES_TO_LINE_ROOT[species];
  // Case-insensitive fallback
  const lower = species.toLowerCase();
  for (const [k, v] of Object.entries(SPECIES_TO_LINE_ROOT)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/**
 * Resolve the evolution-line root for a card.
 * Prefers the card's own species; falls back to evolvesFrom; else normalized name.
 */
export function evolutionLineFor(name: string, evolvesFrom?: string | null): string {
  const species = normalizeSpeciesName(name);
  const fromName = lookupRoot(species);
  if (fromName) return fromName;

  if (evolvesFrom) {
    const pre = normalizeSpeciesName(evolvesFrom);
    const fromPre = lookupRoot(pre);
    if (fromPre) return fromPre;
    if (pre) return pre;
  }

  return species || name.trim();
}
