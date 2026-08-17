import type { Position } from "../domain/types.ts";

export const LEAGUE = {
  teams: 12,
  rounds: 15,
  userSlot: 6,
  rosterSize: 15,
  timerSeconds: 60,
  benchSlots: 5,
  hardCaps: {
    QB: 2,
    RB: 8,
    WR: 8,
    TE: 3,
    K: 3,
    DST: 3,
  } as Record<Position, number>,
  starters: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    FLEX: 1,
    OP: 1,
    K: 1,
    DST: 1,
  },
  specialTeamsStartRound: 13,
} as const;

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export const POSITION_COLORS: Record<Position, { bg: string; text: string }> = {
  QB: { bg: "#0e7c8b", text: "#f0fdfe" },
  RB: { bg: "#c59218", text: "#1a1408" },
  WR: { bg: "#3b82f6", text: "#f3f8ff" },
  TE: { bg: "#a855f7", text: "#faf5ff" },
  K: { bg: "#64748b", text: "#f8fafc" },
  DST: { bg: "#d97706", text: "#fffbeb" },
};

export function scarcityLevel(left: number): "low" | "mid" | "high" {
  if (left <= 2) return "low";
  if (left <= 4) return "mid";
  return "high";
}
