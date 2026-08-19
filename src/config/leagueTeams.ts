import { LEAGUE } from "./leagueSettings.ts";

/**
 * League team names in draft-slot order (1..12). Slot 6 is the user.
 *
 * These must match the "fantasy team" names in the ESPN paste so the import
 * maps every pick to the correct slot.
 */
export const TEAM_NAMES_BY_SLOT: Record<number, string> = {
  1: "Fentasy Football",
  2: "Mile High Club",
  3: "The Situation",
  4: "Lamb On The Skip",
  5: "Silence of the Lamb",
  [LEAGUE.userSlot]: LEAGUE.userTeamName, // 6: The Dan Marinehos (Josh K)
  7: "KC and the Burrow Band",
  8: "!!! Fire Sale",
  9: "Its gonna be Maye!",
  10: "Mahomes Magic",
  11: "Darwin Dishlickers",
  12: "Hurts So Good",
};

export function teamNamesBySlot(): Map<number, string> {
  return new Map(Object.entries(TEAM_NAMES_BY_SLOT).map(([slot, name]) => [Number(slot), name]));
}
