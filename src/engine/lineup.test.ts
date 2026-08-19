import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { Player, Position } from "../domain/types.ts";
import { assignStarters, lineupDelta, starterPoints } from "./lineup.ts";

const players = loadPlayers();

// Independent brute-force optimum over the exact lineup structure, used to
// verify the greedy assignment always produces the maximum legal lineup (§34).
const SLOTS: Position[][] = [
  ["QB"],
  ["RB"],
  ["RB"],
  ["WR"],
  ["WR"],
  ["TE"],
  ["RB", "WR", "TE"],
  ["QB", "RB", "WR", "TE"],
];

function bruteForceOptimalStarterPoints(roster: Player[]): number {
  const used = new Array(roster.length).fill(false);
  let best = 0;
  const search = (slot: number, sum: number): void => {
    if (slot === SLOTS.length) {
      best = Math.max(best, sum);
      return;
    }
    search(slot + 1, sum); // leaving a slot empty is always allowed
    for (let i = 0; i < roster.length; i += 1) {
      const player = roster[i]!;
      if (used[i] || !SLOTS[slot]!.includes(player.pos)) continue;
      used[i] = true;
      search(slot + 1, sum + player.modelPts);
      used[i] = false;
    }
  };
  search(0, 0);
  return best;
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  it("always produces the maximum legal lineup (matches brute force) — §34", () => {
    const byPos = (pos: Position) => players.filter((player) => player.pos === pos);
    const pools: Record<Position, Player[]> = {
      QB: byPos("QB"),
      RB: byPos("RB"),
      WR: byPos("WR"),
      TE: byPos("TE"),
      K: [],
      DST: [],
    };
    const rng = mulberry(12345);
    const pick = (pos: Position, n: number): Player[] => {
      const pool = [...pools[pos]].sort(() => rng() - 0.5);
      return pool.slice(0, Math.floor(rng() * (n + 1)));
    };
    for (let trial = 0; trial < 200; trial += 1) {
      // Realistic caps keep the brute-force search small but varied.
      const roster = [
        ...pick("QB", 2),
        ...pick("RB", 3),
        ...pick("WR", 3),
        ...pick("TE", 2),
      ];
      expect(starterPoints(roster)).toBeCloseTo(
        bruteForceOptimalStarterPoints(roster),
        6,
      );
    }
  });
});
