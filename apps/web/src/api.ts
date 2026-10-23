import {
  parseAppSettings,
  parseBankItem,
  parsePlannerState,
  type AppSettings,
  type BankItem,
  type PlannerState,
} from "@bindarr/shared";

export async function fetchState(): Promise<{ state: PlannerState; updatedAt: string | null }> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  const data = await res.json();
  const state = parsePlannerState(data.state);
  if (!state) throw new Error("Server returned invalid planner state");
  return { state, updatedAt: data.updatedAt ?? null };
}

export async function saveState(state: PlannerState, keepalive = false): Promise<void> {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
    keepalive,
  });
  if (!res.ok) throw new Error(`PUT /api/state failed: ${res.status}`);
}

export interface TcgCard {
  id: string;
  name: string;
  number: string;
  setName: string;
  imageSmall: string | null;
  artist: string | null;
  evolvesFrom: string | null;
  evolvesTo: string[];
}

export async function fetchBank(): Promise<BankItem[]> {
  const res = await fetch("/api/bank");
  if (!res.ok) throw new Error(`GET /api/bank failed: ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((i: unknown) => parseBankItem(i)).filter(Boolean) as BankItem[];
}

export async function createBankItem(payload: Record<string, unknown>): Promise<BankItem> {
  const res = await fetch("/api/bank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `POST /api/bank failed: ${res.status}`);
  return data.item as BankItem;
}

export async function updateBankItem(id: string, payload: Record<string, unknown>): Promise<BankItem> {
  const res = await fetch(`/api/bank/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `PUT /api/bank failed: ${res.status}`);
  return data.item as BankItem;
}

export async function deleteBankItem(id: string): Promise<void> {
  const res = await fetch(`/api/bank/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/bank failed: ${res.status}`);
}

export async function importBankItems(items: Record<string, unknown>[]): Promise<{ created: number; updated: number }> {
  const res = await fetch("/api/bank/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Import failed (${res.status})`);
  return res.json() as Promise<{ created: number; updated: number }>;
}

export interface ApiCallRow {
  id: string;
  createdAt: string;
  day: string;
  provider: string;
  game: string;
  call: string;
  status: string;
  httpStatus: number | null;
}

export async function fetchCallStats(): Promise<{ windows: Record<string, number>; byGame: Record<string, number>; byProvider: Record<string, number> }> {
  const res = await fetch("/api/calls/stats");
  if (!res.ok) throw new Error(`Calls stats failed (${res.status})`);
  return res.json();
}

export async function fetchCalls(range: string): Promise<ApiCallRow[]> {
  const res = await fetch(`/api/calls?range=${encodeURIComponent(range)}`);
  if (!res.ok) throw new Error(`Calls failed (${res.status})`);
  const data = (await res.json()) as { calls: ApiCallRow[] };
  return data.calls;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`GET /api/settings failed: ${res.status}`);
  const data = await res.json();
  return parseAppSettings(data.settings);
}

export interface HealthInfo {
  ok: boolean;
  service: string;
  time: string;
  version?: string;
  writeMode?: boolean;
  writer?: { hostname?: string; pid?: number; startedAt?: string };
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`GET /api/health failed: ${res.status}`);
  return res.json() as Promise<HealthInfo>;
}

export async function takeWriteLease(): Promise<HealthInfo> {
  const res = await fetch("/api/write-lease/takeover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  const data = (await res.json().catch(() => ({}))) as HealthInfo & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Take write access failed (${res.status})`);
  return { ...data, ok: true, service: data.service ?? "bindarr", time: data.time ?? new Date().toISOString(), writeMode: data.writeMode !== false };
}

export interface VersionLatest {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  htmlUrl: string | null;
  error?: string;
}

export async function fetchVersionLatest(): Promise<VersionLatest | null> {
  const res = await fetch("/api/version/latest");
  if (!res.ok) return null;
  return res.json() as Promise<VersionLatest>;
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error(`PUT /api/settings failed: ${res.status}`);
  const data = await res.json();
  return parseAppSettings(data.settings);
}

export async function lookupCards(name: string, number: string): Promise<TcgCard[]> {
  const params = new URLSearchParams({ name });
  if (number.trim()) params.set("number", number.trim());
  const res = await fetch(`/api/lookup?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Lookup failed (HTTP ${res.status})`);
  return ((data.cards ?? []) as Partial<TcgCard>[]).map((c) => ({
    id: c.id ?? "",
    name: c.name ?? "",
    number: c.number ?? "",
    setName: c.setName ?? "",
    imageSmall: c.imageSmall ?? null,
    artist: c.artist ?? null,
    evolvesFrom: c.evolvesFrom ?? null,
    evolvesTo: c.evolvesTo ?? [],
  }));
}
