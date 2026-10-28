import { useState } from "react";
import { GAMES, type BankItem } from "@bindarr/shared";
import { type TcgCard } from "../api.js";
import { lookupCardsWithFallbacks } from "../bankEnrich.js";

export default function BankItemForm({
  game,
  initial,
  defaultHave = true,
  defaultWant = false,
  onSubmit,
  onCancel,
}: {
  game: string;
  initial?: BankItem | null;
  defaultHave?: boolean;
  defaultWant?: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [have, setHave] = useState(initial?.have ?? defaultHave);
  const [want, setWant] = useState(initial?.want ?? defaultWant);
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
  const [language, setLanguage] = useState(() => {
    const existing = (initial?.language ?? "").trim().toLowerCase();
    if (existing === "ja" || existing === "en") return existing;
    if (/^japanese\b/i.test(initial?.set ?? "")) return "ja";
    return "en";
  });
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
      const hadSet = set.trim().length > 0;
      const cards = await lookupCardsWithFallbacks({
        name: name.trim(),
        number,
        set,
        language: isMisc ? (language.trim() || null) : language,
      });
      setLookupResults(cards);
      if (cards.length) {
        setLookupStatus(`${cards.length} match(es) — click to fill:`);
      } else {
        setLookupStatus(
          language === "ja"
            ? "No matches (JP catalog needs Japanese names; EN fallback found nothing usable)."
            : hadSet
              ? "No matches (tried without set)."
              : "No matches.",
        );
      }
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
        have,
        want,
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
        language: isMisc ? (language.trim() || null) : language,
        condition: condition.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bank-item-form">
      {!isMisc && (
        <div className={`bank-form-lookup${image ? " has-preview" : ""}`}>
          {image && <img className="editor-preview" src={image} alt={name || "Card preview"} />}
          <div className="bank-form-lookup-actions">
            <button type="button" className="btn btn-primary btn-sm lookup-btn" onClick={() => void lookup()}>
              Look up on Pokémon TCG
            </button>
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
        </div>
      )}

      <div className="bank-item-form-grid">
        <label className="field field-span-2">
          <span className="field-label">Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>

        {!isMisc && (
          <>
            <label className="field">
              <span className="field-label">Set</span>
              <input value={set} onChange={(e) => setSet(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Number</span>
              <input value={number} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Language</span>
              <select
                value={language === "ja" ? "ja" : "en"}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Card language"
              >
                <option value="en">English (EN)</option>
                <option value="ja">Japanese (JP)</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Artist</span>
              <input value={artist} onChange={(e) => setArtist(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Evolution line</span>
              <input value={evolutionLine} onChange={(e) => setEvolutionLine(e.target.value)} />
            </label>
          </>
        )}

        {isMisc && (
          <>
            <label className="field">
              <span className="field-label">For game</span>
              <select value={appliesToGame} onChange={(e) => setAppliesToGame(e.target.value)}>
                <option value="">For any game</option>
                {Object.entries(GAMES).map(([id, g]) => <option key={id} value={id}>For {g.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Maker / series</span>
              <input value={maker} onChange={(e) => setMaker(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Year</span>
              <input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Language</span>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </label>
            <label className="field field-span-2">
              <span className="field-label">Condition</span>
              <input value={condition} onChange={(e) => setCondition(e.target.value)} />
            </label>
          </>
        )}

        <div className="field field-span-2">
          <span className="field-label">Have / Want</span>
          <div className="flag-toggle" role="group" aria-label="Have or want">
            <button
              type="button"
              className={`flag-toggle-btn${have ? " active" : ""}`}
              aria-pressed={have}
              onClick={() => setHave((v) => !v)}
            >
              I have it
            </button>
            <button
              type="button"
              className={`flag-toggle-btn${want ? " active" : ""}`}
              aria-pressed={want}
              onClick={() => setWant((v) => !v)}
            >
              I want it
            </button>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Collection</span>
          <input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="Your mini-set" />
        </label>
        <label className="field">
          <span className="field-label">Tags</span>
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Comma separated" />
        </label>
        <label className="field field-span-2">
          <span className="field-label">Image URL</span>
          <input value={image} onChange={(e) => setImage(e.target.value)} />
        </label>
        <label className="field field-span-2">
          <span className="field-label">Notes</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="bank-form-footer">
        <button type="button" className="btn btn-ghost cancel-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary save-btn" disabled={saving || !name.trim()} onClick={() => void submit()}>
          {saving ? "Saving…" : "Save to bank"}
        </button>
      </div>
    </div>
  );
}
