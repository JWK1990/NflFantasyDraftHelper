import { assignStarters } from "./lineup.ts";
import type {
  DraftPick,
  Player,
  Position,
  RosterCounts,
  RosterCoverage,
} from "../domain/types.ts";

export function emptyRosterCounts(): RosterCounts {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, total: 0 };
}

export function playersById(players: Player[]): Map<string, Player> {
  return new Map(players.map((player) => [player.id, player]));
}

export function rosterCounts(
  picks: DraftPick[],
  byId: Map<string, Player>,
): RosterCounts {
  const counts = emptyRosterCounts();
  for (const pick of picks) {
    if (pick.draftedBy !== "mine") continue;
    const player = byId.get(pick.playerId);
    if (!player) continue;
    counts[player.pos] += 1;
    counts.total += 1;
  }
  return counts;
}

export function myRosterPlayers(
  picks: DraftPick[],
  byId: Map<string, Player>,
): Player[] {
  const mine: Player[] = [];
  for (const pick of picks) {
    if (pick.draftedBy !== "mine") continue;
    const player = byId.get(pick.playerId);
    if (player) mine.push(player);
  }
  return mine;
}

export function draftedIds(picks: DraftPick[]): Set<string> {
  return new Set(picks.map((pick) => pick.playerId));
}

export function skillCount(counts: RosterCounts): number {
  return counts.RB + counts.WR + counts.TE;
}

export function rosterCoverage(counts: RosterCounts): RosterCoverage {
  const qb = Math.min(counts.QB, 1);
  const rb = Math.min(counts.RB, 2);
  const wr = Math.min(counts.WR, 2);
  const te = Math.min(counts.TE, 1);
  const k = Math.min(counts.K, 1);
  const dst = Math.min(counts.DST, 1);

  let remainingQb = counts.QB - qb;
  let remainingRb = counts.RB - rb;
  let remainingWr = counts.WR - wr;
  let remainingTe = counts.TE - te;

  const flexSkill = remainingRb + remainingWr + remainingTe;
  const flex = flexSkill > 0 ? 1 : 0;
  if (flex === 1) {
    if (remainingRb > 0) remainingRb -= 1;
    else if (remainingWr > 0) remainingWr -= 1;
    else remainingTe -= 1;
  }

  const op =
    remainingQb > 0 || remainingRb + remainingWr + remainingTe > 0 ? 1 : 0;
  if (op === 1 && remainingQb > 0) remainingQb -= 1;

  const assigned =
    qb + rb + wr + te + flex + op + k + dst;
  const bench = Math.max(0, counts.total - assigned);

  return { qb, rb, wr, te, flex, op, k, dst, bench };
}

export function rosterCoverageFromPlayers(roster: Player[]): RosterCoverage {
  const lineup = assignStarters(roster);
  const k = roster.some((player) => player.pos === "K") ? 1 : 0;
  const dst = roster.some((player) => player.pos === "DST") ? 1 : 0;
  const assigned =
    Number(Boolean(lineup.QB)) +
    Number(Boolean(lineup.RB1)) +
    Number(Boolean(lineup.RB2)) +
    Number(Boolean(lineup.WR1)) +
    Number(Boolean(lineup.WR2)) +
    Number(Boolean(lineup.TE)) +
    Number(Boolean(lineup.FLEX)) +
    Number(Boolean(lineup.OP)) +
    k +
    dst;
  return {
    qb: lineup.QB ? 1 : 0,
    rb: Number(Boolean(lineup.RB1)) + Number(Boolean(lineup.RB2)),
    wr: Number(Boolean(lineup.WR1)) + Number(Boolean(lineup.WR2)),
    te: lineup.TE ? 1 : 0,
    flex: lineup.FLEX ? 1 : 0,
    op: lineup.OP ? 1 : 0,
    k,
    dst,
    bench: Math.max(0, roster.length - assigned),
  };
}

export function offensiveGoalsMet(counts: RosterCounts): boolean {
  const coverage = rosterCoverage(counts);
  return (
    coverage.qb === 1 &&
    coverage.rb === 2 &&
    coverage.wr === 2 &&
    coverage.te === 1 &&
    coverage.flex === 1 &&
    coverage.op === 1
  );
}

export function countByPosition(
  players: Player[],
  pos: Position,
): number {
  return players.filter((player) => player.pos === pos).length;
}
