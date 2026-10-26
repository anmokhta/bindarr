import type { NavStyle } from "@bindarr/shared";
import type { ReactNode } from "react";

export interface SubNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

const DEFAULT_ICONS: Record<string, ReactNode> = {
  Cards: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="5" width="10" height="14" rx="1.5" /><rect x="10" y="3" width="10" height="14" rx="1.5" /></svg>,
  Wishlist: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>,
  Tags: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /></svg>,
  Collections: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="3" y="13" width="7" height="7" rx="1" /><rect x="14" y="13" width="7" height="7" rx="1" /></svg>,
  Planner: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v4M16 4v4" /></svg>,
  "Manage Binders": <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4z" /><path d="M5 4v16" /></svg>,
  "Artist Search": <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg>,
  "Nav styles": <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 6h16M4 12h10M4 18h13" /></svg>,
  General: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  Calls: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 19V5M10 19V9M16 19V7M22 19V3" /></svg>,
  Logs: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 19V5M10 19V9M16 19V7M22 19V3" /></svg>,
};

export default function SubNav({
  items,
  activeKey,
  onSelect,
  style,
  label = "Section",
}: {
  items: SubNavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  style: NavStyle;
  label?: string;
}) {
  return (
    <nav className={`sub-nav nav-style-${style}`} aria-label={label}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active || undefined}
            className={`subnav-btn${active ? " active" : ""}`}
            onClick={() => onSelect(item.key)}
          >
            {style === "icons" && (item.icon ?? DEFAULT_ICONS[item.label] ?? null)}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
