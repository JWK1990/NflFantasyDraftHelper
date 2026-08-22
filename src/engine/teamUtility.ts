import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player } from "../domain/types.ts";
import { assignStarters, starterPoints } from "./lineup.ts";

/** Championship-upside bonus for a bench player (bench phase only). */
function benchUpsideBonus(player: Player, config: RecommendationConfig): number {
  const u = config.bench.upside;
  let bonus = 0;
  if (player.leagueWinner) {
    bonus +=
      player.leagueWinner.confidence === "high"
        ? u.leagueWinnerHigh
        : player.leagueWinner.confidence === "medium"
          ? u.leagueWinnerMedium
          : 0;
  }
  if (player.value) bonus += u.value;
  return bonus;
}

/**
 * Bench value once the starting lineup is complete. Instead of crediting every
 * bench body ~12% of its projection (which stacks redundant TEs), it applies
 * positional-redundancy diminishing returns to the projection base and adds a
 * separate, controlled upside bonus for league-winner / value darts.
 */
function benchPhaseValue(
  bench: Player[],
  config: RecommendationConfig,
): { benchValue: number; upsideAdjustment: number } {
  const byPos = new Map<string, Player[]>();
  for (const player of bench) {
    const group = byPos.get(player.pos) ?? [];
    group.push(player);
    byPos.set(player.pos, group);
  }
  let base = 0;
  let upside = 0;
  for (const group of byPos.values()) {
    const sorted = [...group].sort((a, b) => b.modelPts - a.modelPts);
    const table =
      config.bench.redundancy[sorted[0]!.pos as "QB" | "RB" | "WR" | "TE"] ?? [];
    sorted.forEach((player, index) => {
      const factor = table[index] ?? config.bench.redundancyFloor;
      base += player.modelPts * config.benchScale * factor;
      upside += benchUpsideBonus(player, config);
    });
  }
  return {
    benchValue: Math.min(config.benchCap, base),
    upsideAdjustment: Math.min(config.bench.upsideCap, upside),
  };
}

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

  // "Bench phase" = every offensive starting slot is filled, so any extra body
  // is a genuine bench piece. Only then do we switch to upside-oriented bench
  // construction (redundancy discounts + league-winner/value bonuses). While
  // starters are still forming, keep the flat projection credit so early picks
  // stay undistorted and league-winner/value remain display-only.
  const benchPhase = emptySlots === 0;
  let benchValue: number;
  let upsideAdjustment: number;
  if (benchPhase) {
    ({ benchValue, upsideAdjustment } = benchPhaseValue(bench, config));
  } else {
    const rawBench = bench.reduce((sum, player) => sum + player.modelPts, 0);
    benchValue = Math.min(config.benchCap, rawBench * config.benchScale);
    upsideAdjustment = 0;
  }

  const slotPenalty = emptySlotPenalty(emptySlots, remainingUserPicks, config);
  const utility = starterProjection + benchValue + upsideAdjustment - slotPenalty;

  return {
    starterProjection,
    benchValue,
    upsideAdjustment,
    riskAdjustment: 0,
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
