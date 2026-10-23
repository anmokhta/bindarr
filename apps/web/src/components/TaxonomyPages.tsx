import type { BankItem } from "@bindarr/shared";

function groupBy(items: BankItem[], pick: (i: BankItem) => string[]): Map<string, BankItem[]> {
  const out = new Map<string, BankItem[]>();
  for (const item of items) {
    for (const key of pick(item)) {
      const arr = out.get(key) ?? [];
      arr.push(item);
      out.set(key, arr);
    }
  }
  return out;
}

function SkeletonShell({
  title,
  sub,
  groups,
  total,
  assigned,
  unassignedLabel,
  ruleAction,
  items,
}: {
  title: string;
  sub: string;
  groups: Map<string, BankItem[]>;
  total: number;
  assigned: number;
  unassignedLabel: string;
  ruleAction: string;
  items: BankItem[];
}) {
  const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const unassigned = total - assigned;
  return (
    <section className="page-section">
      <h2 className="page-title">{title} <span className="planned-badge">Planned</span></h2>
      <p className="page-sub">{sub}</p>

      <div className="taxonomy-summary">
        <div className="summary-card"><strong>{entries.length}</strong><span>distinct {title.toLowerCase()}</span></div>
        <div className="summary-card"><strong>{assigned}</strong><span>cards assigned</span></div>
        <div className="summary-card"><strong>{unassigned}</strong><span>{unassignedLabel}</span></div>
        <div className="summary-card"><strong>{total}</strong><span>cards total</span></div>
      </div>

      <div className="bank-actions-row">
        <button className="primary-btn" disabled title="Coming with the taxonomy manager">+ New {title === "Tags" ? "tag" : "collection"}</button>
        <span className="bank-count">Read-only preview — management arrives with the taxonomy manager.</span>
      </div>

      {entries.length === 0 ? (
        <p className="bank-empty">No {title.toLowerCase()} yet — add one to a card from the Bank, and it will show up here.</p>
      ) : (
        <div className="taxonomy-list">
          {entries.map(([name, cards]) => (
            <article key={name} className="taxonomy-card">
              <h3>{name}</h3>
              <p className="binder-meta">{cards.length} card{cards.length === 1 ? "" : "s"} · e.g. {cards.slice(0, 3).map((c) => c.name).join(", ")}</p>
              <div className="binder-card-actions">
                <button disabled title="Coming with the taxonomy manager">Rename</button>
                <button disabled title="Coming with the taxonomy manager">Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="settings-group taxonomy-planned">
        <h3>Rules <span className="planned-badge">Planned</span></h3>
        <p className="settings-text">
          When a card's name, set, artist, evolution line, game, or existing tags match a rule, automatically {ruleAction}.
          Rules will be previewed before they change anything.
        </p>
        <div className="rule-preview" aria-disabled="true">
          <select disabled><option>name contains…</option></select>
          <input disabled placeholder="e.g. Pikachu" />
          <span>→</span>
          <input disabled placeholder={ruleAction} />
          <button disabled>Add rule</button>
        </div>
      </div>

      <div className="settings-group taxonomy-planned">
        <h3>Bulk apply <span className="planned-badge">Planned</span></h3>
        <p className="settings-text">
          Apply rules to all {items.length} existing cards at once — always with a match preview first, so nothing changes unseen.
        </p>
        <button disabled title="Coming with the rules engine">Preview matches</button>
      </div>

      <div className="settings-group taxonomy-planned">
        <h3>Slot labels and Optimize <span className="planned-badge">Planned</span></h3>
        <p className="settings-text">
          Attach a tag or collection to a binder slot, page, or section so any card placed there inherits it.
          Drag a label onto a binder to pull matching cards into that region. Binders (or sections) will also
          support an ordered list of label rules — for example all Eevees, then one set&apos;s holos only, then
          all sleepy Pokémon. Organize will grow an Optimize button that shows a before/after diff
          (cards added, others pushed forward or back) and applies nothing until you confirm.
          Smart tags/collections (rule-computed membership) stay separate from these positional slot labels.
          See <code>docs/labels-and-optimize.md</code>.
        </p>
        <div className="rule-preview" aria-disabled="true">
          <button disabled title="Coming with binder sections + Optimize">Attach label to slot…</button>
          <button disabled title="Coming with Organize > Optimize">Optimize binder…</button>
        </div>
      </div>
    </section>
  );
}

export function TagsPage({ items }: { items: BankItem[] }) {
  const groups = groupBy(items, (i) => i.tags);
  const assigned = items.filter((i) => i.tags.length > 0).length;
  return (
    <SkeletonShell
      title="Tags"
      sub="Every tag currently used on your bank cards. Soon you'll create, rename, and delete tags here, auto-tag cards with rules, and attach tags to binder slots or sections so placed cards inherit them."
      groups={groups}
      total={items.length}
      assigned={assigned}
      unassignedLabel="cards untagged"
      ruleAction="add a tag"
      items={items}
    />
  );
}

export function CollectionsPage({ items }: { items: BankItem[] }) {
  const groups = groupBy(items, (i) => (i.collection ? [i.collection] : []));
  const assigned = items.filter((i) => i.collection).length;
  return (
    <>
      <SkeletonShell
        title="Collections"
        sub="Your mini-sets: the collections currently assigned to bank cards. Today a card belongs to one collection; whether collections become multi-value is an open design question for the rules and slot-label milestones (see docs/ROADMAP.md and docs/labels-and-optimize.md)."
        groups={groups}
        total={items.length}
        assigned={assigned}
        unassignedLabel="cards uncollected"
        ruleAction="add to a collection"
        items={items}
      />
    </>
  );
}
