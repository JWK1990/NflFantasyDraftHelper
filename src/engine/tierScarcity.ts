import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
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

export function nextTierPlayer(
  player: Player,
  available: Player[],
): Player | null {
  return (
    available
      .filter(
        (candidate) =>
          candidate.pos === player.pos &&
          candidate.id !== player.id &&
          candidate.posTier > player.posTier,
      )
      .sort((a, b) => a.modelRank - b.modelRank)[0] ?? null
  );
}

export function tierCliffDrop(player: Player, available: Player[]): number {
  const sameTierLeft = available.filter(
    (candidate) =>
      candidate.pos === player.pos &&
      candidate.posTier === player.posTier &&
      candidate.id !== player.id,
  ).length;
  if (sameTierLeft > 0) return 0;
  const next = nextTierPlayer(player, available);
  return Math.max(0, player.vorp - (next?.vorp ?? 0));
}

export function tierCliffBonus(
  player: Player,
  available: Player[],
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  const drop = tierCliffDrop(player, available);
  if (drop < config.cliff.minVorp) return 0;
  return Math.min(config.cliff.cap, drop * config.cliff.scale);
}

export function nearestEndingTiers(
  remaining: Map<TierKey, number>,
  limit = 4,
): { pos: Position; posTier: number; left: number }[] {
  const rows: { pos: Position; posTier: number; left: number }[] = [];
  for (const [key, left] of remaining) {
    if (left <= 0 || left > 3) continue;
    const [pos, posTierRaw] = key.split("-");
    rows.push({
      pos: pos as Position,
      posTier: Number(posTierRaw),
      left,
    });
  }
  rows.sort((a, b) => a.left - b.left || a.posTier - b.posTier);
  return rows.slice(0, limit);
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
