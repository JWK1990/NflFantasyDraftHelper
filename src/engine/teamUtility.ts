import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player } from "../domain/types.ts";
import { assignStarters, starterPoints } from "./lineup.ts";
import { hasRiskTag, qbJobSecurityPenalty } from "./qb.ts";

export interface TeamUtility {
  starterProjection: number;
  benchValue: number;
  upsideAdjustment: number;
  riskAdjustment: number;
  slotPenalty: number;
  utility: number;
}

function emptySlotPenalty(
  emptySlots: number,
  remainingUserPicks: number,
  config: RecommendationConfig,
): number {
  if (emptySlots === 0) return 0;
  const weight =
    remainingUserPicks <= emptySlots
      ? config.emptySlotCritical
      : remainingUserPicks <= config.lateRemainingPicks
        ? config.emptySlotLate
        : config.emptySlotEarly;
  return emptySlots * weight;
}

export function completedTeamUtility(
  roster: Player[],
  remainingUserPicks: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): TeamUtility {
  const lineup = assignStarters(roster);
  const starters = Object.values(lineup);
  const starterIds = new Set(
    starters.filter((player): player is Player => player != null).map((player) => player.id),
  );
  const starterProjection = starterPoints(roster);
  const emptySlots = starters.filter((player) => player == null).length;

  const bench = roster.filter(
    (player) =>
      !starterIds.has(player.id) && player.pos !== "K" && player.pos !== "DST",
  );
  const rawBench = bench.reduce((sum, player) => sum + player.modelPts, 0);
  const benchValue = Math.min(config.benchCap, rawBench * config.benchScale);

  const upsideAdjustment = roster.filter((player) =>
    player.tag.toUpperCase().includes("UPSIDE"),
  ).length * config.upsideTagBonus;

  const starterRisk = starters.reduce((sum, player) => {
    if (!player) return sum;
    let penalty = qbJobSecurityPenalty(player, config);
    if (hasRiskTag(player) && player.pos !== "QB") penalty += 12;
    return sum + penalty;
  }, 0);
  const benchRisk = bench.reduce((sum, player) => {
    if (hasRiskTag(player) || player.qbStarterSecurity === "fragile") return sum + 4;
    return sum;
  }, 0);

  const riskAdjustment = starterRisk + benchRisk;
  const slotPenalty = emptySlotPenalty(emptySlots, remainingUserPicks, config);
  const utility =
    starterProjection + benchValue + upsideAdjustment - riskAdjustment - slotPenalty;

  return {
    starterProjection,
    benchValue,
    upsideAdjustment,
    riskAdjustment,
    slotPenalty,
    utility,
  };
}

export function playerRosterContribution(
  roster: Player[],
  player: Player,
  remainingUserPicks: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): TeamUtility {
  return completedTeamUtility([...roster, player], Math.max(0, remainingUserPicks - 1), config);
}
