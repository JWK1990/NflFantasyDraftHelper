import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player } from "../domain/types.ts";
import { interveningPicksUntilNextTurn } from "./snake.ts";

function adpSortValue(player: Player): number {
  if (player.adp == null) return 900 + player.modelRank;
  return player.adp;
}

export function likelyGoneByNextTurn(
  available: Player[],
  currentOverallPick: number,
): Set<string> {
  const intervening = interveningPicksUntilNextTurn(currentOverallPick);
  if (intervening <= 0) return new Set();

  const ordered = [...available].sort((a, b) => {
    const adpDelta = adpSortValue(a) - adpSortValue(b);
    if (adpDelta !== 0) return adpDelta;
    return a.modelRank - b.modelRank;
  });

  return new Set(ordered.slice(0, intervening).map((player) => player.id));
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
