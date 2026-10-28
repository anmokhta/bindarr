export type BankImportFormat = "bindarr" | "pricecharting" | "json";

export interface BankImportResult {
  format: BankImportFormat;
  items: Record<string, unknown>[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsvRows(text: string): { header: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
  return { header, rows };
}

/**
 * Normalize PriceCharting / lookup card names for TCGdex EN:
 * LV. X → LV.X, trailing Ex → ex, known PC typos.
 */
export function normalizeCardLookupName(name: string): string {
  let n = name.trim();
  n = n.replace(/Killowattrel/gi, "Kilowattrel");
  n = n.replace(/\bLV\.\s*X\b/gi, "LV.X");
  n = n.replace(/(^|\s)Ex\b/g, "$1ex");
  return n.replace(/\s+/g, " ").trim();
}

/** "Jolteon #20" / "Sylveon [Holo] #35" / "Charizard V #SWSH050" → name + number */
export function parsePriceChartingProductName(productName: string): { name: string; number: string } {
  const raw = productName.trim();
  const m = raw.match(/^(.+?)\s+#(\S+)\s*$/);
  if (m) return { name: normalizeCardLookupName(m[1].trim()), number: m[2].trim() };
  return { name: normalizeCardLookupName(raw), number: "" };
}

/** True when PriceCharting console-name indicates a Japanese product line. */
export function isJapaneseConsoleName(consoleName: string): boolean {
  return /japanese/i.test(consoleName);
}

/**
 * "Pokemon Jungle" / "Pokémon Japanese Terastal Festival" → set without
 * leading Pokemon and without a leading Japanese marker (language carries that).
 */
export function parsePriceChartingSet(consoleName: string): string {
  return consoleName
    .trim()
    .replace(/^pok[eé]mon\s+/i, "")
    .replace(/^japanese\s+/i, "")
    .trim();
}

function buildPriceChartingNote(row: Record<string, string>): string {
  const parts: string[] = [];
  const include = (row["include-string"] ?? "").trim();
  const condition = (row["condition-string"] ?? "").trim();
  const grading = (row["grading-company"] ?? "").trim();
  const cert = (row["grading-cert-id"] ?? "").trim();
  const qty = (row.quantity ?? "").trim();
  const notes = (row.notes ?? "").trim();

  if (include) parts.push(include);
  if (condition) parts.push(condition);
  if (grading) parts.push(cert ? `${grading} ${cert}` : grading);
  if (qty && qty !== "1") parts.push(`qty ${qty}`);
  if (notes) parts.push(notes);
  return parts.join(" · ");
}

function mapPriceChartingRow(row: Record<string, string>, game: string): Record<string, unknown> | null {
  const product = (row["product-name"] ?? "").trim();
  if (!product) return null;
  const consoleName = row["console-name"] ?? "";
  const { name, number } = parsePriceChartingProductName(product);
  if (!name) return null;
  const folder = (row.folder ?? "").trim();
  const japanese = isJapaneseConsoleName(consoleName);
  return {
    game,
    name,
    set: parsePriceChartingSet(consoleName),
    number,
    artist: null,
    evolutionLine: null,
    collection: folder || null,
    tags: [],
    have: true,
    want: false,
    image: null,
    note: buildPriceChartingNote(row),
    language: japanese ? "ja" : null,
  };
}

function mapBindarrRow(row: Record<string, string>, game: string): Record<string, unknown> | null {
  const name = (row.name ?? "").trim();
  if (!name) return null;
  return {
    game,
    name,
    set: row.set ?? "",
    number: row.number ?? "",
    artist: row.artist || null,
    evolutionLine: row.evolutionline || null,
    collection: row.collection || null,
    tags: (row.tags ?? "").split(";").map((t) => t.trim()).filter(Boolean),
    have: row.have !== "false",
    want: row.want === "true",
    image: row.image || null,
    note: row.note || "",
    language: (row.language ?? "").trim() || null,
  };
}

export function parseBankImportCsv(text: string, game: string): BankImportResult {
  const { header, rows } = parseCsvRows(text);
  if (!header.length) return { format: "bindarr", items: [] };

  const isPriceCharting = header.includes("product-name") && header.includes("console-name");
  if (isPriceCharting) {
    const items = rows.map((r) => mapPriceChartingRow(r, game)).filter(Boolean) as Record<string, unknown>[];
    return { format: "pricecharting", items };
  }

  const items = rows.map((r) => mapBindarrRow(r, game)).filter(Boolean) as Record<string, unknown>[];
  return { format: "bindarr", items };
}

export interface BulkAddLine {
  raw: string;
  name: string;
  number: string;
  ok: boolean;
  error?: string;
}

/**
 * Parse pasted bulk-add lines into name + number.
 * Accepts: `Pikachu #58`, `Pikachu, 58`, `Pikachu\t58`, or name-only.
 */
export function parseBulkAddLines(text: string): BulkAddLine[] {
  const out: BulkAddLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    let name = "";
    let number = "";
    const hash = raw.match(/^(.+?)\s+#(\S+)\s*$/);
    if (hash) {
      name = normalizeCardLookupName(hash[1].trim());
      number = hash[2].trim();
    } else {
      const parts = raw.split(/[,\t]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        name = normalizeCardLookupName(parts.slice(0, -1).join(" "));
        number = parts[parts.length - 1]!.replace(/^#/, "");
      } else {
        name = normalizeCardLookupName(raw);
      }
    }
    if (!name) out.push({ raw, name: "", number: "", ok: false, error: "Missing name" });
    else out.push({ raw, name, number, ok: true });
  }
  return out;
}

/** Parse uploaded bank import text (CSV Bindarr/PriceCharting, or JSON array). */
export function parseBankImport(text: string, game: string, filename = ""): BankImportResult {
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("[") || (!filename.toLowerCase().endsWith(".csv") && trimmed.startsWith("{"));
  if (looksJson && !filename.toLowerCase().endsWith(".csv")) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>[];
    const items = Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === "object" && String((r as { name?: unknown }).name ?? "").trim()) : [];
    return { format: "json", items };
  }
  return parseBankImportCsv(text, game);
}
