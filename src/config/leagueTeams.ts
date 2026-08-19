import { LEAGUE } from "./leagueSettings.ts";

/**
 * Display names for each draft slot (1..12). Slot 6 is the user.
 *
 * TODO(josh): replace the opponent placeholders with the real league team names
 * in draft-slot order. These must match the "fantasy team" names in the ESPN
 * paste so the import maps every pick to the correct slot.
 */
export const TEAM_NAMES_BY_SLOT: Record<number, string> = {
  1: "Team 1",
  2: "Team 2",
  3: "Team 3",
  4: "Team 4",
  5: "Team 5",
  [LEAGUE.userSlot]: LEAGUE.userTeamName,
  7: "Team 7",
  8: "Team 8",
  9: "Team 9",
  10: "Team 10",
  11: "Team 11",
  12: "Team 12",
};

export function teamNamesBySlot(): Map<number, string> {
  return new Map(Object.entries(TEAM_NAMES_BY_SLOT).map(([slot, name]) => [Number(slot), name]));
}
