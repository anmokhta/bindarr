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

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`GET /api/settings failed: ${res.status}`);
  const data = await res.json();
  return parseAppSettings(data.settings);
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
