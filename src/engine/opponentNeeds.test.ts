import { describe, expect, it } from "vitest";
import { RECOMMENDATION_CONFIG } from "../config/recommendationConfig.ts";
import { opponentNeedMultiplier, type TeamPosCounts } from "./draftSim.ts";

const w = RECOMMENDATION_CONFIG.opponentNeeds;

function counts(partial: Partial<TeamPosCounts>): TeamPosCounts {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, ...partial };
}

describe("opponent positional-need weighting", () => {
  it("boosts a position when a mandatory starter is missing (test 25)", () => {
    expect(opponentNeedMultiplier("RB", counts({ RB: 0 }))).toBe(w.starterMissing);
    expect(opponentNeedMultiplier("WR", counts({ WR: 1 }))).toBe(w.starterMissing);
    expect(opponentNeedMultiplier("TE", counts({ TE: 0 }))).toBe(w.starterMissing);
    // A boost, not a certainty — it is a finite multiplier on ADP, not infinite.
    expect(w.starterMissing).toBeLessThan(2);
  });

  it("reduces but never eliminates RB demand once starters are filled (test 26)", () => {
    const twoRbs = opponentNeedMultiplier("RB", counts({ RB: 2, WR: 2, TE: 1 }));
    expect(twoRbs).toBeGreaterThan(0); // FLEX/bench still possible
    expect(twoRbs).toBeLessThan(w.starterMissing);
    // Stacking deep tapers further, but still positive.
    const deepRbs = opponentNeedMultiplier("RB", counts({ RB: w.deepThreshold, WR: 2 }));
    expect(deepRbs).toBe(w.deep);
    expect(deepRbs).toBeGreaterThan(0);
  });

  it("treats a second QB as a modest OP option, and K/DST as neutral", () => {
    expect(opponentNeedMultiplier("QB", counts({ QB: 0 }))).toBe(w.starterMissing);
    expect(opponentNeedMultiplier("QB", counts({ QB: 1 }))).toBe(w.opQbOpening);
    expect(opponentNeedMultiplier("K", counts({}))).toBe(1);
    expect(opponentNeedMultiplier("DST", counts({}))).toBe(1);
  });
});
