import { useState } from "react";
import { TAGS, type CardSlot } from "@bindarr/shared";

export default function Pocket({
  card,
  isEditing,
  onEdit,
  onClear,
  onSwap,
  onBankDrop,
  index,
}: {
  card: CardSlot | null;
  isEditing: boolean;
  onEdit: () => void;
  onClear: () => void;
  onSwap: (fromIndex: number) => void;
  onBankDrop: (bankItemId: string) => void;
  index: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const tagInfo = card ? TAGS[card.tag] : TAGS.none;

  // Lookup fills note as "Set Name #number" — display it as "Set Name, #number".
  const metaLine = (() => {
    if (!card?.note) return "";
    const m = card.note.match(/^(.*?)\s*#(\S+)$/);
    return m ? `${m[1]}, #${m[2]}` : card.note;
  })();

  return (
    <div
      className={`pocket${card ? " filled" : ""}${card?.image ? " has-image" : ""}${dragOver ? " dragover" : ""}${isEditing ? " editing" : ""}`}
      draggable={!!card}
      onClick={onEdit}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const bankId = e.dataTransfer.getData("application/x-bindarr-bank");
        if (bankId) { onBankDrop(bankId); return; }
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from)) onSwap(from);
      }}
    >
      {card ? (
        <>
          {tagInfo.color && <div className="tag-bar" style={{ background: tagInfo.color }} />}
          {card.image ? (
            <>
              <img className="card-full" src={card.image} alt={card.name} />
              <div className="card-overlay">
                <div className="card-overlay-name">{card.name}</div>
                {metaLine && <div className="card-overlay-meta">{metaLine}</div>}
              </div>
            </>
          ) : (
            <>
              <div className="card-name">{card.name}</div>
              {card.note && <div className="card-note">{card.note}</div>}
              <div className="card-tag">{tagInfo.label !== "No tag" ? tagInfo.label : ""}</div>
            </>
          )}
          <button
            className="remove-btn"
            title="Clear pocket"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            ×
          </button>
        </>
      ) : (
        <>
          <div className="plus">+</div>
          <div className="empty-label">Empty pocket</div>
        </>
      )}
    </div>
  );
}
