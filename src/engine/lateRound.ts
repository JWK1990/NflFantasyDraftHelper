import type { RosterCounts } from "../domain/types.ts";
import { userPickSchedule } from "./snake.ts";

export type LateReservation = "K" | "DST" | "QB";

/** How many of the user's scheduled picks remain at or after `overallPick`. */
function remainingUserPickCount(overallPick: number): number {
  return userPickSchedule().filter((pick) => pick >= overallPick).length;
}


/**
 * Late-round reservation. QB1 stays a feasibility reservation (it has real
 * value, so it is only forced when delaying it would make a legal roster
 * impossible). K and D/ST are now deterministic, decoupled from feasibility:
 *
 *   - D/ST is taken on the user's **final** pick (2 remaining → never; 1 → yes).
 *   - K is taken on the user's **second-to-last** pick.
 *
 * They are never recommended earlier, which also keeps every pick up to ~150
 * free for a QB2 or upside value pick. Priority when several coincide: QB1
 * (feasibility) > K (2nd-last slot) > D/ST (last slot).
 */
export function lateRoundReservation(
  overallPick: number,
  qbCount: number,
  hasK: boolean,
  hasDst: boolean,
): LateReservation | null {
  const needQb = qbCount === 0;
  const needDst = !hasDst;
  const needK = !hasK;
  const mandatory = Number(needQb) + Number(needDst) + Number(needK);
  if (mandatory === 0) return null;

  const remaining = remainingUserPickCount(overallPick);
  // QB1 must still physically fit; force it only with no room left to spare.
  if (needQb && remaining <= mandatory) return "QB";
  // Deterministic special-teams slots.
  if (remaining <= 2 && needK) return "K"; // second-to-last (or last) pick
  if (remaining <= 1 && needDst) return "DST"; // final pick
  return null;
}

/**
 * Whether a specific special-teams position should be selectable/recommended in
 * the live list. Deterministic: K opens on the user's second-to-last pick, D/ST
 * only on the final pick. Hidden from the board before then (opponents' early
 * K/D/ST picks are still recorded via import/search).
 */
export function specialTeamsSlotOpen(
  overallPick: number,
  pos: "K" | "DST",
  counts: RosterCounts,
): boolean {
  const remaining = remainingUserPickCount(overallPick);
  if (pos === "DST") return counts.DST < 1 && remaining <= 1;
  return counts.K < 1 && remaining <= 2;
}
