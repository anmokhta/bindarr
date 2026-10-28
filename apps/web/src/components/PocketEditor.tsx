import { useState } from "react";
import {
  TAGS,
  bankItemPocketNote,
  bankItemToSlot,
  type BankItem,
  type CardSlot,
  type CardTag,
} from "@bindarr/shared";
import { type TcgCard } from "../api.js";
import { lookupCardsWithFallbacks } from "../bankEnrich.js";
import BankPicker from "./BankPicker.js";
import ArtistLinkButton from "./ArtistLinkButton.js";

export type BankPayload = Record<string, unknown>;

function seedFromCard(card: CardSlot | null, bankItems: BankItem[]) {
  const linked = card?.bankId ? bankItems.find((i) => i.id === card.bankId) : undefined;
  if (linked) {
    return {
      linked,
      name: linked.name,
      note: bankItemPocketNote(linked),
      image: linked.image,
      tag: (card?.tag ?? "none") as CardTag,
      evolutionLine: linked.evolutionLine ?? "",
      collection: linked.collection ?? "",
      tagsText: linked.tags.join(", "),
    };
  }
  return {
    linked: undefined as BankItem | undefined,
    name: card?.name ?? "",
    note: card?.note ?? "",
    image: (card?.image ?? null) as string | null,
    tag: (card?.tag ?? "none") as CardTag,
    evolutionLine: "",
    collection: "",
    tagsText: "",
  };
}

export default function PocketEditor({
  card,
  onSave,
  onCancel,
  bankItems,
  visibleBanks,
  onCreateBankItem,
  onUpdateBankItem,
  onArtist,
}: {
  card: CardSlot | null;
  onSave: (card: CardSlot) => void;
  onCancel: () => void;
  bankItems: BankItem[];
  visibleBanks: string[];
  onCreateBankItem: (payload: BankPayload) => Promise<BankItem>;
  onUpdateBankItem?: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onArtist?: (name: string) => void;
}) {
  const initial = seedFromCard(card, bankItems);
  const isLinked = !!initial.linked;
  const isFilled = !!card;
  const detailsTabLabel = isFilled ? "Details" : "New";

  const [tab, setTab] = useState<"bank" | "new">(isLinked ? "new" : "bank");
  const [name, setName] = useState(initial.name);
  const [tag, setTag] = useState<CardTag>(initial.tag);
  const [note, setNote] = useState(initial.note);
  const [image, setImage] = useState<string | null>(initial.image);
  const [qName, setQName] = useState(initial.name);
  const [searchTouched, setSearchTouched] = useState(false);
  const [qNum, setQNum] = useState(initial.linked?.number ?? "");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<TcgCard[]>([]);
  const [picked, setPicked] = useState<TcgCard | null>(null);
  const [evolutionLine, setEvolutionLine] = useState(initial.evolutionLine);
  const [collection, setCollection] = useState(initial.collection);
  const [tagsText, setTagsText] = useState(initial.tagsText);
  const [saving, setSaving] = useState(false);

  const linked = card?.bankId ? bankItems.find((i) => i.id === card.bankId) : undefined;
  const isOrphan = !!(card?.bankId && !linked);
  const isWishlistLinked = !!linked && linked.want && !linked.have;
  const isHaveLinked = !!linked && linked.have;

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
      const cards = await lookupCardsWithFallbacks({ name: term, number: qNum, set: "" });
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
    setQNum(c.number);
  }

  function parseSetNumber(noteText: string): { set: string; number: string } {
    const m = noteText.trim().match(/^(.*?)\s*#(\S+)\s*$/);
    if (m) return { set: m[1].trim(), number: m[2].trim() };
    return { set: "", number: qNum.trim() };
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setStatus("");
    try {
      const fromNote = parseSetNumber(note);
      const setName = picked?.setName || fromNote.set || linked?.set || "";
      const number = picked?.number || fromNote.number || linked?.number || "";
      const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);

      if (linked && onUpdateBankItem) {
        const payload = {
          ...linked,
          apiId: picked?.id ?? linked.apiId,
          name: name.trim(),
          set: setName,
          number,
          artist: picked?.artist ?? linked.artist,
          evolutionLine: evolutionLine.trim() || null,
          collection: collection.trim() || null,
          tags,
          image,
          note: note.trim(),
        };
        await onUpdateBankItem(linked.id, payload);
        onSave(bankItemToSlot({ ...linked, ...payload, id: linked.id }, tag));
      } else {
        const item = await onCreateBankItem({
          game: "pokemon",
          apiId: picked?.id ?? null,
          name: name.trim(),
          set: setName,
          number,
          artist: picked?.artist ?? null,
          evolutionLine: evolutionLine.trim() || null,
          collection: collection.trim() || null,
          tags,
          image,
          note: note.trim(),
          have: true,
          want: false,
        });
        onSave(bankItemToSlot(item, tag));
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save to the bank.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkObtained() {
    if (!linked || !onUpdateBankItem || saving) return;
    setSaving(true);
    try {
      await onUpdateBankItem(linked.id, { ...linked, have: true, want: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-tabs-wrap">
      <div className="editor-tabs" role="tablist" aria-label="Add a card">
        <button role="tab" aria-selected={tab === "bank"} className={`editor-tab${tab === "bank" ? " active" : ""}`} onClick={() => setTab("bank")}>
          Bank
        </button>
        <button role="tab" aria-selected={tab === "new"} className={`editor-tab${tab === "new" ? " active" : ""}`} onClick={() => setTab("new")}>
          {detailsTabLabel}
        </button>
      </div>

      {tab === "bank" ? (
        <BankPicker
          items={bankItems}
          banks={visibleBanks}
          onFill={(item) => onSave(bankItemToSlot(item, tag))}
        />
      ) : (
        <div className="edit-form" onClick={(e) => e.stopPropagation()}>
          {isHaveLinked && (
            <p className="editor-link-note" role="status">
              <span className="editor-link-chip">In bank</span>
              This pocket shows the bank card. Save updates the bank; tag is for this pocket only.
            </p>
          )}
          {isWishlistLinked && (
            <p className="editor-link-note wishlist" role="status">
              <span className="editor-link-chip wishlist">On wishlist</span>
              This pocket shows the wishlist card. Save updates the bank; tag is for this pocket only.
            </p>
          )}
          {isOrphan && (
            <p className="editor-link-note" role="status">
              <span className="editor-link-chip">Missing</span>
              This pocket’s bank card was removed. Pick one from Bank, or save to create a new bank card.
            </p>
          )}
          {!isLinked && !isOrphan && (
            <p className="editor-link-note" role="status">
              Saving creates a bank card and links this pocket to it.
            </p>
          )}

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
              <button type="button" onClick={() => void lookup()}>Look up</button>
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
                    <ArtistLinkButton artist={c.artist} onClick={onArtist} />
                  )}
                </span>
              ))}
            </div>
          </div>

          <div className="bank-meta-fields">
            <input placeholder="Evolution line (e.g. Charmander)" value={evolutionLine} onChange={(e) => setEvolutionLine(e.target.value)} />
            <input placeholder="Collection (your mini-set)" value={collection} onChange={(e) => setCollection(e.target.value)} />
            <input placeholder="Tags, comma separated" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
          </div>

          {isWishlistLinked && onUpdateBankItem && (
            <button
              type="button"
              className="btn btn-secondary bank-mark-obtained"
              disabled={saving}
              onClick={() => void handleMarkObtained()}
            >
              {saving ? "Updating…" : "Mark obtained"}
            </button>
          )}

          <div className="edit-actions">
            <button className="save-btn" disabled={saving || !name.trim()} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
