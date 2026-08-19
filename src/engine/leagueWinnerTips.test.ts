import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player, Recommendation } from "../domain/types.ts";
import { initialDraftState } from "../state/draftReducer.ts";
import {
  formatLeagueWinnerTipShort,
  lastNameFromPlayer,
  upcomingLeagueWinnerTips,
  userPicksBeforeExpected,
} from "./leagueWinnerTips.ts";

const players = loadPlayers();

function named(name: string): Player {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match;
}

function rec(player: Player): Recommendation {
  return {
    player,
    dynamicScore: 0,
    breakdown: {} as Recommendation["breakdown"],
    reasons: [],
  };
}

function stateAtPick(overallPick: number, drafted: Player[] = []): DraftState {
  return {
    ...initialDraftState,
    picks: [
      ...drafted.map((player, index) => ({
        playerId: player.id,
        draftedBy: "other" as const,
        overallPick: index + 1,
        round: 1,
        timestamp: "",
      })),
      ...Array.from({ length: Math.max(0, overallPick - 1 - drafted.length) }, (_, index) => ({
        playerId: `filler-${index}`,
        draftedBy: "other" as const,
        overallPick: drafted.length + index + 1,
        round: 1,
        timestamp: "",
      })),
    ],
  };
}

describe("league winner tip bar", () => {
  it("formats upcoming players as ADP, rank and picks-before shorthand", () => {
    expect(lastNameFromPlayer("Josh Allen")).toBe("Allen");
    expect(lastNameFromPlayer("Marvin Harrison Jr.")).toBe("Harrison Jr.");
    expect(
      formatLeagueWinnerTipShort({
        player: named("Parker Washington"),
        expectedPick: 94,
        picksBefore: 1,
        rank: 8,
      }),
    ).toBe("Washington (ADP 94, Rank 8, Picks Before 1)");
    expect(
      formatLeagueWinnerTipShort({
        player: named("Josh Allen"),
        expectedPick: 3,
        picksBefore: 0,
        rank: 1,
      }),
    ).toBe("Allen (ADP 3, Rank 1, Picks Before 0)");
  });

  it("counts the user's remaining picks before ADP, not overall picks", () => {
    expect(userPicksBeforeExpected(80, 94)).toBe(1);
    expect(userPicksBeforeExpected(80, 80)).toBe(0);
    expect(userPicksBeforeExpected(80, 122)).toBe(3);
    expect(userPicksBeforeExpected(80, 138)).toBe(4);
  });

  it("surfaces league winners within the next 3 user picks, sorted by ADP", () => {
    const recs = [
      rec(named("Bijan Robinson")),
      rec(named("Josh Downs")),
      rec(named("Parker Washington")),
      rec(named("Jadarian Price")),
      rec(named("Matthew Golden")),
    ];
    const tips = upcomingLeagueWinnerTips(recs, stateAtPick(80));
    expect(tips.map((tip) => tip.player.player)).toEqual([
      "Jadarian Price",
      "Parker Washington",
      "Josh Downs",
    ]);
    expect(tips[0]).toMatchObject({ expectedPick: 80, picksBefore: 0, rank: 4 });
    expect(tips[1]).toMatchObject({ expectedPick: 94, picksBefore: 1, rank: 3 });
    expect(tips[2]).toMatchObject({ expectedPick: 122, picksBefore: 3, rank: 2 });
  });

  it("excludes drafted players and anyone more than 3 user picks out", () => {
    const recs = [
      rec(named("Parker Washington")),
      rec(named("Matthew Golden")),
    ];
    const tips = upcomingLeagueWinnerTips(
      recs,
      stateAtPick(80, [named("Parker Washington")]),
    );
    expect(tips).toEqual([]);
  });
});
