import { useState } from "react";
import { TAGS, type CardSlot } from "@bindarr/shared";
import ArtistLinkButton from "./ArtistLinkButton.js";

export default function Pocket({
  card,
  isEditing,
  wishlistOnly = false,
  artist = null,
  onArtist,
  onEdit,
  onClear,
  onSwap,
  onBankDrop,
  index,
  dragKey,
}: {
  card: CardSlot | null;
  isEditing: boolean;
  wishlistOnly?: boolean;
  artist?: string | null;
  onArtist?: (name: string) => void;
  onEdit: () => void;
  onClear: () => void;
  onSwap: (fromKey: string) => void;
  onBankDrop: (bankItemId: string) => void;
  index: number;
  dragKey?: string;
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
      className={`pocket${card ? " filled" : ""}${card?.image ? " has-image" : ""}${wishlistOnly ? " wishlist-only" : ""}${dragOver ? " dragover" : ""}${isEditing ? " editing" : ""}`}
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
      {card ? (
        <>
          {tagInfo.color && <div className="tag-bar" style={{ background: tagInfo.color }} />}
          {card.image ? (
            <>
              <img className="card-full" src={card.image} alt={card.name} />
              <div className="card-overlay">
                <div className="card-overlay-name">{card.name}</div>
                <div className="card-overlay-meta-row">
                  {metaLine && <div className="card-overlay-meta">{metaLine}</div>}
                  {artist && onArtist && <ArtistLinkButton artist={artist} onClick={onArtist} />}
                </div>
                {wishlistOnly && <div className="card-overlay-meta wishlist-badge">Wishlist</div>}
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
