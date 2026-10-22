import { useState } from "react";
import { TAGS, bankItemToSlot, type BankItem, type CardSlot, type CardTag } from "@bindarr/shared";
import { lookupCards, type TcgCard } from "../api.js";
import BankPicker from "./BankPicker.js";

export type BankPayload = Record<string, unknown>;

export default function PocketEditor({
  card,
  onSave,
  onCancel,
  bankItems,
  visibleBanks,
  onCreateBankItem,
  onArtist,
}: {
  card: CardSlot | null;
  onSave: (card: CardSlot) => void;
  onCancel: () => void;
  bankItems: BankItem[];
  visibleBanks: string[];
  onCreateBankItem: (payload: BankPayload) => Promise<BankItem>;
  onArtist?: (name: string) => void;
}) {
  const [tab, setTab] = useState<"bank" | "new">("new");
  const [name, setName] = useState(card?.name ?? "");
  const [tag, setTag] = useState<CardTag>(card?.tag ?? "none");
  const [note, setNote] = useState(card?.note ?? "");
  const [image, setImage] = useState<string | null>(card?.image ?? null);
  const [qName, setQName] = useState(card?.name ?? "");
  const [searchTouched, setSearchTouched] = useState(false);
  const [qNum, setQNum] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);
  const [picked, setPicked] = useState<TcgCard | null>(null);

  // Bank metadata (used when saving this card to the bank)
  const [saveToBank, setSaveToBank] = useState(false);
  const [evolutionLine, setEvolutionLine] = useState("");
  const [collection, setCollection] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);

  async function lookup() {
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

  function pickResult(c: TcgCard) {
    setPicked(c);
    setName(c.name);
    setNote(`${c.setName ? c.setName + " " : ""}#${c.number}`);
    setImage(c.imageSmall);
    setEvolutionLine(c.evolvesFrom ?? c.name);
    setSaveToBank(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    let bankId: string | null = card?.bankId ?? null;
    if (saveToBank) {
      setSaving(true);
      try {
        const item = await onCreateBankItem({
          game: "pokemon",
          apiId: picked?.id ?? null,
          name: name.trim(),
          set: picked?.setName ?? "",
          number: picked?.number ?? "",
          artist: picked?.artist ?? null,
          evolutionLine: evolutionLine.trim() || null,
          collection: collection.trim() || null,
          tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
          image,
          note: note.trim(),
        });
        bankId = item.id;
      } catch {
        setStatus("Could not save to the bank — the pocket will still be saved.");
      } finally {
        setSaving(false);
      }
    }
    onSave({ name: name.trim(), tag, note: note.trim(), image, bankId });
  }

  return (
    <div className="editor-tabs-wrap">
      <div className="editor-tabs" role="tablist" aria-label="Add a card">
        <button role="tab" aria-selected={tab === "bank"} className={`editor-tab${tab === "bank" ? " active" : ""}`} onClick={() => setTab("bank")}>
          Bank
        </button>
        <button role="tab" aria-selected={tab === "new"} className={`editor-tab${tab === "new" ? " active" : ""}`} onClick={() => setTab("new")}>
          New
        </button>
      </div>

      {tab === "bank" ? (
        <BankPicker
          items={bankItems}
          banks={visibleBanks}
          onFill={(item) => onSave(bankItemToSlot(item))}
        />
      ) : (
        <div className="edit-form" onClick={(e) => e.stopPropagation()}>
          {image && <img className="editor-preview" src={image} alt={name} />}
          <input
            placeholder="Card name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
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
                <span key={c.id} className="ptcg-result-row">
                  <button type="button" className="ptcg-result" onClick={() => pickResult(c)}>
                    {c.imageSmall && <img src={c.imageSmall} alt="" />}
                    <span>{c.name} — {c.setName} #{c.number}</span>
                  </button>
                  {c.artist && onArtist && (
                    <button type="button" className="artist-link" onClick={() => onArtist(c.artist!)}>More by {c.artist}</button>
                  )}
                </span>
              ))}
            </div>
          </div>

          <label className="save-to-bank">
            <input type="checkbox" checked={saveToBank} onChange={(e) => setSaveToBank(e.target.checked)} />
            Also save to bank
          </label>
          {saveToBank && (
            <div className="bank-meta-fields">
              <input placeholder="Evolution line (e.g. Charmander)" value={evolutionLine} onChange={(e) => setEvolutionLine(e.target.value)} />
              <input placeholder="Collection (your mini-set)" value={collection} onChange={(e) => setCollection(e.target.value)} />
              <input placeholder="Tags, comma separated" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>
          )}

          <div className="edit-actions">
            <button className="save-btn" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
