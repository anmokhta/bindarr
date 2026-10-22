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
  const [qName, setQName] = useState("");
  const [qNum, setQNum] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);

  async function lookup() {
    if (!qName.trim()) return;
    setStatus("Searching…");
    setResults([]);
    try {
      const cards = await lookupCards(qName.trim(), qNum);
      if (!cards.length) setStatus("No matches found.");
      else {
        setStatus(`${cards.length} match(es) — click one to fill in:`);
        setResults(cards);
      }
    } catch {
      setStatus("Search unavailable — check your connection. Manual entry above still works.");
    }
  }

  return (
    <div className="edit-form" onClick={(e) => e.stopPropagation()}>
      <input placeholder="Card name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <select value={tag} onChange={(e) => setTag(e.target.value as CardTag)}>
        {(Object.keys(TAGS) as CardTag[]).map((key) => (
          <option key={key} value={key}>{TAGS[key].label}</option>
        ))}
      </select>
      <textarea placeholder="Note (set, condition...)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="ptcg-search">
        <div className="ptcg-search-row">
          <input placeholder="Pokémon TCG name…" value={qName} onChange={(e) => setQName(e.target.value)} />
          <input placeholder="#" value={qNum} onChange={(e) => setQNum(e.target.value)} />
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
