import { describe, expect, it } from "vitest";
import { RECOMMENDATION_CONFIG } from "../config/recommendationConfig.ts";
import {
  classifyVerdict,
  clampSamePositionUtilities,
  inversionIsAuthoritative,
  marketWeight,
  pairedWinRate,
  percentile,
  SAME_POSITION_CLAMP_EPSILON,
} from "./robustness.ts";
import { mulberry32, scenarioStreamSalt, seedForScenario, weightedSample } from "./rng.ts";

describe("ADP robustness helpers", () => {
  it("labels an 11-point season edge as too close", () => {
    expect(classifyVerdict(11, 0.58)).toBe("too-close");
    expect(classifyVerdict(11, 0.8)).toBe("too-close");
  });

  it("labels a large stable gap as a clear edge", () => {
    expect(classifyVerdict(40, 0.8)).toBe("clear-edge");
  });

  it("does not treat a 53% single-boundary inversion as authoritative", () => {
    expect(
      inversionIsAuthoritative(2.8, 11.8, 9, 0.53, RECOMMENDATION_CONFIG),
    ).toBe(false);
  });

  it("allows a same-position inversion only with majority wins and a practical edge", () => {
    const threshold =
      RECOMMENDATION_CONFIG.robustness.closeCallPpw *
      RECOMMENDATION_CONFIG.branch.weeks;
    expect(
      inversionIsAuthoritative(
        threshold + 1,
        threshold + 10,
        9,
        0.8,
        RECOMMENDATION_CONFIG,
      ),
    ).toBe(true);
  });

  it("pairs scenario wins in lockstep, counting ties symmetrically", () => {
    // 10>9 win, 12==12 tie (0.5), 8<9 loss -> 1.5 / 3.
    expect(pairedWinRate([10, 12, 8], [9, 12, 9])).toBeCloseTo(0.5);
    // Symmetry: a-vs-b plus b-vs-a always sums to 1.
    const ab = pairedWinRate([10, 12, 8], [9, 12, 9])!;
    const ba = pairedWinRate([9, 12, 9], [10, 12, 8])!;
    expect(ab + ba).toBeCloseTo(1);
  });

  it("uses matched seeds so the same state and scenario draw the same stream", () => {
    const seed = seedForScenario("abcd1234", "median", 0);
    const first = mulberry32(seed)();
    const second = mulberry32(seed)();
    expect(second).toBe(first);
    expect(seedForScenario("abcd1234", "early-qb", 0)).not.toBe(seed);
  });

  it("keeps stream 0 identical to the unstreamed scenario seed", () => {
    const hash = "abcd1234";
    expect(seedForScenario(hash, "median", scenarioStreamSalt(0, 0))).toBe(
      seedForScenario(hash, "median", 0),
    );
    expect(scenarioStreamSalt(0, 1)).not.toBe(scenarioStreamSalt(0, 0));
    expect(seedForScenario(hash, "median", scenarioStreamSalt(0, 1))).not.toBe(
      seedForScenario(hash, "median", 0),
    );
  });

  it("samples from weights instead of always taking the first name", () => {
    const items = [
      { item: "first", weight: 0.01 },
      { item: "second", weight: 100 },
    ];
    const rng = mulberry32(1);
    const picks = new Set(
      Array.from({ length: 20 }, () => weightedSample(items, rng)),
    );
    expect(picks.has("second")).toBe(true);
  });

  it("computes P25 and P75 from a short scenario set", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });

  it("weights overdue players higher than on-time or reach picks", () => {
    const temperature = RECOMMENDATION_CONFIG.robustness.temperatureEarly;
    const onTime = marketWeight(54, 54, temperature);
    const overdue = marketWeight(33.5, 54, temperature);
    const reach = marketWeight(70, 54, temperature);
    expect(onTime).toBeCloseTo(1);
    expect(overdue).toBeGreaterThan(onTime);
    expect(reach).toBeLessThan(onTime);
    expect(marketWeight(1, 54, temperature)).toBe(
      RECOMMENDATION_CONFIG.robustness.overdueWeightCap,
    );
    expect(marketWeight(44, 54, temperature)).toBeGreaterThan(
      marketWeight(64, 54, temperature),
    );
  });

  it("clamps an unapproved same-position inversion below the higher-projection peer", () => {
    const warren = {
      player: { pos: "TE", modelPts: 208 },
      dynamicScore: 2115,
      breakdown: { rawUtility: 2115 },
    };
    const loveland = {
      player: { pos: "TE", modelPts: 206 },
      dynamicScore: 2118,
      breakdown: { rawUtility: 2118 },
    };
    const stroud = {
      player: { pos: "QB", modelPts: 280 },
      dynamicScore: 2123,
      breakdown: { rawUtility: 2123 },
    };
    clampSamePositionUtilities([warren, loveland, stroud]);
    expect(warren.dynamicScore).toBe(2115);
    expect(loveland.dynamicScore).toBeCloseTo(2115 - SAME_POSITION_CLAMP_EPSILON);
    expect(stroud.dynamicScore).toBe(2123);
  });

  it("does not clamp an inversion that is authoritative across matched scenarios", () => {
    const peer = {
      player: { pos: "WR", modelPts: 253.5 },
      dynamicScore: 2100,
      breakdown: { rawUtility: 2100, scenarioUtilities: [2100, 2100, 2100, 2100, 2100] },
    };
    const ahead = {
      player: { pos: "WR", modelPts: 244.5 },
      dynamicScore: 2130,
      breakdown: { rawUtility: 2130, scenarioUtilities: [2130, 2130, 2130, 2130, 2130] },
    };
    clampSamePositionUtilities([peer, ahead]);
    expect(ahead.dynamicScore).toBe(2130);
  });
});
