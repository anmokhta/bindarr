import { useState } from "react";
import { TAGS, type CardSlot } from "@bindarr/shared";
import PocketEditor from "./PocketEditor.js";

export default function Pocket({
  card,
  editing,
  onEdit,
  onSave,
  onCancelEdit,
  onClear,
  onSwap,
  index,
}: {
  card: CardSlot | null;
  editing: boolean;
  onEdit: () => void;
  onSave: (card: CardSlot) => void;
  onCancelEdit: () => void;
  onClear: () => void;
  onSwap: (fromIndex: number) => void;
  index: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const tagInfo = card ? TAGS[card.tag] : TAGS.none;

  return (
    <div
      className={`pocket${card ? " filled" : ""}${dragOver ? " dragover" : ""}`}
      draggable={!!card && !editing}
      onClick={onEdit}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from)) onSwap(from);
      }}
    >
      {editing ? (
        <PocketEditor card={card} onSave={onSave} onCancel={onCancelEdit} />
      ) : card ? (
        <>
          {tagInfo.color && <div className="tag-bar" style={{ background: tagInfo.color }} />}
          {card.image && <img className="card-thumb" src={card.image} alt={card.name} />}
          <div className="card-name">{card.name}</div>
          {card.note && <div className="card-note">{card.note}</div>}
          <div className="card-tag">{tagInfo.label !== "No tag" ? tagInfo.label : ""}</div>
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
