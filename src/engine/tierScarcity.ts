import type { Player, Position } from "../domain/types.ts";

export type TierKey = `${Position}-${number}`;

export function remainingByPosTier(available: Player[]): Map<TierKey, number> {
  const counts = new Map<TierKey, number>();
  for (const player of available) {
    const key: TierKey = `${player.pos}-${player.posTier}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const EDGE_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export function currentEdgeTiers(
  remaining: Map<TierKey, number>,
): { pos: Position; posTier: number; left: number }[] {
  return EDGE_POSITIONS.flatMap((pos) => {
    const edge = [...remaining.entries()]
      .map(([key, left]) => {
        const [keyPos, posTierRaw] = key.split("-");
        return {
          pos: keyPos as Position,
          posTier: Number(posTierRaw),
          left,
        };
      })
      .filter((row) => row.pos === pos && row.left > 0)
      .sort((a, b) => a.posTier - b.posTier)[0];
    return edge ? [edge] : [];
  });
}
