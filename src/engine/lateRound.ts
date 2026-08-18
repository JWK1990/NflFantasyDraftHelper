import type { RosterCounts } from "../domain/types.ts";

export type LateReservation = "K" | "DST" | "QB";

export function lateRoundReservation(
  overallPick: number,
  qbCount: number,
  hasK: boolean,
  hasDst: boolean,
): LateReservation | null {
  if (overallPick === 139) {
    if (qbCount !== 0) return null;
    if (!hasK) return "K";
    if (!hasDst) return "DST";
    return null;
  }
  if (overallPick === 150) {
    if (qbCount === 0) {
      if (!hasDst) return "DST";
      if (!hasK) return "K";
      return null;
    }
    if (qbCount === 1) {
      if (!hasK) return "K";
      if (!hasDst) return "DST";
      return null;
    }
    return null;
  }
  if (overallPick === 163) {
    if (qbCount === 0) return "QB";
    if (qbCount === 1) {
      if (!hasDst) return "DST";
      if (!hasK) return "K";
      return null;
    }
    if (!hasK) return "K";
    if (!hasDst) return "DST";
    return null;
  }
  if (overallPick === 174) {
    if (qbCount < 2) return "QB";
    if (!hasDst) return "DST";
    if (!hasK) return "K";
    return null;
  }
  return null;
}

export function specialTeamsWindowOpen(
  overallPick: number,
  counts: RosterCounts,
): boolean {
  if (counts.QB === 0 && (overallPick === 139 || overallPick === 150)) return true;
  if (counts.QB === 1 && (overallPick === 150 || overallPick === 163)) return true;
  if (counts.QB >= 2 && (overallPick === 163 || overallPick === 174)) return true;
  return false;
}

