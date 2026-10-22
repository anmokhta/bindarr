import { parsePlannerState, type PlannerState } from "@bindarr/shared";

export async function fetchState(): Promise<{ state: PlannerState; updatedAt: string | null }> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  const data = await res.json();
  const state = parsePlannerState(data.state);
  if (!state) throw new Error("Server returned invalid planner state");
  return { state, updatedAt: data.updatedAt ?? null };
}

export async function saveState(state: PlannerState): Promise<void> {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
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
  let q = `name:"${name.replace(/"/g, "")}"`;
  if (number.trim()) q += ` number:${number.trim()}`;
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("bad response");
  const data = await res.json();
  return (data.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    number: c.number,
    setName: c.set?.name ?? "",
    imageSmall: c.images?.small ?? null,
  }));
}
