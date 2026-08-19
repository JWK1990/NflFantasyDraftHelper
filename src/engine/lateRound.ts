import type { RosterCounts } from "../domain/types.ts";
import { userPickSchedule } from "./snake.ts";

export type LateReservation = "K" | "DST" | "QB";

/** How many of the user's scheduled picks remain at or after `overallPick`. */
function remainingUserPickCount(overallPick: number): number {
  return userPickSchedule().filter((pick) => pick >= overallPick).length;
}

/** Unfilled legally-mandatory positions: QB1, K and D/ST (never QB2). */
function unfilledMandatory(qbCount: number, hasK: boolean, hasDst: boolean): number {
  return Number(qbCount === 0) + Number(!hasK) + Number(!hasDst);
}

/**
 * General roster-feasibility reservation (§13.1). Force a mandatory position
 * (QB1, K or D/ST) only when delaying it would make a legal roster impossible —
 * i.e. when the user has no more picks to spare than unfilled mandatory slots.
 * QB2 is never mandatory. Priority when forced: QB1 (has value) > D/ST > K.
 *
 * This replaces the old fixed 139/150/163/174 table: feasibility is now the
 * source of truth, so mandatory fillers are taken as late as legally safe and
 * the unified ranking is free to prefer value until then.
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
  if (remainingUserPickCount(overallPick) > mandatory) return null; // room to wait
  if (needQb) return "QB";
  if (needDst) return "DST";
  if (needK) return "K";
  return null;
}

/**
 * Whether K/D/ST should become selectable in the live list — when the user is
 * within one pick of specials being feasibility-forced. Keeps them hidden while
 * there is still comfortable room to draft value first.
 */
export function specialTeamsWindowOpen(
  overallPick: number,
  counts: RosterCounts,
): boolean {
  const mandatory = unfilledMandatory(counts.QB, counts.K >= 1, counts.DST >= 1);
  if (mandatory === 0) return false;
  return remainingUserPickCount(overallPick) <= mandatory + 1;
}
