# Subsection navigation

**Status:** decided — production offers three styles via Settings → Nav styles  
**Date:** 2026-10-22

## Production

App subsections (Bank / Binders / Extras) and Settings tabs use `SubNav` with
`AppSettings.navStyle`:

| Setting value | Pattern |
| --- | --- |
| `segment` (default) | Segmented control |
| `sidebar` | Left rail beside page content (strip on narrow viewports) |
| `icons` | Icon + label rail |

Change under **Settings → Nav styles** (dropdown or “Use in app” on a demo).

Game filters (Pokémon/Misc, Have/Wishlist) still use pill chips (`.game-tab`).

## Implementation touchpoints

- Settings schema: [packages/shared/src/index.ts](../packages/shared/src/index.ts)
  (`navStyle`, `NAV_STYLES`)
- Shared control: [apps/web/src/components/SubNav.tsx](../apps/web/src/components/SubNav.tsx)
- App layout: [apps/web/src/App.tsx](../apps/web/src/App.tsx) (`.nav-layout-*`)
- Settings + demos: [apps/web/src/components/SettingsPage.tsx](../apps/web/src/components/SettingsPage.tsx),
  [NavStylesPage.tsx](../apps/web/src/components/NavStylesPage.tsx)
- Styles: [apps/web/src/styles.css](../apps/web/src/styles.css)
