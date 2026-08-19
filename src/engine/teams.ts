import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftPick, Player, Position } from "../domain/types.ts";
import { playersById } from "./roster.ts";
import { isUserPick, slotForPick, userPickSchedule } from "./snake.ts";

export type PosCounts = Record<Position, number>;

export interface TeamDraftState {
  /** Draft slot 1..teams — the stable team id (derived from the snake schedule). */
  slot: number;
  isUser: boolean;
  displayName: string;
  players: Player[];
  counts: PosCounts;
}

export function emptyPosCounts(): PosCounts {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
}

/**
 * Team that owns a given overall pick under the snake schedule. Because picks
 * are always logged in overall order (overallPick = picks.length + 1) and the
 * user sits at a fixed slot, the owning team is fully derivable — we never need
 * to persist it. This keeps Undo and ESPN import deterministically consistent.
 */
export function teamSlotForOverallPick(overallPick: number): number {
  return slotForPick(overallPick);
}

function defaultTeamName(slot: number, slotNames?: Map<number, string>): string {
  const provided = slotNames?.get(slot);
  if (provided) return provided;
  if (slot === LEAGUE.userSlot) return LEAGUE.userTeamName;
  return `Team ${slot}`;
}

/**
 * Rebuild all 12 team rosters from the pick log. Deterministic: two identical
 * pick logs always yield identical team states, so Undo/import "just work".
 *
 * `slotNames` optionally maps a draft slot to a display name (e.g. from an ESPN
 * import); missing slots fall back to the user team name / "Team N".
 */
export function buildTeamStates(
  picks: DraftPick[],
  players: Player[],
  slotNames?: Map<number, string>,
): TeamDraftState[] {
  const byId = playersById(players);
  const teams: TeamDraftState[] = Array.from({ length: LEAGUE.teams }, (_, index) => {
    const slot = index + 1;
    return {
      slot,
      isUser: slot === LEAGUE.userSlot,
      displayName: defaultTeamName(slot, slotNames),
      players: [],
      counts: emptyPosCounts(),
    };
  });

  for (const pick of picks) {
    const slot = teamSlotForOverallPick(pick.overallPick);
    const team = teams[slot - 1];
    if (!team) continue;
    const player = byId.get(pick.playerId);
    if (!player) continue;
    team.players.push(player);
    team.counts[player.pos] += 1;
  }

  return teams;
}

export function userTeamState(teams: TeamDraftState[]): TeamDraftState | undefined {
  return teams.find((team) => team.isUser);
}

export function opponentTeams(teams: TeamDraftState[]): TeamDraftState[] {
  return teams.filter((team) => !team.isUser);
}

/** Initials for a team's display name, e.g. "The Dan Marinehos" -> "TDM". */
export function teamInitials(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0]!.slice(0, 3).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * How many of a team's own scheduled picks fall in the window
 * [fromOverall, targetPick) — i.e. selections that team can still make before a
 * given future user pick. Used for hard QB-capacity bounds.
 */
export function teamPicksBefore(
  slot: number,
  fromOverall: number,
  targetPick: number,
): number {
  let count = 0;
  for (let overall = fromOverall; overall < targetPick; overall += 1) {
    if (teamSlotForOverallPick(overall) === slot) count += 1;
  }
  return count;
}

/** The user's own future picks (schedule entries at or after the current pick). */
export function remainingUserPicks(currentOverallPick: number): number[] {
  return userPickSchedule().filter((pick) => pick >= currentOverallPick);
}

export { isUserPick };
