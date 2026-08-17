import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { assignStarters, lineupDelta } from "./lineup.ts";

const players = loadPlayers();

function named(name: string) {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match;
}

describe("starting lineup", () => {
  it("puts a third RB in FLEX rather than OP", () => {
    const roster = [named("Bijan Robinson"), named("Jahmyr Gibbs"), named("Christian McCaffrey")];
    const lineup = assignStarters(roster);
    expect(lineup.RB1?.player).toBe("Bijan Robinson");
    expect(lineup.RB2?.player).toBe("Jahmyr Gibbs");
    expect(lineup.FLEX?.player).toBe("Christian McCaffrey");
    expect(lineup.OP).toBeNull();
  });

  it("lets a fourth owned skill player fill OP even if an unowned QB scores more", () => {
    const roster = [
      named("Bijan Robinson"),
      named("Jahmyr Gibbs"),
      named("Christian McCaffrey"),
      named("De'Von Achane"),
    ];
    const lineup = assignStarters(roster, named("Josh Allen").modelPts);
    expect(lineup.OP?.player).toBe("De'Von Achane");
  });

  it("scores McCaffrey as a FLEX upgrade after two RBs", () => {
    const roster = [named("Bijan Robinson"), named("Jahmyr Gibbs")];
    const delta = lineupDelta(roster, named("Christian McCaffrey"), named("Josh Allen").modelPts);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeCloseTo(named("Christian McCaffrey").modelPts);
  });
});
