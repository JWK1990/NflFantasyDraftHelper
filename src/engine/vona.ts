import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player } from "../domain/types.ts";
import { adpWindowIds } from "./draftSim.ts";
import { interveningPicksUntilNextTurn } from "./snake.ts";

export function likelyGoneByNextTurn(
  available: Player[],
  currentOverallPick: number,
): Set<string> {
  const intervening = interveningPicksUntilNextTurn(currentOverallPick);
  return adpWindowIds(available, intervening);
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
