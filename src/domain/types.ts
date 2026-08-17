export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";
export type DraftedBy = "mine" | "other";
export type Qb2Mode = "adaptive-punt" | "normal";
export type PositionFilter = Position | "ALL";
export type TierFilter = number | "ALL";
export type QbStarterSecurity = "secure" | "probable" | "fragile";

export interface Player {
  id: string;
  player: string;
  team: string;
  pos: Position;
  modelRank: number;
  posRank: number;
  posTier: number;
  tier: number;
  modelPts: number;
  vorp: number;
  adp: number | null;
  tag: string;
  note: string;
  qbStarterSecurity?: QbStarterSecurity;
}

export interface DraftPick {
  playerId: string;
  draftedBy: DraftedBy;
  overallPick: number;
  round: number;
  timestamp: string;
}

export interface DraftState {
  schemaVersion: 1;
  picks: DraftPick[];
  search: string;
  positionFilter: PositionFilter;
  tierFilter: TierFilter;
  qb2Mode: Qb2Mode;
}

export type DraftAction =
  | { type: "DRAFT_PLAYER"; playerId: string; draftedBy: DraftedBy }
  | { type: "UNDO_LAST_PICK" }
  | { type: "RESET_DRAFT" }
  | { type: "SET_SEARCH"; search: string }
  | { type: "SET_POSITION_FILTER"; position: PositionFilter }
  | { type: "SET_TIER_FILTER"; tier: TierFilter }
  | { type: "SET_QB2_MODE"; mode: Qb2Mode };

export interface ScoreBreakdown {
  starterProjection: number;
  benchValue: number;
  riskAdjustment: number;
  slotPenalty: number;
  teamUtility: number;
  alternativeUtility: number;
  expectedGain: number;
  returnProbability: number;
  lookahead: boolean;
}

export interface Recommendation {
  player: Player;
  dynamicScore: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
}

export interface RosterCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DST: number;
  total: number;
}

export interface RosterCoverage {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  op: number;
  k: number;
  dst: number;
  bench: number;
}
