import { parsePlannerState, type PlannerState } from "@bindarr/shared";

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
}

export async function lookupCards(name: string, number: string): Promise<TcgCard[]> {
  const params = new URLSearchParams({ name });
  if (number.trim()) params.set("number", number.trim());
  const res = await fetch(`/api/lookup?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Lookup failed (HTTP ${res.status})`);
  return (data.cards ?? []) as TcgCard[];
}
