import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player } from "../domain/types.ts";

export function hasRiskTag(player: Player): boolean {
  const tag = player.tag.toUpperCase();
  return (
    tag.includes("RISK") ||
    tag.includes("RED WATCH") ||
    tag.includes("INJURY WATCH")
  );
}

export function isAcceptableQb(
  player: Player,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): boolean {
  if (player.pos !== "QB") return false;
  if (hasRiskTag(player)) return false;
  if (player.qbStarterSecurity === "fragile") return false;
  return player.posRank <= config.qb.acceptablePosRank;
}

export function secureQbPool(
  available: Player[],
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): Player[] {
  return available
    .filter((player) => isAcceptableQb(player, config))
    .sort((a, b) => a.modelRank - b.modelRank);
}

export function qbJobSecurityPenalty(
  player: Player,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  if (hasRiskTag(player) || player.qbStarterSecurity === "fragile") {
    return config.branch.fragilePenalty;
  }
  if (player.qbStarterSecurity === "probable") {
    return config.branch.probablePenalty;
  }
  return 0;
}

export function bestQb(
  available: Player[],
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): Player | null {
  const secure = secureQbPool(available, config);
  if (secure[0]) return secure[0];
  return (
    available
      .filter((player) => player.pos === "QB")
      .sort((a, b) => a.modelRank - b.modelRank)[0] ?? null
  );
}
