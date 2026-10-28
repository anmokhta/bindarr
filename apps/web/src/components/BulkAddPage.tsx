import { useEffect, useMemo, useState } from "react";
import { GAMES, type BankItem, type GameId } from "@bindarr/shared";
import { importBankItems, type TcgCard } from "../api.js";
import { lookupCardsWithFallbacks, pickLookupCard } from "../bankEnrich.js";
import { parseBulkAddLines, type BulkAddLine } from "../bankImport.js";
import { evolutionLineFor } from "../evolutionLines.js";

type Phase = "paste" | "review" | "done";
type Destination = "have" | "want" | "both";

interface StagedCard {
  line: BulkAddLine;
  mode: "matched" | "unmatched";
  card?: TcgCard;
}

function toImportPayload(
  staged: StagedCard,
  game: string,
  destination: Destination,
  language: "en" | "ja",
): Record<string, unknown> {
  const have = destination === "have" || destination === "both";
  const want = destination === "want" || destination === "both";
  if (staged.mode === "matched" && staged.card) {
    const c = staged.card;
    return {
      game,
      name: c.name,
      set: c.setName,
      number: c.number,
      apiId: c.id,
      image: c.imageSmall,
      artist: c.artist,
      evolutionLine: evolutionLineFor(c.name, c.evolvesFrom),
      have,
      want,
      language,
      tags: [],
    };
  }
  return {
    game,
    name: staged.line.name,
    set: "",
    number: staged.line.number,
    have,
    want,
    language,
    tags: [],
  };
}

export default function BulkAddPage({
  visibleBanks,
  onImported,
}: {
  visibleBanks: string[];
  items?: BankItem[];
  onImported: () => Promise<void>;
}) {
  const banks = useMemo(
    () => visibleBanks.filter((id) => id in GAMES || id === "misc"),
    [visibleBanks],
  );
  const [game, setGame] = useState(banks[0] ?? "pokemon");
  const [destination, setDestination] = useState<Destination>("have");
  const [cardLang, setCardLang] = useState<"en" | "ja">("en");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("paste");
  const [queue, setQueue] = useState<BulkAddLine[]>([]);
  const [index, setIndex] = useState(0);
  const [staged, setStaged] = useState<StagedCard[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [lookupStatus, setLookupStatus] = useState("");
  const [lookupResults, setLookupResults] = useState<TcgCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState("");

  const current = queue[index] ?? null;
  const isPokemon = game === "pokemon";

  useEffect(() => {
    if (!banks.includes(game) && banks[0]) setGame(banks[0]);
  }, [banks, game]);

  async function runLookup(name: string, number: string) {
    if (!isPokemon) {
      setLookupResults([]);
      setSelectedId(null);
      setLookupStatus("Misc bank — no TCG lookup.");
      return;
    }
    if (!name.trim()) {
      setLookupResults([]);
      setSelectedId(null);
      setLookupStatus("Type a name to search.");
      return;
    }
    setLookupStatus("Searching…");
    setLookupResults([]);
    setSelectedId(null);
    try {
      const cards = await lookupCardsWithFallbacks({
        name: name.trim(),
        number: number.trim(),
        set: "",
        language: cardLang,
      });
      setLookupResults(cards);
      const pick = pickLookupCard(cards);
      setSelectedId(pick?.id ?? null);
      setLookupStatus(
        cards.length
          ? `${cards.length} match${cards.length === 1 ? "" : "es"} — pick one or add without match.`
          : "No matches.",
      );
    } catch (e) {
      setLookupStatus(e instanceof Error ? e.message : "Lookup failed");
    }
  }

  useEffect(() => {
    if (phase !== "review" || !current) return;
    setEditName(current.name);
    setEditNumber(current.number);
    void runLookup(current.name, current.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, current?.raw]);

  function startReview() {
    const lines = parseBulkAddLines(text);
    const ok = lines.filter((l) => l.ok);
    if (!ok.length) {
      setSummary(lines.length ? "No valid lines to review." : "Paste at least one card line.");
      return;
    }
    setQueue(ok);
    setIndex(0);
    setStaged([]);
    setSkipped(0);
    setSummary("");
    setPhase("review");
  }

  function stageAndAdvance(entry: StagedCard | null) {
    const nextStaged = entry ? [...staged, entry] : staged;
    const nextSkipped = entry ? skipped : skipped + 1;
    if (entry) setStaged(nextStaged);
    else setSkipped(nextSkipped);

    if (index + 1 >= queue.length) {
      void finish(nextStaged, nextSkipped);
      return;
    }
    setIndex((i) => i + 1);
  }

  function addMatched() {
    if (!current) return;
    const card = lookupResults.find((c) => c.id === selectedId) ?? pickLookupCard(lookupResults);
    if (!card) return;
    stageAndAdvance({ line: current, mode: "matched", card });
  }

  function addUnmatched() {
    if (!current) return;
    stageAndAdvance({
      line: { ...current, name: editName.trim() || current.name, number: editNumber.trim() },
      mode: "unmatched",
    });
  }

  function skip() {
    stageAndAdvance(null);
  }

  function goBack() {
    if (index <= 0) {
      setPhase("paste");
      return;
    }
    // Unstage the previous confirmation if it was staged (not skipped).
    // Skips aren't stored, so going back from after a skip only decrements index.
    const prevIndex = index - 1;
    if (staged.length && staged[staged.length - 1]?.line.raw === queue[prevIndex]?.raw) {
      setStaged((s) => s.slice(0, -1));
    } else {
      setSkipped((n) => Math.max(0, n - 1));
    }
    setIndex(prevIndex);
  }

  async function finish(finalStaged: StagedCard[], finalSkipped: number) {
    setSaving(true);
    setSummary("Saving…");
    try {
      if (finalStaged.length) {
        const items = finalStaged.map((s) => toImportPayload(s, game, destination, cardLang));
        const result = await importBankItems(items);
        await onImported();
        setSummary(
          `Added ${result.created} · updated ${result.updated} · skipped ${finalSkipped}.`,
        );
      } else {
        setSummary(`Nothing added · skipped ${finalSkipped}.`);
      }
      setPhase("done");
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "Save failed");
      setPhase("done");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setPhase("paste");
    setQueue([]);
    setIndex(0);
    setStaged([]);
    setSkipped(0);
    setLookupResults([]);
    setSelectedId(null);
    setSummary("");
  }

  const selected = lookupResults.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="page-section">
      <h2 className="page-title">Bulk add</h2>
      <p className="page-sub">
        Paste a list of names and numbers, then confirm each TCGdex match (or add without one).
      </p>

      {phase === "paste" && (
        <>
          <div className="bank-filters-bar">
            <label className="bank-sort-control">
              <span>Game</span>
              <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game">
                {banks.map((id) => (
                  <option key={id} value={id}>
                    {id === "misc" ? "Misc" : GAMES[id as GameId]?.label ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="bank-sort-control">
              <span>Add as</span>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value as Destination)}
                aria-label="Have or want"
              >
                <option value="have">Have</option>
                <option value="want">Want</option>
                <option value="both">Have + Want</option>
              </select>
            </label>
            {game !== "misc" && (
              <label className="bank-sort-control">
                <span>Language</span>
                <select
                  value={cardLang}
                  onChange={(e) => setCardLang(e.target.value === "ja" ? "ja" : "en")}
                  aria-label="Card language"
                >
                  <option value="en">English (EN)</option>
                  <option value="ja">Japanese (JP)</option>
                </select>
              </label>
            )}
          </div>
          <label className="field" style={{ display: "block", marginTop: 12 }}>
            <span className="field-label">Cards (one per line)</span>
            <textarea
              className="bulk-add-textarea"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Pikachu #58\nCharizard, 4\nMewtwo\t150"}
              aria-label="Card list"
            />
          </label>
          <p className="page-sub">
            Formats: <code>Name #58</code>, <code>Name 58</code>, <code>Name, 58</code>, or <code>Name</code> alone.
          </p>
          <div className="bank-actions-row">
            <button type="button" className="btn btn-primary primary-btn" onClick={startReview} disabled={!text.trim()}>
              Start review
            </button>
          </div>
          {summary && <p className="import-notice" role="status">{summary}</p>}
        </>
      )}

      {phase === "review" && current && (
        <>
          <div className="bank-actions-row">
            <span className="bank-count" role="status">
              Card {index + 1} of {queue.length}
              {staged.length || skipped ? ` · staged ${staged.length}, skipped ${skipped}` : ""}
            </span>
          </div>
          <div className="bulk-add-review">
            <div className="bank-item-form-grid">
              <label className="field">
                <span className="field-label">Name</span>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Number</span>
                <input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} />
              </label>
            </div>
            {isPokemon && (
              <div className="bank-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void runLookup(editName, editNumber)}
                >
                  Search again
                </button>
                {lookupStatus && <span className="bank-count">{lookupStatus}</span>}
              </div>
            )}
            {selected?.imageSmall && (
              <img className="editor-preview bulk-add-preview" src={selected.imageSmall} alt={selected.name} />
            )}
            <div className="ptcg-results">
              {lookupResults.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`ptcg-result${c.id === selectedId ? " selected" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.imageSmall && <img src={c.imageSmall} alt="" />}
                  <span>
                    {c.name} — {c.setName} #{c.number}
                    {c.artist ? ` · ${c.artist}` : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="bank-actions-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={goBack} disabled={saving}>
                Back
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={skip} disabled={saving}>
                Skip
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addUnmatched} disabled={saving}>
                Add without match
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={addMatched}
                disabled={saving || !selectedId || !isPokemon}
              >
                Add match
              </button>
            </div>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <p className="import-notice" role="status">{summary}</p>
          <div className="bank-actions-row">
            <button type="button" className="btn btn-primary primary-btn" onClick={reset}>
              Add more
            </button>
          </div>
        </>
      )}
    </section>
  );
}
