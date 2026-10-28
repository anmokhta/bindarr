import { useState } from "react";
import { TAGS, resolveSlotView, type BankItem, type CardSlot } from "@bindarr/shared";
import ArtistLinkButton from "./ArtistLinkButton.js";

export default function Pocket({
  card,
  bankItems,
  isEditing,
  onArtist,
  onEdit,
  onClear,
  onSwap,
  onBankDrop,
  index,
  dragKey,
}: {
  card: CardSlot | null;
  bankItems: BankItem[];
  isEditing: boolean;
  onArtist?: (name: string) => void;
  onEdit: () => void;
  onClear: () => void;
  onSwap: (fromKey: string) => void;
  onBankDrop: (bankItemId: string) => void;
  index: number;
  dragKey?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const view = resolveSlotView(card, bankItems);
  const tagInfo = view ? TAGS[view.tag] : TAGS.none;

  // Note often "Set Name #number" — display as "Set Name, #number".
  const metaLine = (() => {
    if (!view?.note) return "";
    const m = view.note.match(/^(.*?)\s*#(\S+)$/);
    return m ? `${m[1]}, #${m[2]}` : view.note;
  })();

  return (
    <div
      className={`pocket${view ? " filled" : ""}${view?.image ? " has-image" : ""}${view?.wishlistOnly ? " wishlist-only" : ""}${view?.orphan ? " orphan" : ""}${dragOver ? " dragover" : ""}${isEditing ? " editing" : ""}`}
      draggable={!!card}
      onClick={onEdit}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", dragKey ?? String(index))}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const bankId = e.dataTransfer.getData("application/x-bindarr-bank");
        if (bankId) { onBankDrop(bankId); return; }
        const from = e.dataTransfer.getData("text/plain");
        if (from) onSwap(from);
      }}
    >
      {view ? (
        <>
          {tagInfo.color && <div className="tag-bar" style={{ background: tagInfo.color }} />}
          {view.image ? (
            <>
              <img className="card-full" src={view.image} alt={view.name} />
              <div className="card-overlay">
                <div className="card-overlay-name">{view.name}</div>
                <div className="card-overlay-meta-row">
                  {metaLine && <div className="card-overlay-meta">{metaLine}</div>}
                  {view.artist && onArtist && <ArtistLinkButton artist={view.artist} onClick={onArtist} />}
                </div>
                {view.wishlistOnly && <div className="card-overlay-meta wishlist-badge">Wishlist</div>}
                {view.orphan && <div className="card-overlay-meta wishlist-badge">Missing bank card</div>}
              </div>
            </>
          ) : (
            <>
              <div className="card-name">{view.name}</div>
              {view.note && <div className="card-note">{view.note}</div>}
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
