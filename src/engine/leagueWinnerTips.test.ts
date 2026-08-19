import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player, Recommendation } from "../domain/types.ts";
import { initialDraftState } from "../state/draftReducer.ts";
import {
  formatLeagueWinnerTip,
  upcomingLeagueWinnerTips,
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
  it("formats the reach reminder from ADP, remaining picks and list rank", () => {
    const washington = named("Parker Washington");
    const tip = {
      player: washington,
      expectedPick: 94,
      picksBefore: 14,
      rank: 8,
    };
    expect(formatLeagueWinnerTip(tip)).toBe(
      "LW Parker Washington (WR) is expected at pick 94, you have 14 picks before then, he is currently your 8th-best option",
    );
  });

  it("uses best-option wording for rank 1 and singular pick when one pick remains", () => {
    expect(
      formatLeagueWinnerTip({
        player: named("Malik Nabers"),
        expectedPick: 40,
        picksBefore: 1,
        rank: 1,
      }),
    ).toBe(
      "LW Malik Nabers (WR) is expected at pick 40, you have 1 pick before then, he is currently your best option",
    );
  });

  it("surfaces league winners expected within the next 20 picks, soonest first", () => {
    const recs = [
      rec(named("Bijan Robinson")),
      rec(named("Josh Downs")),
      rec(named("Parker Washington")),
      rec(named("Jadarian Price")),
    ];
    const tips = upcomingLeagueWinnerTips(recs, stateAtPick(80));
    expect(tips.map((tip) => tip.player.player)).toEqual([
      "Jadarian Price",
      "Parker Washington",
    ]);
    expect(tips[0]).toMatchObject({ expectedPick: 80, picksBefore: 0, rank: 4 });
    expect(tips[1]).toMatchObject({ expectedPick: 94, picksBefore: 14, rank: 3 });
  });

  it("excludes drafted players and anyone outside the 20-pick window", () => {
    const recs = [
      rec(named("Parker Washington")),
      rec(named("Josh Downs")),
    ];
    const tips = upcomingLeagueWinnerTips(
      recs,
      stateAtPick(80, [named("Parker Washington")]),
    );
    expect(tips).toEqual([]);
  });
});
