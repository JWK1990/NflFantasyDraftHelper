import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player, Position, RosterCounts } from "../domain/types.ts";
import { roundForPick, userPickSchedule } from "./snake.ts";

export function rbStarterNeed(counts: RosterCounts): number {
  return Math.max(0, 2 - counts.RB);
}

export function unfilledFixedSlots(counts: RosterCounts): Record<"QB" | "RB" | "WR" | "TE", number> {
  return {
    QB: Math.max(0, 1 - counts.QB),
    RB: Math.max(0, 2 - counts.RB),
    WR: Math.max(0, 2 - counts.WR),
    TE: Math.max(0, 1 - counts.TE),
  };
}

export function totalUnfilledFixed(counts: RosterCounts): number {
  const slots = unfilledFixedSlots(counts);
  return slots.QB + slots.RB + slots.WR + slots.TE;
}

function timeFactor(
  round: number,
  remainingUserPicks: number,
  unfilled: number,
  config: RecommendationConfig,
): number {
  if (unfilled > 0 && remainingUserPicks <= unfilled) {
    return 2.3;
  }
  if (round <= config.coverage.earlyThroughRound) return 0.25;
  if (round <= config.coverage.midThroughRound) return 1;
  if (round >= config.coverage.lateFromRound) return 1.8;
  return 1.35;
}

export function coveragePressure(
  player: Player,
  counts: RosterCounts,
  currentOverallPick: number,
  cliffVorp: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  if (player.pos === "K" || player.pos === "DST") return 0;
  const missing = unfilledFixedSlots(counts)[player.pos as "QB" | "RB" | "WR" | "TE"];
  if (!missing) return 0;

  const round = roundForPick(currentOverallPick);
  const remainingUserPicks = userPickSchedule().length - counts.total;
  const unfilled = totalUnfilledFixed(counts);
  const time = timeFactor(round, remainingUserPicks, unfilled, config);
  const cliff =
    cliffVorp >= config.coverage.cliffVorp ? config.coverage.cliffBoost : 1;

  return missing * config.coverage.perSlot * time * cliff;
}

export function flexEligible(pos: Position): boolean {
  return pos === "RB" || pos === "WR" || pos === "TE";
}

export function opEligible(pos: Position): boolean {
  return pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE";
}
