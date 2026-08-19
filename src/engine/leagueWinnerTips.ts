import type { DraftState, Player, Recommendation } from "../domain/types.ts";
import { draftedIds } from "./roster.ts";

export const LEAGUE_WINNER_TIP_WINDOW = 20;

export interface LeagueWinnerTip {
  player: Player;
  expectedPick: number;
  picksBefore: number;
  rank: number;
}

function formatOrdinal(value: number): string {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function expectedPickFor(player: Player): number | null {
  const adp = player.sfConsensusAdp ?? player.adp;
  if (adp == null) return null;
  return Math.round(adp);
}

export function formatLeagueWinnerTip(tip: LeagueWinnerTip): string {
  const pickWord = tip.picksBefore === 1 ? "pick" : "picks";
  const option =
    tip.rank === 1 ? "your best option" : `your ${formatOrdinal(tip.rank)}-best option`;
  return `LW ${tip.player.player} (${tip.player.pos}) is expected at pick ${tip.expectedPick}, you have ${tip.picksBefore} ${pickWord} before then, he is currently ${option}`;
}

export function upcomingLeagueWinnerTips(
  recs: Recommendation[],
  state: DraftState,
  windowSize: number = LEAGUE_WINNER_TIP_WINDOW,
): LeagueWinnerTip[] {
  const currentPick = state.picks.length + 1;
  const taken = draftedIds(state.picks);
  const tips: LeagueWinnerTip[] = [];
  recs.forEach((row, index) => {
    if (!row.player.leagueWinner || taken.has(row.player.id)) return;
    const expectedPick = expectedPickFor(row.player);
    if (expectedPick == null) return;
    const picksBefore = expectedPick - currentPick;
    if (picksBefore < 0 || picksBefore > windowSize) return;
    tips.push({
      player: row.player,
      expectedPick,
      picksBefore,
      rank: index + 1,
    });
  });
  tips.sort(
    (a, b) =>
      a.picksBefore - b.picksBefore ||
      a.rank - b.rank ||
      a.player.player.localeCompare(b.player.player),
  );
  return tips;
}
