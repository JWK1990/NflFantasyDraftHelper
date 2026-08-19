import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { RobustnessVerdict } from "../domain/types.ts";

export type { RobustnessVerdict };

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[index] ?? 0;
}

export const PAIRED_TIE_EPSILON = 0.01;

/**
 * Fraction of matched scenarios the left candidate wins. Ties count as 0.5 to
 * each side (§11.4), so pairedWinRate(a, b) + pairedWinRate(b, a) === 1 — no
 * systematic advantage to whichever candidate is passed first.
 */
export function pairedWinRate(left: number[] | undefined, right: number[] | undefined): number | null {
  if (!left || !right || left.length === 0 || left.length !== right.length) return null;
  let wins = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (Math.abs(l - r) <= PAIRED_TIE_EPSILON) wins += 0.5;
    else if (l > r) wins += 1;
  }
  return wins / left.length;
}

export function classifyVerdict(
  seasonEdge: number,
  winRate: number | null,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): RobustnessVerdict {
  const ppw = Math.abs(seasonEdge) / config.branch.weeks;
  const unstable =
    winRate != null &&
    seasonEdge > 0 &&
    winRate < config.robustness.robustWinRate &&
    ppw < config.robustness.leanPpw;
  if (ppw < config.robustness.closeCallPpw || unstable) return "too-close";
  if (ppw < config.robustness.leanPpw) return "lean";
  return "clear-edge";
}

export function inversionIsAuthoritative(
  netEdge: number,
  continuationEdge: number,
  directEdge: number,
  winRate: number | null,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): boolean {
  if (winRate == null) return false;
  const threshold = config.robustness.closeCallPpw * config.branch.weeks;
  return (
    continuationEdge > directEdge + 0.01 &&
    netEdge >= threshold &&
    winRate >= config.robustness.robustWinRate
  );
}

export function opponentPoolSize(
  round: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  if (round <= config.robustness.earlyThroughRound) {
    return config.robustness.opponentPoolEarly;
  }
  if (round <= config.robustness.middleThroughRound) {
    return config.robustness.opponentPoolMiddle;
  }
  return config.robustness.opponentPoolLate;
}

export function opponentTemperature(
  round: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  if (round <= config.robustness.earlyThroughRound) {
    return config.robustness.temperatureEarly;
  }
  if (round <= config.robustness.middleThroughRound) {
    return config.robustness.temperatureMiddle;
  }
  return config.robustness.temperatureLate;
}

export const SAME_POSITION_CLAMP_EPSILON = 0.001;

export function marketWeight(
  adp: number | null,
  overallPick: number,
  temperature: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  const market = adp ?? 900 + overallPick;
  const delta = market - overallPick;
  if (delta >= 0) {
    return Math.exp(-delta / Math.max(1, temperature));
  }
  const overdue = -delta;
  const boosted = 1 + overdue / Math.max(1, config.robustness.overdueScale);
  return Math.min(config.robustness.overdueWeightCap, boosted);
}

export interface ClampableRecommendation {
  player: { pos: string; modelPts: number };
  dynamicScore: number;
  breakdown: {
    rawUtility: number;
    scenarioUtilities?: number[];
  };
}

export function clampSamePositionUtilities(
  rows: ClampableRecommendation[],
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): void {
  const byPos = new Map<string, ClampableRecommendation[]>();
  for (const row of rows) {
    if (row.player.pos === "K" || row.player.pos === "DST") continue;
    const group = byPos.get(row.player.pos) ?? [];
    group.push(row);
    byPos.set(row.player.pos, group);
  }

  for (const group of byPos.values()) {
    const ordered = [...group].sort((left, right) => right.player.modelPts - left.player.modelPts);
    for (let index = 0; index < ordered.length; index += 1) {
      const peer = ordered[index];
      if (!peer) continue;
      for (let inner = index + 1; inner < ordered.length; inner += 1) {
        const lower = ordered[inner];
        if (!lower || lower.player.modelPts >= peer.player.modelPts) continue;
        if (lower.breakdown.rawUtility <= peer.breakdown.rawUtility) continue;
        const directEdge = peer.player.modelPts - lower.player.modelPts;
        const netEdge = lower.breakdown.rawUtility - peer.breakdown.rawUtility;
        const winRate = pairedWinRate(
          lower.breakdown.scenarioUtilities,
          peer.breakdown.scenarioUtilities,
        );
        if (
          inversionIsAuthoritative(
            netEdge,
            netEdge + directEdge,
            directEdge,
            winRate,
            config,
          )
        ) {
          continue;
        }
        const cap = peer.dynamicScore - SAME_POSITION_CLAMP_EPSILON;
        if (lower.dynamicScore > cap) lower.dynamicScore = cap;
      }
    }
  }
}

export function verdictLabel(verdict: RobustnessVerdict): string {
  if (verdict === "clear-edge") return "Clear edge";
  if (verdict === "lean") return "Lean";
  return "Too close";
}
