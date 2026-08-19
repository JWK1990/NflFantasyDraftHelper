export type Rng = () => number;

export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = Math.imul(state ^ (state >>> 15), state | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedForScenario(
  stateHash: string,
  scenario: string,
  salt = 0,
): number {
  return fnv1a(`${stateHash}|${scenario}|${salt}`);
}

export function scenarioStreamSalt(baseSalt: number, stream: number): number {
  return baseSalt * 256 + stream;
}

export function weightedSample<T>(
  items: Array<{ item: T; weight: number }>,
  rng: Rng,
): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (total <= 0) return items[0]?.item ?? null;
  let cursor = rng() * total;
  for (const row of items) {
    cursor -= Math.max(0, row.weight);
    if (cursor <= 0) return row.item;
  }
  return items[items.length - 1]?.item ?? null;
}
