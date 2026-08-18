import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { assignStarters, lineupDelta, starterPoints } from "./lineup.ts";

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
    const lineup = assignStarters(roster);
    expect(lineup.OP?.player).toBe("De'Von Achane");
  });

  it("fills OP with owned skill when there is no second QB", () => {
    const roster = [
      named("Josh Allen"),
      named("Bijan Robinson"),
      named("Jahmyr Gibbs"),
      named("Puka Nacua"),
      named("Ja'Marr Chase"),
      named("Sam LaPorta"),
      named("Christian McCaffrey"),
      named("De'Von Achane"),
    ];
    const lineup = assignStarters(roster);
    expect(lineup.QB?.player).toBe("Josh Allen");
    expect(lineup.FLEX?.player).toBe("Christian McCaffrey");
    expect(lineup.OP?.player).toBe("De'Von Achane");
  });

  it("credits QB2 only the points above the skill player already in OP", () => {
    const base = [
      named("Josh Allen"),
      named("Bijan Robinson"),
      named("Jahmyr Gibbs"),
      named("Puka Nacua"),
      named("Ja'Marr Chase"),
      named("Sam LaPorta"),
      named("Christian McCaffrey"),
      named("De'Von Achane"),
    ];
    const withoutQb2 = starterPoints(base);
    const withQb2 = starterPoints([...base, named("Lamar Jackson")]);
    const skillOp = named("De'Von Achane").modelPts;
    const lamar = named("Lamar Jackson").modelPts;
    expect(lamar).toBeGreaterThan(skillOp);
    expect(withQb2 - withoutQb2).toBeCloseTo(lamar - skillOp, 0);
  });

  it("keeps a higher-projected skill player in OP over a weaker second QB", () => {
    const dart = players.find((player) => player.pos === "QB" && player.modelPts < 250);
    if (!dart) throw new Error("Expected a weaker QB");
    const roster = [
      named("Josh Allen"),
      named("Bijan Robinson"),
      named("Jahmyr Gibbs"),
      named("Puka Nacua"),
      named("Ja'Marr Chase"),
      named("Sam LaPorta"),
      named("Christian McCaffrey"),
      named("De'Von Achane"),
      dart,
    ];
    const lineup = assignStarters(roster);
    expect(lineup.OP?.player).toBe("De'Von Achane");
  });

  it("scores McCaffrey as a FLEX upgrade after two RBs", () => {
    const roster = [named("Bijan Robinson"), named("Jahmyr Gibbs")];
    const delta = lineupDelta(roster, named("Christian McCaffrey"));
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeCloseTo(named("Christian McCaffrey").modelPts);
  });
});
