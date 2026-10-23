import { useEffect, useRef, useState, type ReactNode } from "react";

const BANK = ["Cards", "Wishlist", "Tags", "Collections"] as const;
const SETTINGS = ["General", "Calls"] as const;

function DemoCard({
  title,
  why,
  tradeoff,
  children,
}: {
  title: string;
  why: string;
  tradeoff: string;
  children: ReactNode;
}) {
  return (
    <article className="nav-demo-card">
      <h3 className="nav-demo-title">{title}</h3>
      <p className="nav-demo-meta"><strong>Why:</strong> {why}</p>
      <p className="nav-demo-meta"><strong>Tradeoff:</strong> {tradeoff}</p>
      <div className="nav-demo-stage">{children}</div>
    </article>
  );
}

function PillsDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <div className="nav-demo-pills" role="tablist">
        {labels.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={active === name} className={`nav-demo-pill${active === name ? " active" : ""}`} onClick={() => setActive(name)}>{name}</button>
        ))}
      </div>
    </div>
  );
}

function UnderlineDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <div className="nav-demo-underline" role="tablist">
        {labels.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={active === name} className={`nav-demo-underline-btn${active === name ? " active" : ""}`} onClick={() => setActive(name)}>{name}</button>
        ))}
      </div>
    </div>
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
      <p className="nav-demo-note">On mobile this would collapse to a horizontal scroll strip.</p>
    </div>
  );
}

function BreadcrumbDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <h4 className="nav-demo-fake-h2">{active}</h4>
      <nav className="nav-demo-breadcrumb" aria-label={label}>
        {labels.map((name, i) => (
          <span key={name}>
            {i > 0 && <span className="nav-demo-dot" aria-hidden> · </span>}
            <button type="button" className={`nav-demo-crumb${active === name ? " active" : ""}`} onClick={() => setActive(name)}>{name}</button>
          </span>
        ))}
      </nav>
    </div>
  );
}

function DropdownDemo({ labels, label }: { labels: readonly string[]; label: string }) {
  const [active, setActive] = useState(labels[0]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="nav-demo-block">
      <span className="nav-demo-label">{label}</span>
      <div className="nav-demo-dropdown-row" ref={ref}>
        <h4 className="nav-demo-fake-h2">{active}</h4>
        <div className="nav-demo-dropdown">
          <button type="button" className="nav-demo-dropdown-trigger" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((o) => !o)}>
            {active} ▾
          </button>
          {open && (
            <ul className="nav-demo-dropdown-menu" role="listbox">
              {labels.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active === name}
                    className={active === name ? "active" : ""}
                    onClick={() => { setActive(name); setOpen(false); }}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  Cards: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="5" width="10" height="14" rx="1.5" /><rect x="10" y="3" width="10" height="14" rx="1.5" /></svg>,
  Wishlist: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>,
  Tags: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /></svg>,
  Collections: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="3" y="13" width="7" height="7" rx="1" /><rect x="14" y="13" width="7" height="7" rx="1" /></svg>,
  General: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
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

export default function NavStylesPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <section className={embedded ? "nav-styles-embedded" : "page-section"}>
      {!embedded && <h2 className="page-title">Nav styles</h2>}
      <p className="page-sub">
        Reference comparisons for subsection and Settings navigation. Click around inside each demo —
        only that demo updates. Production uses options 3, 4, and 7 via Settings → Appearance →
        Subsection nav (default: segmented). See <code>docs/ui-subsection-nav.md</code>.
      </p>

      <DemoCard
        title="1. Current pills (baseline)"
        why="Familiar chip language already used for game filters."
        tradeoff="Loud next to the quieter primary underline tabs."
      >
        <PillsDemo labels={BANK} label="Bank subsections" />
        <PillsDemo labels={SETTINGS} label="Settings" />
      </DemoCard>

      <DemoCard
        title="2. Nested underline"
        why="One visual system with primary tabs; calm hierarchy."
        tradeoff="Two underline rows can look flat if spacing is loose."
      >
        <UnderlineDemo labels={BANK} label="Bank subsections" />
        <UnderlineDemo labels={SETTINGS} label="Settings" />
      </DemoCard>

      <DemoCard
        title="3. Segmented control"
        why="Reads as views of the same page, not a second nav."
        tradeoff="Gets crowded with 4+ items on mobile unless it scrolls."
      >
        <SegmentDemo labels={BANK} label="Bank subsections" />
        <SegmentDemo labels={SETTINGS} label="Settings" />
      </DemoCard>

      <DemoCard
        title="4. Sidebar / inset list"
        why="Scales as Tags/Collections grow; feels like an app rail."
        tradeoff="More layout work; mobile still needs a compact strip."
      >
        <SidebarDemo labels={BANK} label="Bank subsections" />
        <SidebarDemo labels={SETTINGS} label="Settings" />
      </DemoCard>

      <DemoCard
        title="5. Breadcrumb + page title"
        why="Least chrome; editorial and quiet."
        tradeoff="Weaker discovery for new users."
      >
        <BreadcrumbDemo labels={BANK} label="Bank subsections" />
        <BreadcrumbDemo labels={SETTINGS} label="Settings" />
      </DemoCard>

      <DemoCard
        title="6. Dropdown in title row"
        why="No continuous pill row; scales when subsections grow."
        tradeoff="Extra click; current subsection less glanceable."
      >
        <DropdownDemo labels={BANK} label="Bank subsections" />
        <DropdownDemo labels={SETTINGS} label="Settings" />
      </DemoCard>

      <DemoCard
        title="7. Icon + label rail"
        why="Modern dashboard feel without rounded-full chips."
        tradeoff="Needs crafted icons; more design work."
      >
        <IconRailDemo labels={BANK} label="Bank subsections" />
        <IconRailDemo labels={SETTINGS} label="Settings" />
      </DemoCard>
    </section>
  );
}
