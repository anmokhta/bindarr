import { useState } from "react";
import { TAGS, bankItemToSlot, type BankItem, type CardSlot, type CardTag } from "@bindarr/shared";
import { type TcgCard } from "../api.js";
import { lookupCardsWithFallbacks } from "../bankEnrich.js";
import BankPicker from "./BankPicker.js";
import ArtistLinkButton from "./ArtistLinkButton.js";

export type BankPayload = Record<string, unknown>;

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
  const linked = card?.bankId ? bankItems.find((i) => i.id === card.bankId) : undefined;
  const isLinked = !!linked;
  const isWishlistLinked = !!linked && linked.want && !linked.have;
  const isHaveLinked = !!linked && linked.have;
  const isFilled = !!card;
  const detailsTabLabel = isFilled ? "Details" : "New";

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

  // Bank metadata (used when saving this card to the bank) — only for unlinked pockets
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
      // Pocket note often holds "Set #number"; pass empty set — number box is the reliable field.
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
    // Don't auto-check when already linked — that would create a duplicate bank entry
    if (!isLinked) setSaveToBank(true);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    let bankId: string | null = card?.bankId ?? null;
    if (saveToBank && !isLinked) {
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
          onFill={(item) => onSave(bankItemToSlot(item))}
        />
      ) : (
        <div className="edit-form" onClick={(e) => e.stopPropagation()}>
          {isHaveLinked && (
            <p className="editor-link-note" role="status">
              <span className="editor-link-chip">In bank</span>
              Linked to bank — Save updates this pocket only.
            </p>
          )}
          {isWishlistLinked && (
            <p className="editor-link-note wishlist" role="status">
              <span className="editor-link-chip wishlist">On wishlist</span>
              Already on your wishlist — Save updates this pocket only (does not add another bank entry).
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
                    <ArtistLinkButton artist={c.artist} onClick={onArtist} />
                  )}
                </span>
              ))}
            </div>
          </div>

          {!isLinked && (
            <>
              <label className="save-to-bank">
                <input type="checkbox" checked={saveToBank} onChange={(e) => setSaveToBank(e.target.checked)} />
                Also add to bank
              </label>
              <p className="save-to-bank-hint">Creates a new bank or wishlist entry when you save.</p>
              {saveToBank && (
                <div className="bank-meta-fields">
                  <input placeholder="Evolution line (e.g. Charmander)" value={evolutionLine} onChange={(e) => setEvolutionLine(e.target.value)} />
                  <input placeholder="Collection (your mini-set)" value={collection} onChange={(e) => setCollection(e.target.value)} />
                  <input placeholder="Tags, comma separated" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
                </div>
              )}
            </>
          )}

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
