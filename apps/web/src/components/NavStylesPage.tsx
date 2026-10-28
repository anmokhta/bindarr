import { useState, type ReactNode } from "react";
import { NAV_STYLES, type NavStyle } from "@bindarr/shared";

const BANK = ["Cards", "Wishlist", "Bulk add", "Tags", "Collections"] as const;
const SETTINGS = ["General", "Nav styles", "Calls"] as const;

const OPTIONS: { style: NavStyle; title: string; why: string; tradeoff: string }[] = [
  {
    style: "segment",
    title: "Segmented control",
    why: "Reads as views of the same page, not a second nav.",
    tradeoff: "Gets crowded with 4+ items on mobile unless it scrolls.",
  },
  {
    style: "sidebar",
    title: "Sidebar / inset list",
    why: "Scales as Tags/Collections grow; left rail beside page content.",
    tradeoff: "On narrow viewports it collapses to a horizontal strip.",
  },
  {
    style: "icons",
    title: "Icon + label rail",
    why: "Modern dashboard feel without rounded-full chips.",
    tradeoff: "Needs crafted icons; more design work.",
  },
];

function DemoCard({
  title,
  why,
  tradeoff,
  children,
  productionStyle,
  activeStyle,
  onUse,
}: {
  title: string;
  why: string;
  tradeoff: string;
  children: ReactNode;
  productionStyle: NavStyle;
  activeStyle: NavStyle;
  onUse?: (style: NavStyle) => void;
}) {
  const inUse = productionStyle === activeStyle;
  return (
    <article className={`nav-demo-card${inUse ? " nav-demo-card-active" : ""}`}>
      <div className="nav-demo-card-head">
        <h3 className="nav-demo-title">{title}</h3>
        {onUse && (
          <button
            type="button"
            className={`nav-demo-use${inUse ? " active" : ""}`}
            disabled={inUse}
            onClick={() => onUse(productionStyle)}
          >
            {inUse ? "In use" : "Use in app"}
          </button>
        )}
      </div>
      <p className="nav-demo-meta"><strong>Why:</strong> {why}</p>
      <p className="nav-demo-meta"><strong>Tradeoff:</strong> {tradeoff}</p>
      <div className="nav-demo-stage">{children}</div>
    </article>
  );
}

function SegmentDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <div className="nav-demo-segment" role="tablist">
        {labels.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={active === name} className={`nav-demo-segment-btn${active === name ? " active" : ""}`} onClick={() => setActive(name)}>{name}</button>
        ))}
      </div>
    </div>
  );
}

function SidebarDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <div className="nav-demo-sidebar-wrap">
        <aside className="nav-demo-sidebar" role="tablist" aria-orientation="vertical">
          {labels.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={active === name} className={`nav-demo-sidebar-btn${active === name ? " active" : ""}`} onClick={() => setActive(name)}>{name}</button>
          ))}
        </aside>
        <div className="nav-demo-sidebar-panel">{active} content would go here</div>
      </div>
      <p className="nav-demo-note">On mobile this collapses to a horizontal scroll strip.</p>
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  Cards: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="5" width="10" height="14" rx="1.5" /><rect x="10" y="3" width="10" height="14" rx="1.5" /></svg>,
  Wishlist: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>,
  "Bulk add": <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 5v14M5 12h14" /><rect x="3" y="3" width="18" height="18" rx="2" /></svg>,
  Tags: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /></svg>,
  Collections: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="3" y="13" width="7" height="7" rx="1" /><rect x="14" y="13" width="7" height="7" rx="1" /></svg>,
  General: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  "Nav styles": <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 6h16M4 12h10M4 18h13" /></svg>,
  Calls: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 19V5M10 19V9M16 19V7M22 19V3" /></svg>,
};

function IconRailDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <div className="nav-demo-icons" role="tablist">
        {labels.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={active === name} className={`nav-demo-icon-btn${active === name ? " active" : ""}`} onClick={() => setActive(name)}>
            {ICONS[name] ?? null}
            <span>{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DemoForStyle({ style, labels, label }: { style: NavStyle; labels: readonly string[]; label: string }) {
  if (style === "sidebar") return <SidebarDemo labels={labels} label={label} />;
  if (style === "icons") return <IconRailDemo labels={labels} label={label} />;
  return <SegmentDemo labels={labels} label={label} />;
}

export default function NavStylesPage({
  embedded = false,
  navStyle = "segment",
  onNavStyleChange,
}: {
  embedded?: boolean;
  navStyle?: NavStyle;
  onNavStyleChange?: (style: NavStyle) => void;
}) {
  return (
    <section className={embedded ? "nav-styles-embedded" : "page-section"}>
      {!embedded && <h2 className="page-title">Nav styles</h2>}

      <div className="settings-group">
        <h3>Subsection nav</h3>
        <p className="settings-text">
          Chooses the real Bank / Binders / Extras / Settings sub-tab chrome.
        </p>
        <label className="settings-row">
          <span>In use</span>
          <select
            aria-label="Subsection nav"
            value={navStyle}
            disabled={!onNavStyleChange}
            onChange={(e) => onNavStyleChange?.(e.target.value as NavStyle)}
          >
            {(Object.entries(NAV_STYLES) as [NavStyle, { label: string }][]).map(([id, meta]) => (
              <option key={id} value={id}>{meta.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="page-sub">
        Click around inside each demo — only that demo updates. Use the control above or
        “Use in app” to change production chrome.
      </p>

      {OPTIONS.map((opt) => (
        <DemoCard
          key={opt.style}
          title={opt.title}
          why={opt.why}
          tradeoff={opt.tradeoff}
          productionStyle={opt.style}
          activeStyle={navStyle}
          onUse={onNavStyleChange}
        >
          <DemoForStyle style={opt.style} labels={BANK} label="Bank subsections" />
          <DemoForStyle style={opt.style} labels={SETTINGS} label="Settings" />
        </DemoCard>
      ))}
    </section>
  );
}
