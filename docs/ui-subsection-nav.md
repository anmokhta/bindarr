# Subsection navigation — UI alternatives

**Status:** decided — production offers **3 / 4 / 7** via Settings → Appearance  
**Date:** 2026-10-22

## Production

App subsections (Bank / Binders / Extras) and Settings → General / Calls use
`SubNav` with `AppSettings.navStyle`:

| Setting value | Comparison # | Pattern |
| --- | --- | --- |
| `segment` (default) | 3 | Segmented control |
| `sidebar` | 4 | Sidebar / inset list |
| `icons` | 7 | Icon + label rail |

Change under **Settings → Appearance → Subsection nav**. Settings → Nav
styles stays as a reference for all seven patterns (including retired
pills, underline, breadcrumb, dropdown).

Game filters (Pokémon/Misc, Have/Wishlist) still use pill chips
(`.game-tab`) — separate from subsection chrome.

## Patterns (comparison page numbering)

### 1. Current pills (baseline) — retired from production chrome

Familiar chip language still used for game / Have-Wishlist filters.

### 2. Nested underline

A second, lighter underline row under Bank / Binders / Extras.

- **Why:** one visual system; calm hierarchy.
- **Tradeoff:** two underline rows can look flat if spacing isn’t tight.

### 3. Segmented control — production `segment`

One rounded rectangle with dividing hairlines; active segment gets a
raised “paper” inset.

- **Why:** reads as “views of the same page,” not “another nav.”
- **Tradeoff:** awkward once you have 4+ items on mobile unless it scrolls.

### 4. Sidebar / inset list — production `sidebar`

Left rail of plain text links with a vinyl left border; collapses to a
horizontal strip on narrow viewports.

- **Why:** scales as Tags/Collections grow; feels “app.”
- **Tradeoff:** more layout work; mobile still needs a compact strip.

### 5. Breadcrumb + page title only

Page title names the subsection; siblings are plain `·`-separated links.

- **Why:** least chrome, very editorial.
- **Tradeoff:** weaker discovery for new users.

### 6. Dropdown / “section menu” in the title row

`Cards ▾` (or `General ▾`) opens sibling destinations.

- **Why:** scales when subsections grow; no continuous row.
- **Tradeoff:** one extra click; current subsection less glanceable.

### 7. Icon + label rail — production `icons`

Small icons with labels; active = gold underline, no pill fill.

- **Why:** modern feel without rounded-full chips.
- **Tradeoff:** needs crafted icons; more design work.

## Live comparison

Open **Settings → Nav styles** (`/settings?tab=nav-styles`) for interactive
demos of all seven patterns. Production chrome is driven by the Appearance
picker, not by the demos.

## Implementation touchpoints

- Settings schema: [packages/shared/src/index.ts](../packages/shared/src/index.ts)
  (`navStyle`, `NAV_STYLES`)
- Shared control: [apps/web/src/components/SubNav.tsx](../apps/web/src/components/SubNav.tsx)
- App subsection row: [apps/web/src/App.tsx](../apps/web/src/App.tsx)
- Settings picker + tabs: [apps/web/src/components/SettingsPage.tsx](../apps/web/src/components/SettingsPage.tsx)
- Styles: [apps/web/src/styles.css](../apps/web/src/styles.css)
  (`.nav-style-segment` / `.nav-style-sidebar` / `.nav-style-icons`)
- Comparison page (reference): [apps/web/src/components/NavStylesPage.tsx](../apps/web/src/components/NavStylesPage.tsx)
