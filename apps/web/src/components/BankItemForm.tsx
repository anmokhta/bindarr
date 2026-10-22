import { useState } from "react";
import { GAMES, type BankItem } from "@bindarr/shared";
import { lookupCards, type TcgCard } from "../api.js";

export default function BankItemForm({
  game,
  initial,
  onSubmit,
  onCancel,
}: {
  game: string;
  initial?: BankItem | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [set, setSet] = useState(initial?.set ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [artist, setArtist] = useState(initial?.artist ?? "");
  const [evolutionLine, setEvolutionLine] = useState(initial?.evolutionLine ?? "");
  const [collection, setCollection] = useState(initial?.collection ?? "");
  const [tagsText, setTagsText] = useState(initial?.tags.join(", ") ?? "");
  const [image, setImage] = useState(initial?.image ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [appliesToGame, setAppliesToGame] = useState(initial?.appliesToGame ?? "");
  const [maker, setMaker] = useState(initial?.maker ?? "");
  const [year, setYear] = useState(initial?.year?.toString() ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "");
  const [condition, setCondition] = useState(initial?.condition ?? "");
  const [apiId, setApiId] = useState<string | null>(initial?.apiId ?? null);
  const [lookupResults, setLookupResults] = useState<TcgCard[]>([]);
  const [lookupStatus, setLookupStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const isMisc = game === "misc";

  async function lookup() {
    if (!name.trim()) { setLookupStatus("Type a name first."); return; }
    setLookupStatus("Searching…");
    try {
      const cards = await lookupCards(name.trim(), number);
      setLookupResults(cards);
      setLookupStatus(cards.length ? `${cards.length} match(es) — click to fill:` : "No matches.");
    } catch (e) {
      setLookupStatus(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  function pick(c: TcgCard) {
    setApiId(c.id);
    setName(c.name);
    setSet(c.setName);
    setNumber(c.number);
    setArtist(c.artist ?? "");
    setEvolutionLine(c.evolvesFrom ?? c.name);
    setImage(c.imageSmall ?? "");
  }

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...(initial ? { id: initial.id } : {}),
        game,
        apiId,
        name: name.trim(),
        set: set.trim(),
        number: number.trim(),
        artist: artist.trim() || null,
        evolutionLine: evolutionLine.trim() || null,
        collection: collection.trim() || null,
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        image: image.trim() || null,
        note: note.trim(),
        appliesToGame: isMisc ? (appliesToGame || null) : null,
        maker: maker.trim() || null,
        year: year ? Number(year) : null,
        language: language.trim() || null,
        condition: condition.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bank-item-form">
      <h3>{initial ? `Edit ${initial.name}` : isMisc ? "Add misc item" : "Add card"}</h3>
      {image && <img className="editor-preview" src={image} alt={name} />}
      <input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      {!isMisc && (
        <>
          <div className="form-row">
            <input placeholder="Set" value={set} onChange={(e) => setSet(e.target.value)} />
            <input placeholder="Number" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <input placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <input placeholder="Evolution line" value={evolutionLine} onChange={(e) => setEvolutionLine(e.target.value)} />
          <div className="ptcg-search">
            <button type="button" className="lookup-btn" onClick={() => void lookup()}>Look up on Pokémon TCG</button>
            {lookupStatus && <div className="ptcg-status">{lookupStatus}</div>}
            <div className="ptcg-results">
              {lookupResults.map((c) => (
                <button type="button" key={c.id} className="ptcg-result" onClick={() => pick(c)}>
                  {c.imageSmall && <img src={c.imageSmall} alt="" />}
                  <span>{c.name} — {c.setName} #{c.number}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {isMisc && (
        <>
          <div className="form-row">
            <select value={appliesToGame} onChange={(e) => setAppliesToGame(e.target.value)}>
              <option value="">For any game</option>
              {Object.entries(GAMES).map(([id, g]) => <option key={id} value={id}>For {g.label}</option>)}
            </select>
            <input placeholder="Maker / series" value={maker} onChange={(e) => setMaker(e.target.value)} />
          </div>
          <div className="form-row">
            <input placeholder="Year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
            <input placeholder="Language" value={language} onChange={(e) => setLanguage(e.target.value)} />
            <input placeholder="Condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
          </div>
        </>
      )}
      <input placeholder="Collection (your mini-set)" value={collection} onChange={(e) => setCollection(e.target.value)} />
      <input placeholder="Tags, comma separated" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
      <input placeholder="Image URL" value={image} onChange={(e) => setImage(e.target.value)} />
      <textarea placeholder="Notes" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="edit-actions">
        <button className="save-btn" disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : "Save to bank"}</button>
        <button className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
