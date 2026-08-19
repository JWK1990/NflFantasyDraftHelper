import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player, Position } from "../domain/types.ts";
import { completedTeamUtility } from "./teamUtility.ts";

function countPos(roster: Player[], pos: Position): number {
  return roster.filter((player) => player.pos === pos).length;
}

/**
 * Optimistic rest-of-draft completion: fill still-empty starter positions with
 * the best AVAILABLE player of that position (uncontested), then spend any
 * remaining picks on the best remaining skill/QB for FLEX/OP/bench. K/DST carry
 * no projected points, so they never affect utility and are skipped.
 *
 * `sortedAvailable` must already be sorted by modelPts descending.
 */
const isSkill = (player: Player): boolean =>
  player.pos === "RB" || player.pos === "WR" || player.pos === "TE";

function optimisticRoster(
  base: Player[],
  sortedAvailable: Player[],
  picks: number,
): Player[] {
  const roster = [...base];
  const used = new Set(base.map((player) => player.id));
  let budget = picks;

  // Grab the best available player matching `predicate`. sortedAvailable is by
  // modelPts descending, so `.find` returns the best remaining.
  const takeBest = (predicate: (player: Player) => boolean): boolean => {
    if (budget <= 0) return false;
    const next = sortedAvailable.find((player) => !used.has(player.id) && predicate(player));
    if (!next) return false;
    used.add(next.id);
    roster.push(next);
    budget -= 1;
    return true;
  };

  // Fill each starter slot with the best AVAILABLE player it can take. Filling by
  // slot (not by raw points) matters in Superflex, where high-scoring QBs would
  // otherwise starve the FLEX slot. K/D-ST carry no points, so ignore them.
  if (countPos(roster, "QB") < 1) takeBest((player) => player.pos === "QB");
  while (countPos(roster, "RB") < 2 && takeBest((player) => player.pos === "RB")) { /* fill */ }
  while (countPos(roster, "WR") < 2 && takeBest((player) => player.pos === "WR")) { /* fill */ }
  while (countPos(roster, "TE") < 1 && takeBest((player) => player.pos === "TE")) { /* fill */ }
  takeBest(isSkill); // FLEX (RB/WR/TE)
  takeBest((player) => player.pos === "QB" || isSkill(player)); // OP (QB or skill)

  // Remaining budget fills the bench with the best available skill/QB.
  while (takeBest((player) => player.pos === "QB" || isSkill(player))) { /* bench */ }

  return roster;
}

/**
 * A cheap UPPER BOUND on the full-simulation completed-team utility of taking
 * `candidate` now. Because the optimistic completion draws the best available
 * player for each slot (uncontested), it dominates any real contested rollout
 * player-for-player, so the resulting utility is >= the full-sim utility. This
 * soundness lets the promotion loop safely skip candidates whose upper bound
 * cannot reach the actionable group (§7.2).
 */
export function upperBoundUtility(
  roster: Player[],
  candidate: Player,
  sortedAvailable: Player[],
  remainingUserPicks: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  const picks = Math.max(0, remainingUserPicks - 1); // one used on the candidate
  const optimistic = optimisticRoster([...roster, candidate], sortedAvailable, picks);
  return completedTeamUtility(optimistic, 0, config).utility;
}
