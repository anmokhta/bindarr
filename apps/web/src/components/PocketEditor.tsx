import { useState } from "react";
import { TAGS, type CardSlot, type CardTag } from "@bindarr/shared";
import { lookupCards, type TcgCard } from "../api.js";

export default function PocketEditor({
  card,
  onSave,
  onCancel,
}: {
  card: CardSlot | null;
  onSave: (card: CardSlot) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [tag, setTag] = useState<CardTag>(card?.tag ?? "none");
  const [note, setNote] = useState(card?.note ?? "");
  const [image, setImage] = useState<string | null>(card?.image ?? null);
  const [qName, setQName] = useState(card?.name ?? "");
  // Until the user edits the search box themselves, it mirrors the card name.
  const [searchTouched, setSearchTouched] = useState(false);
  const [qNum, setQNum] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);

  async function lookup() {
    // Fall back to the card-name field so users don't have to retype it.
    const term = qName.trim() || name.trim();
    if (!term) {
      setStatus("Type a card name above (or in the search box) first.");
      return;
    }
    if (!qName.trim()) setQName(term);
    setStatus("Searching…");
    setResults([]);
    try {
      const cards = await lookupCards(term, qNum);
      if (!cards.length) setStatus(`No matches for "${term}".`);
      else {
        setStatus(`${cards.length} match(es) — click one to fill in:`);
        setResults(cards);
      }
    } catch (e) {
      setStatus(`${e instanceof Error ? e.message : "Search failed"}. Manual entry above still works.`);
    }
  }

  return (
    <div className="edit-form" onClick={(e) => e.stopPropagation()}>
      {image && <img className="editor-preview" src={image} alt={name} />}
      <input
        placeholder="Card name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          // The lookup box defaults to the card name until edited directly.
          if (!searchTouched) setQName(e.target.value);
        }}
        autoFocus
      />
      <select value={tag} onChange={(e) => setTag(e.target.value as CardTag)}>
        {(Object.keys(TAGS) as CardTag[]).map((key) => (
          <option key={key} value={key}>{TAGS[key].label}</option>
        ))}
      </select>
      <textarea placeholder="Note (set, condition...)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="ptcg-search">
        <div className="ptcg-search-row">
          <input
            placeholder="Pokémon TCG name…"
            value={qName}
            onChange={(e) => { setQName(e.target.value); setSearchTouched(e.target.value !== ""); }}
            onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }}
          />
          <input
            placeholder="#"
            value={qNum}
            onChange={(e) => setQNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }}
          />
          <button type="button" onClick={lookup}>Look up</button>
        </div>
        {status && <div className="ptcg-status">{status}</div>}
        <div className="ptcg-results">
          {results.map((c) => (
            <button
              type="button"
              key={c.id}
              className="ptcg-result"
              onClick={() => {
                setName(c.name);
                setNote(`${c.setName ? c.setName + " " : ""}#${c.number}`);
                setImage(c.imageSmall);
              }}
            >
              {c.imageSmall && <img src={c.imageSmall} alt="" />}
              <span>{c.name} — {c.setName} #{c.number}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="edit-actions">
        <button
          className="save-btn"
          onClick={() => name.trim() && onSave({ name: name.trim(), tag, note: note.trim(), image })}
        >
          Save
        </button>
        <button className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
