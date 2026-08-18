import { LEAGUE } from "../config/leagueSettings.ts";
import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { Player, RosterCounts } from "../domain/types.ts";
import { draftedIds, offensiveGoalsMet } from "./roster.ts";
import { roundForPick } from "./snake.ts";
import { specialTeamsWindowOpen } from "./lateRound.ts";
import type { DraftPick } from "../domain/types.ts";

export function isEligible(
  player: Player,
  picks: DraftPick[],
  counts: RosterCounts,
  currentOverallPick: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): boolean {
  if (draftedIds(picks).has(player.id)) return false;
  if (counts.total >= LEAGUE.rosterSize) return false;
  if (counts[player.pos] >= LEAGUE.hardCaps[player.pos]) return false;

  if (player.pos === "K" && counts.K >= 1) return false;
  if (player.pos === "DST" && counts.DST >= 1) return false;

  const round = roundForPick(currentOverallPick);
  if (player.pos === "K" || player.pos === "DST") {
    if (
      round < config.specialTeams.suppressBeforeRound &&
      !offensiveGoalsMet(counts) &&
      !specialTeamsWindowOpen(currentOverallPick, counts)
    ) {
      return false;
    }
  }

  return true;
}

export function eligiblePlayers(
  players: Player[],
  picks: DraftPick[],
  counts: RosterCounts,
  currentOverallPick: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): Player[] {
  return players.filter((player) =>
    isEligible(player, picks, counts, currentOverallPick, config),
  );
}
