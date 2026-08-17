import type { Player } from "../domain/types.ts";

export interface StartingLineup {
  QB: Player | null;
  OP: Player | null;
  RB1: Player | null;
  RB2: Player | null;
  WR1: Player | null;
  WR2: Player | null;
  TE: Player | null;
  FLEX: Player | null;
}

function byPoints(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) => b.modelPts - a.modelPts || a.modelRank - b.modelRank,
  );
}

function take(players: Player[], used: Set<string>): Player | null {
  const next = players.find((player) => !used.has(player.id));
  if (!next) return null;
  used.add(next.id);
  return next;
}

export function assignStarters(
  roster: Player[],
  bestAvailableQbPts: number | null = null,
): StartingLineup {
  const qbs = byPoints(roster.filter((player) => player.pos === "QB"));
  const rbs = byPoints(roster.filter((player) => player.pos === "RB"));
  const wrs = byPoints(roster.filter((player) => player.pos === "WR"));
  const tes = byPoints(roster.filter((player) => player.pos === "TE"));
  const used = new Set<string>();
  void bestAvailableQbPts;

  const QB = take(qbs, used);
  const RB1 = take(rbs, used);
  const RB2 = take(rbs, used);
  const WR1 = take(wrs, used);
  const WR2 = take(wrs, used);
  const TE = take(tes, used);

  const leftoverSkill = byPoints(
    roster.filter(
      (player) =>
        (player.pos === "RB" || player.pos === "WR" || player.pos === "TE") &&
        !used.has(player.id),
    ),
  );
  const FLEX = take(leftoverSkill, used);

  const leftoverAfterFlex =
    leftoverSkill.find((player) => !used.has(player.id)) ?? null;
  const secondQb = qbs.find((player) => !used.has(player.id)) ?? null;
  let OP: Player | null = null;
  if (secondQb && leftoverAfterFlex) {
    OP =
      secondQb.modelPts >= leftoverAfterFlex.modelPts ? secondQb : leftoverAfterFlex;
  } else {
    OP = secondQb ?? leftoverAfterFlex;
  }
  if (OP) used.add(OP.id);

  return { QB, OP, RB1, RB2, WR1, WR2, TE, FLEX };
}

export function starterPoints(
  roster: Player[],
  bestAvailableQbPts: number | null = null,
): number {
  return Object.values(assignStarters(roster, bestAvailableQbPts)).reduce(
    (sum, player) => sum + (player?.modelPts ?? 0),
    0,
  );
}

export function lineupDelta(
  roster: Player[],
  candidate: Player,
  bestAvailableQbPts: number | null,
): number {
  if (candidate.pos === "K" || candidate.pos === "DST") return 0;
  const before = starterPoints(roster, bestAvailableQbPts);
  const afterPts =
    candidate.pos === "QB" ? null : bestAvailableQbPts;
  const after = starterPoints([...roster, candidate], afterPts);
  return Math.max(0, after - before);
}

export function makesStartingLineup(
  roster: Player[],
  candidate: Player,
  bestAvailableQbPts: number | null,
): boolean {
  if (candidate.pos === "K" || candidate.pos === "DST") return true;
  const lineup = assignStarters([...roster, candidate], bestAvailableQbPts);
  return Object.values(lineup).some((player) => player?.id === candidate.id);
}
