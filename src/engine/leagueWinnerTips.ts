import type { DraftState, Player, Recommendation } from "../domain/types.ts";
import { draftedIds } from "./roster.ts";
import { userPickSchedule } from "./snake.ts";

/** Show an LW tip when the user still has this many of their own picks before ADP. */
export const LEAGUE_WINNER_TIP_USER_PICKS = 3;

export interface LeagueWinnerTip {
  player: Player;
  expectedPick: number;
  picksBefore: number;
  rank: number;
}

export function lastNameFromPlayer(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] ?? name;
  const suffix = /^(Jr\.?|Sr\.?|II|III|IV|V)$/i;
  if (parts.length >= 2 && suffix.test(parts[parts.length - 1] ?? "")) {
    return parts.slice(-2).join(" ");
  }
  return parts[parts.length - 1] ?? name;
}

export function expectedPickFor(player: Player): number | null {
  const adp = player.sfConsensusAdp ?? player.adp;
  if (adp == null) return null;
  return Math.round(adp);
}

export function userPicksBeforeExpected(
  currentPick: number,
  expectedPick: number,
  schedule: number[] = userPickSchedule(),
): number {
  return schedule.filter((pick) => pick >= currentPick && pick < expectedPick).length;
}

export function formatLeagueWinnerTipShort(tip: LeagueWinnerTip): string {
  return `${lastNameFromPlayer(tip.player.player)} (ADP ${tip.expectedPick}, Rank ${tip.rank}, Picks Before ${tip.picksBefore})`;
}

export function upcomingLeagueWinnerTips(
  recs: Recommendation[],
  state: DraftState,
  userPickWindow: number = LEAGUE_WINNER_TIP_USER_PICKS,
): LeagueWinnerTip[] {
  const currentPick = state.picks.length + 1;
  const taken = draftedIds(state.picks);
  const schedule = userPickSchedule();
  const tips: LeagueWinnerTip[] = [];
  recs.forEach((row, index) => {
    if (!row.player.leagueWinner || taken.has(row.player.id)) return;
    const expectedPick = expectedPickFor(row.player);
    if (expectedPick == null || expectedPick < currentPick) return;
    const picksBefore = userPicksBeforeExpected(currentPick, expectedPick, schedule);
    if (picksBefore > userPickWindow) return;
    tips.push({
      player: row.player,
      expectedPick,
      picksBefore,
      rank: index + 1,
    });
  });
  tips.sort(
    (a, b) =>
      a.expectedPick - b.expectedPick ||
      a.rank - b.rank ||
      a.player.player.localeCompare(b.player.player),
  );
  return tips;
}
