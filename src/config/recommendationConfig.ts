export const RECOMMENDATION_CONFIG = {
  base: {
    max: 100,
    rankStep: 2.2,
  },
  lineup: {
    scale: 0.05,
    cap: 24,
  },
  coverage: {
    perSlot: 7,
    earlyThroughRound: 2,
    midThroughRound: 7,
    lateFromRound: 11,
    cliffBoost: 1.45,
    cliffVorp: 12,
  },
  cliff: {
    scale: 0.12,
    cap: 16,
    minVorp: 8,
  },
  vona: {
    cap: 14,
    scale: 0.12,
  },
  marketUrgency: {
    window: 8,
    max: 5,
  },
  reachPenalty: {
    grace: 14,
    perPick: 0.25,
    max: 10,
  },
  qb: {
    acceptablePosRank: 24,
    qb1StartRound: 3,
    qb1Deadline: 8,
    qb1UrgentRound: 5,
    qb1Urgent: 10,
    qb2Normal: 6,
    qb2CliffBonus: 10,
    qb2VonaThreshold: 8,
    shrinkingPoolThreshold: 6,
    shrinkingPoolBonus: 8,
    riskTagPenalty: 8,
    similarVorpSpread: 18,
    pick174ForceBonus: 1000,
    waitDropScale: 0.08,
    waitDropCap: 10,
    branchNowBoost: 12,
    abandonWaitBoost: 14,
  },
  branch: {
    weeks: 17,
    qbNowPpwLead: 1.5,
    waitPpwLead: 1.0,
    opponentQbCap: 22,
    probablePenalty: 10,
    fragilePenalty: 28,
  },
  benchPenalty: 8,
  specialTeams: {
    suppressBeforeRound: 13,
    lateRoundBoost: 22,
  },
};

export type RecommendationConfig = typeof RECOMMENDATION_CONFIG;
