import { useMemo, useState } from "react";
import Modal from "./Modal.js";
import type { BankImportFormat } from "../bankImport.js";

export default function ImportPreviewModal({
  items,
  format,
  importing,
  onCancel,
  onConfirm,
}: {
  items: Record<string, unknown>[];
  format: BankImportFormat;
  importing: boolean;
  onCancel: () => void;
  onConfirm: (selected: Record<string, unknown>[]) => void;
}) {
  const [selected, setSelected] = useState<boolean[]>(() => items.map(() => true));

  const selectedCount = useMemo(() => selected.filter(Boolean).length, [selected]);

  function toggle(i: number) {
    setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function selectAll() {
    setSelected(items.map(() => true));
  }

  function selectNone() {
    setSelected(items.map(() => false));
  }

  const title =
    format === "pricecharting"
      ? `Import preview (PriceCharting) — ${items.length} items`
      : `Import preview — ${items.length} items`;

  return (
    <Modal title={title} onClose={importing ? () => undefined : onCancel}>
      <div className="import-preview">
        <div className="import-preview-toolbar">
          <button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={selectAll}>
            Select all
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={selectNone}>
            Select none
          </button>
          <span className="bank-count">{selectedCount} of {items.length} selected</span>
        </div>
        <ul className="import-preview-list">
          {items.map((item, i) => {
            const name = String(item.name ?? "");
            const set = String(item.set ?? "");
            const number = String(item.number ?? "");
            const note = String(item.note ?? "");
            return (
              <li key={`${name}-${set}-${number}-${i}`}>
                <label className={`import-preview-row${selected[i] ? "" : " unchecked"}`}>
                  <input
                    type="checkbox"
                    checked={selected[i]}
                    disabled={importing}
                    onChange={() => toggle(i)}
                  />
                  <span className="import-preview-main">
                    <strong>{name || "(unnamed)"}</strong>
                    <span className="import-preview-meta">
                      {[set, number ? `#${number}` : ""].filter(Boolean).join(" ")}
                    </span>
                    {note && <span className="import-preview-note">{note}</span>}
                  </span>
                  {format === "pricecharting" && (
                    <span className="mini-chip import-preview-badge">PC</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="bank-form-footer">
          <button type="button" className="btn btn-ghost cancel-btn" disabled={importing} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary save-btn"
            disabled={importing || selectedCount === 0}
            onClick={() => onConfirm(items.filter((_, i) => selected[i]))}
          >
            {importing ? "Importing…" : `Import ${selectedCount} selected`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
