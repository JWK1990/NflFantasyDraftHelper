import { LEAGUE } from "../config/leagueSettings.ts";
import type { Player } from "../domain/types.ts";
import { opponentTeams, teamPicksBefore, type TeamDraftState } from "./teams.ts";

const MAX_QB_PER_TEAM = LEAGUE.hardCaps.QB; // 2

/** Open QB slots on a team: max(0, 2 - qbCount). */
export function remainingQbCapacity(team: TeamDraftState): number {
  return Math.max(0, MAX_QB_PER_TEAM - team.counts.QB);
}

/**
 * Most QBs a single team can still take before `targetPick`, bounded by BOTH
 * its open QB slots and the number of picks it actually owns before then.
 */
export function maxAdditionalQbsBefore(
  team: TeamDraftState,
  fromOverall: number,
  targetPick: number,
): number {
  return Math.min(
    remainingQbCapacity(team),
    teamPicksBefore(team.slot, fromOverall, targetPick),
  );
}

/**
 * Hard upper bound on how many QBs *opponents* can remove before `targetPick`.
 * This is a mathematical ceiling, never a probabilistic estimate.
 */
export function opponentQbCapacityBefore(
  teams: TeamDraftState[],
  fromOverall: number,
  targetPick: number,
): number {
  return opponentTeams(teams).reduce(
    (sum, team) => sum + maxAdditionalQbsBefore(team, fromOverall, targetPick),
    0,
  );
}

export function sortQbsByValue(qbs: Player[]): Player[] {
  return [...qbs]
    .filter((player) => player.pos === "QB")
    .sort((a, b) => b.modelPts - a.modelPts || a.modelRank - b.modelRank);
}

export interface QbFloor {
  /** Opponent QB capacity before the target pick (C). */
  capacity: number;
  /** Remaining QBs sorted best -> worst by expected value. */
  remainingQbs: Player[];
  /**
   * The worst-case QB guaranteed to survive to the target pick: the QB ranked
   * C+1 among those remaining. Null only if opponents could take them all.
   */
  guaranteedFloor: Player | null;
  /** How many QBs are mathematically guaranteed to remain: max(0, N - C). */
  guaranteedCount: number;
}

/**
 * Guaranteed QB floor (§3.2). With capacity C, the QB ranked C+1 among the
 * remaining QBs is guaranteed available at the target pick. If C === 0 the best
 * remaining QB is guaranteed — its timing urgency is exactly zero.
 */
export function guaranteedQbFloor(
  remainingQbs: Player[],
  capacity: number,
): QbFloor {
  const sorted = sortQbsByValue(remainingQbs);
  const floor = sorted[capacity] ?? null;
  return {
    capacity,
    remainingQbs: sorted,
    guaranteedFloor: floor,
    guaranteedCount: Math.max(0, sorted.length - capacity),
  };
}

export interface QbCapacityReport extends QbFloor {
  targetPick: number;
  /** Expected (not guaranteed) survivor — best remaining is index 0. */
  expectedFloor: Player | null;
}

/**
 * Convenience: full capacity + floor picture for a specific future user pick,
 * given the current board. `fromOverall` defaults to the current pick.
 */
export function qbCapacityReport(
  teams: TeamDraftState[],
  availableQbs: Player[],
  targetPick: number,
  fromOverall: number,
): QbCapacityReport {
  const capacity = opponentQbCapacityBefore(teams, fromOverall, targetPick);
  const floor = guaranteedQbFloor(availableQbs, capacity);
  return {
    ...floor,
    targetPick,
    expectedFloor: floor.remainingQbs[0] ?? null,
  };
}
