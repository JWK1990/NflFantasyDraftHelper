import { describe, expect, it } from "vitest";
import { loadPlayers } from "./loadPlayers.ts";
import { eligiblePlayers, isEligible } from "../engine/eligibility.ts";
import { emptyRosterCounts, rosterCounts } from "../engine/roster.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";

describe("loadPlayers", () => {
  it("validates the core pool, 32 specials, and ESPN coverage", () => {
    const players = loadPlayers();
    const ids = new Set(players.map((player) => player.id));
    expect(ids.size).toBe(players.length);

    const core = players.filter((player) => !player.coverageOnly);
    const coverage = players.filter((player) => player.coverageOnly);
    expect(core.filter((player) => player.pos === "QB").length).toBe(34);
    expect(core.filter((player) => player.pos === "RB").length).toBe(57);
    expect(core.filter((player) => player.pos === "WR").length).toBe(77);
    expect(core.filter((player) => player.pos === "TE").length).toBe(28);
    expect(core.filter((player) => player.pos === "K").length).toBe(32);
    expect(core.filter((player) => player.pos === "DST").length).toBe(32);
    expect(coverage.length).toBeGreaterThan(700);

    const mayfield = players.find((player) => player.player === "Baker Mayfield");
    expect(mayfield?.coverageOnly).toBeFalsy();
    expect(mayfield?.modelPts).toBe(250.5);
    expect(mayfield?.vorp).toBe(12);

    expect(players.some((player) => player.player === "Josh Allen")).toBe(true);
    expect(players.some((player) => player.player === "Brandon Aubrey")).toBe(true);
    expect(players.some((player) => player.player === "Lions" && player.pos === "DST")).toBe(
      true,
    );
    expect(players.some((player) => player.player === "Will Reichard")).toBe(true);
  });

  it("keeps rankable kickers ahead of ESPN coverage duplicates", () => {
    const players = loadPlayers();
    const aubrey = players.filter((player) => player.player === "Brandon Aubrey");
    expect(aubrey).toHaveLength(1);
    expect(aubrey[0]?.coverageOnly).toBeFalsy();
    expect(aubrey[0]?.pos).toBe("K");
  });
});

describe("coverage-only players", () => {
  it("never enter recommendations or eligibility", () => {
    const players = loadPlayers();
    const zane = players.find((player) => player.player === "Zane Gonzalez");
    expect(zane?.coverageOnly).toBe(true);
    expect(isEligible(zane!, [], emptyRosterCounts(), 1)).toBe(false);
    const eligible = eligiblePlayers(players, [], emptyRosterCounts(), 1);
    expect(eligible.some((player) => player.coverageOnly)).toBe(false);
    expect(eligible.some((player) => player.player === "Zane Gonzalez")).toBe(false);
  });

  it("still counts on a roster when drafted", () => {
    const players = loadPlayers();
    const rivers = players.find((player) => player.player === "Philip Rivers");
    expect(rivers?.coverageOnly).toBe(true);
    expect(rivers?.pos).toBe("QB");
    const state = draftReducer(initialDraftState, {
      type: "DRAFT_PLAYER",
      playerId: rivers!.id,
      draftedBy: "mine",
    });
    const byId = new Map(players.map((player) => [player.id, player]));
    expect(rosterCounts(state.picks, byId).QB).toBe(1);
  });
});
