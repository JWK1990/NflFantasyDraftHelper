import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player } from "../domain/types.ts";
import { adpWindowIds, remainingOpponentPicks } from "./draftSim.ts";
import { nextUserPickAfter } from "./snake.ts";

export function likelyGoneByNextTurn(
  available: Player[],
  currentOverallPick: number,
): Set<string> {
  const next = nextUserPickAfter(currentOverallPick);
  if (next == null) return new Set();
  return adpWindowIds(
    available,
    remainingOpponentPicks(currentOverallPick, next),
  );
}

export function vonaForCandidate(
  candidate: Player,
  available: Player[],
  likelyGone: Set<string>,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  const survivors = available.filter(
    (player) =>
      player.pos === candidate.pos &&
      player.id !== candidate.id &&
      !likelyGone.has(player.id),
  );
  survivors.sort((a, b) => b.vorp - a.vorp);

  const alternativeVorp = survivors[0]?.vorp ?? 0;
  const raw = candidate.vorp - alternativeVorp;
  const scaled = raw * config.vona.scale;
  return Math.max(0, Math.min(config.vona.cap, scaled));
}
