export const RECOMMENDATION_CONFIG = {
  branch: {
    weeks: 17,
    opponentQbCap: 2,
  },
  // Modest multipliers on opponent ADP sampling that nudge toward roster needs
  // without overpowering ADP uncertainty (§4.2). Never zero for RB/WR/TE — a
  // filled starter slot reduces but does not eliminate demand (FLEX/bench).
  opponentNeeds: {
    starterMissing: 1.5, // missing a mandatory starter at this position
    flexOpening: 1.1, // starters filled but FLEX/OP/bench still building
    opQbOpening: 1.1, // a second QB as an OP option
    filled: 0.9, // starters filled, roster fairly deep
    deep: 0.6, // already stacked deep at this position
    deepThreshold: 4, // count at which "deep" kicks in for RB/WR
  },
  benchScale: 0.12,
  benchCap: 48,
  // Bench-phase shaping (§bench). Applied ONLY once all offensive starters are
  // filled, so starter-phase picks stay display-only for league-winner/value.
  bench: {
    // Diminishing multiplier on a bench player's modelPts base, indexed by their
    // rank among same-position bench players (0 = best). Models positional
    // redundancy; TE collapses fast so a 3rd TE is worth almost nothing.
    redundancy: {
      QB: [1, 0.3, 0.1],
      RB: [1, 0.9, 0.75, 0.55],
      WR: [1, 0.9, 0.75, 0.55],
      TE: [0.5, 0.1],
    } as Record<"QB" | "RB" | "WR" | "TE", number[]>,
    redundancyFloor: 0.1,
    // Additive season-point bonuses that tilt the bench toward championship
    // upside once starters are set. Not capped by benchCap (kept separate).
    upside: {
      leagueWinnerHigh: 14,
      leagueWinnerMedium: 9,
      value: 6,
    },
    upsideCap: 45,
  },
  emptySlotEarly: 35,
  emptySlotLate: 70,
  emptySlotCritical: 140,
  lateRemainingPicks: 4,
  lookaheadTopN: 24,
  // Adaptive full-simulation promotion (§7.2). Full-sim candidates in
  // upper-bound order until none left could reach the actionable top group.
  promotion: {
    actionableTopN: 15, // row 1 + actionable rows must all be full simulations
    maxSimulations: 46, // safety cap on full sims per recommend() call
    approxMargin: 1, // gap placing approximate rows just below the simmed set
  },
  returnChip: {
    topN: 8,
    minProbability: 0.7,
  },
  takeNowPassLoss: 8,
  canWaitPassLoss: 6,
  robustness: {
    closeCallPpw: 0.7,
    leanPpw: 1.5,
    robustWinRate: 0.62,
    opponentPoolEarly: 10,
    opponentPoolMiddle: 16,
    opponentPoolLate: 24,
    temperatureEarly: 8,
    temperatureMiddle: 14,
    temperatureLate: 22,
    earlyThroughRound: 3,
    middleThroughRound: 8,
    overdueScale: 8,
    overdueWeightCap: 3,
    unlikelyReturn: 0.5,
    // Availability is cheap (opponent window only). Full rest-of-draft
    // utility stays at 1 stream per scenario so live ranking stays snappy.
    availabilityStreams: 10,
    utilityStreams: 1,
  },
};

export type RecommendationConfig = typeof RECOMMENDATION_CONFIG;
