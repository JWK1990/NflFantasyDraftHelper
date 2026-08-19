import { describe, expect, it } from "vitest";
import draftModel from "./draft_model_data.json";
import specialTeams from "./specialTeams.json";
import { loadPlayers, REPLACEMENT } from "./loadPlayers.ts";
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
    expect(mayfield?.modelPts).toBe(281.9);
    expect(mayfield?.vorp).toBe(33);

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
    expect(aubrey[0]?.age).toBeGreaterThan(0);
    expect(aubrey[0]?.espnId).toBeDefined();
  });
});

describe("refreshed model contract", () => {
  const data = draftModel as {
    players: Array<Record<string, unknown>>;
    coverage: Array<Record<string, unknown>>;
  };
  const dstCount = (specialTeams as { defenses: unknown[] }).defenses.length;

  it("keeps the two-pool ESPN universe", () => {
    expect(data.players).toHaveLength(196);
    expect(data.coverage).toHaveLength(799);
    expect(data.players.length + data.coverage.length + dstCount).toBe(1027);
  });

  it("gives every individual player age, birth date, and a unique ESPN id", () => {
    const people = [...data.players, ...data.coverage];
    const espnIds = new Set<number>();
    for (const row of people) {
      expect(typeof row.birthDate).toBe("string");
      expect(typeof row.age).toBe("number");
      expect(row.ageAsOf).toBe("2026-08-22");
      expect(typeof row.espnId).toBe("number");
      espnIds.add(row.espnId as number);
    }
    expect(espnIds.size).toBe(995);
  });

  it("rebuilds VORP, Superflex priors, and outlooks for every ranked player", () => {
    const ranks = new Set<number>();
    for (const row of data.players) {
      const pos = row.pos as "QB" | "RB" | "WR" | "TE";
      expect(row.sfConsensusAdp).not.toBeNull();
      expect(row.adp).toBe(row.sfConsensusAdp);
      expect(row.fantasyProsSfRank).not.toBeNull();
      expect(row.draftSharksSfRank).not.toBeNull();
      expect(row.outlook).toEqual(expect.objectContaining({ source: "DraftSharks" }));
      expect(row.vorp).toBeCloseTo((row.modelPts as number) - REPLACEMENT[pos], 1);
      ranks.add(row.modelRank as number);
    }
    expect(ranks.size).toBe(196);
    expect(Math.min(...ranks)).toBe(1);
    expect(Math.max(...ranks)).toBe(196);
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
