import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type {
  DraftState,
  Player,
  Recommendation,
  RosterCounts,
  ScoreBreakdown,
} from "../domain/types.ts";
import { eligiblePlayers } from "./eligibility.ts";
import { lineupDelta, makesStartingLineup } from "./lineup.ts";
import { isAcceptableQb, hasRiskTag } from "./qb.ts";
import { compareQbBranches, forcedQbOverallPick, type QbBranchComparison } from "./qbBranch.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { coveragePressure } from "./rosterNeed.ts";
import { remainingByPosTier, tierCliffBonus, tierCliffDrop } from "./tierScarcity.ts";
import {
  formatPickLabel,
  nextUserPickAfter,
  roundForPick,
  userPickSchedule,
} from "./snake.ts";
import { likelyGoneByNextTurn, vonaForCandidate } from "./vona.ts";

export function baseValue(
  player: Player,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  return Math.max(0, config.base.max - (player.modelRank - 1) * config.base.rankStep);
}

function similarSecureQbCount(
  qbs: Player[],
  config: RecommendationConfig,
): number {
  const secure = qbs.filter((player) => isAcceptableQb(player, config));
  if (secure.length === 0) return 0;
  const bestVorp = Math.max(...secure.map((player) => player.vorp));
  return secure.filter(
    (player) => bestVorp - player.vorp <= config.qb.similarVorpSpread,
  ).length;
}

function bestSurvivingQb(
  player: Player,
  available: Player[],
  likelyGone: Set<string>,
): Player | null {
  return (
    available
      .filter(
        (candidate) =>
          candidate.pos === "QB" &&
          candidate.id !== player.id &&
          !likelyGone.has(candidate.id) &&
          isAcceptableQb(candidate),
      )
      .sort((a, b) => a.modelRank - b.modelRank)[0] ?? null
  );
}

function qbTimingAdjustment(
  player: Player,
  counts: RosterCounts,
  available: Player[],
  vonaUrgency: number,
  cliffDrop: number,
  currentOverallPick: number,
  likelyGone: Set<string>,
  qb2Mode: DraftState["qb2Mode"],
  branch: QbBranchComparison | null,
  config: RecommendationConfig,
): { adjustment: number; reasons: string[] } {
  const reasons: string[] = [];
  if (player.pos !== "QB") return { adjustment: 0, reasons };

  let adjustment = 0;
  const remainingQbs = available.filter((candidate) => candidate.pos === "QB");
  const acceptableLeft = remainingQbs.filter((candidate) =>
    isAcceptableQb(candidate, config),
  ).length;
  const similar = similarSecureQbCount(remainingQbs, config);
  const lastPick = userPickSchedule().at(-1) ?? 174;
  const round = roundForPick(currentOverallPick);
  const survivor = bestSurvivingQb(player, available, likelyGone);
  const waitDrop = Math.max(0, player.vorp - (survivor?.vorp ?? 0));
  const waitingIsOpen = Boolean(branch?.doubleLateViable) && counts.QB === 0;

  if (counts.QB === 0 && !waitingIsOpen) {
    if (round >= config.qb.qb1StartRound) {
      adjustment += config.qb.qb1Deadline;
      reasons.push("QB1 getting late");
    }
    if (round >= config.qb.qb1UrgentRound) {
      adjustment += config.qb.qb1Urgent;
    }
    if (waitDrop > 0 && round >= config.qb.qb1StartRound) {
      adjustment += Math.min(config.qb.waitDropCap, waitDrop * config.qb.waitDropScale);
    }
    if (branch && !branch.doubleLateViable) {
      adjustment += config.qb.abandonWaitBoost;
      reasons.push("Late QB pool no longer safe");
    }
  }

  if (counts.QB === 1) {
    const cliff = cliffDrop >= config.coverage.cliffVorp;
    const strongVona = vonaUrgency >= config.qb.qb2VonaThreshold;
    const shrinking = acceptableLeft <= config.qb.shrinkingPoolThreshold;

    if (qb2Mode === "adaptive-punt") {
      if (cliff) {
        adjustment += config.qb.qb2CliffBonus;
        reasons.push("QB2 tier cliff");
      } else if (strongVona) {
        adjustment += Math.round(vonaUrgency / 2);
        reasons.push("QB2 value now");
      } else if (shrinking) {
        adjustment += config.qb.shrinkingPoolBonus;
        reasons.push(`Starter pool shrinking (${acceptableLeft} left)`);
      } else {
        reasons.push(`QB2 can wait; ${similar} similar options remain`);
      }
    } else {
      adjustment += config.qb.qb2Normal;
      if (cliff) adjustment += config.qb.qb2CliffBonus;
    }
  }

  if (hasRiskTag(player) || player.qbStarterSecurity === "fragile") {
    adjustment -= config.qb.riskTagPenalty;
    reasons.push("Risky starter job");
  }

  const nowTarget = branch?.qbNow.firstPick;
  if (branch?.allenException && player.player === "Josh Allen") {
    adjustment += config.qb.branchNowBoost;
    reasons.unshift(branch.reason);
  } else if (
    branch?.verdict === "qb-now" &&
    !branch.allenException &&
    nowTarget?.id === player.id
  ) {
    adjustment += config.qb.branchNowBoost;
    reasons.unshift(branch.reason);
  }

  if (
    currentOverallPick === lastPick &&
    counts.QB === 1 &&
    isAcceptableQb(player, config)
  ) {
    adjustment += config.qb.pick174ForceBonus;
    reasons.push("Force QB2 at 15.06");
  }

  return { adjustment, reasons };
}

function marketUrgencyScore(
  player: Player,
  currentOverallPick: number,
  config: RecommendationConfig,
): number {
  if (player.adp == null) return 0;
  const distance = player.adp - currentOverallPick;
  if (distance < -4 || distance > config.marketUrgency.window) return 0;
  const closeness = config.marketUrgency.window - Math.max(0, distance);
  return (closeness / config.marketUrgency.window) * config.marketUrgency.max;
}

function reachPenaltyScore(
  player: Player,
  currentOverallPick: number,
  config: RecommendationConfig,
): number {
  if (player.adp == null) return 0;
  const reach = player.adp - currentOverallPick;
  if (reach <= config.reachPenalty.grace) return 0;
  return Math.min(
    config.reachPenalty.max,
    (reach - config.reachPenalty.grace) * config.reachPenalty.perPick,
  );
}

function lateSpecialTeamsBoost(
  player: Player,
  counts: RosterCounts,
  currentOverallPick: number,
  config: RecommendationConfig,
): number {
  const round = roundForPick(currentOverallPick);
  if (round < config.specialTeams.suppressBeforeRound) return 0;

  const lastPicks = userPickSchedule();
  const pick150 = lastPicks[12];
  const pick163 = lastPicks[13];
  const pick174 = lastPicks[14];
  const punting = counts.QB === 1;

  if (punting) {
    if (currentOverallPick === pick150 && player.pos === "K" && counts.K === 0) {
      return config.specialTeams.lateRoundBoost;
    }
    if (
      currentOverallPick === pick163 &&
      player.pos === "DST" &&
      counts.DST === 0
    ) {
      return config.specialTeams.lateRoundBoost;
    }
    if (currentOverallPick === pick174) return 0;
  } else if (counts.QB >= 2) {
    if (player.pos === "K" && counts.K === 0) {
      return config.specialTeams.lateRoundBoost;
    }
    if (player.pos === "DST" && counts.DST === 0) {
      return config.specialTeams.lateRoundBoost;
    }
  }

  if (player.pos === "K" && counts.K === 0) return config.specialTeams.lateRoundBoost / 2;
  if (player.pos === "DST" && counts.DST === 0) {
    return config.specialTeams.lateRoundBoost / 2;
  }
  return 0;
}

function collectReasons(
  player: Player,
  breakdown: ScoreBreakdown,
  extras: string[],
  cliffDrop: number,
  leftInTier: number,
  currentOverallPick: number,
  likelyGone: Set<string>,
): string[] {
  const reasons: string[] = [];
  if (leftInTier === 1 && cliffDrop > 0) {
    reasons.push(`Last in ${player.pos} T${player.posTier}`);
  }
  reasons.push(...extras);

  if (breakdown.coveragePressure >= 6) {
    reasons.push(`Need ${player.pos}`);
  }
  if (breakdown.benchPenalty > 0) {
    reasons.push("Bench only");
  }
  if (likelyGone.has(player.id)) {
    const next = nextUserPickAfter(currentOverallPick);
    if (next != null) {
      reasons.push(`unlikely to be available at ${formatPickLabel(next)}`);
    }
  }
  if (breakdown.vonaUrgency >= 6) {
    reasons.push("big drop if you pass (VONA)");
  }

  const unique = [...new Set(reasons)].filter(Boolean);
  if (unique.length === 0) {
    unique.push(player.tag || `Model #${player.modelRank}`);
  }
  return unique;
}

export function recommend(
  players: Player[],
  state: DraftState,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): Recommendation[] {
  const byId = playersById(players);
  const counts = rosterCounts(state.picks, byId);
  const roster = myRosterPlayers(state.picks, byId);
  const currentOverallPick = state.picks.length + 1;
  const branch = compareQbBranches(players, state, config);

  const eligible = eligiblePlayers(
    players,
    state.picks,
    counts,
    currentOverallPick,
    config,
  );
  const remaining = remainingByPosTier(eligible);
  const likelyGone = likelyGoneByNextTurn(eligible, currentOverallPick);
  const bestAvailableQbPts =
    eligible
      .filter((player) => player.pos === "QB" && isAcceptableQb(player, config))
      .sort((a, b) => b.modelPts - a.modelPts)[0]?.modelPts ?? null;

  const scored: Recommendation[] = eligible.map((player) => {
    const leftInTier = remaining.get(`${player.pos}-${player.posTier}`) ?? 0;
    const cliffDrop = tierCliffDrop(player, eligible);
    const vonaUrgency = vonaForCandidate(player, eligible, likelyGone, config);
    const qb = qbTimingAdjustment(
      player,
      counts,
      eligible,
      vonaUrgency,
      cliffDrop,
      currentOverallPick,
      likelyGone,
      state.qb2Mode,
      branch,
      config,
    );
    const specialBoost = lateSpecialTeamsBoost(
      player,
      counts,
      currentOverallPick,
      config,
    );
    const rawLineup =
      roster.length === 0 ? 0 : lineupDelta(roster, player, bestAvailableQbPts);
    const starts = makesStartingLineup(roster, player, bestAvailableQbPts);
    const benchPenalty =
      roster.length > 0 && !starts && player.pos !== "K" && player.pos !== "DST"
        ? config.benchPenalty
        : 0;

    const breakdown: ScoreBreakdown = {
      baseValue: baseValue(player, config),
      lineupDelta: Math.min(config.lineup.cap, rawLineup * config.lineup.scale),
      coveragePressure:
        coveragePressure(player, counts, currentOverallPick, cliffDrop, config) +
        specialBoost,
      tierScarcity: tierCliffBonus(player, eligible, config),
      vonaUrgency,
      marketUrgency: marketUrgencyScore(player, currentOverallPick, config),
      qbTiming: qb.adjustment,
      benchPenalty,
      reachPenalty: reachPenaltyScore(player, currentOverallPick, config),
    };

    const dynamicScore =
      breakdown.baseValue +
      breakdown.lineupDelta +
      breakdown.coveragePressure +
      breakdown.tierScarcity +
      breakdown.vonaUrgency +
      breakdown.marketUrgency +
      breakdown.qbTiming -
      breakdown.benchPenalty -
      breakdown.reachPenalty;

    return {
      player,
      dynamicScore,
      breakdown,
      reasons: collectReasons(
        player,
        breakdown,
        qb.reasons,
        cliffDrop,
        leftInTier,
        currentOverallPick,
        likelyGone,
      ),
    };
  });

  scored.sort((a, b) => {
    if (b.dynamicScore !== a.dynamicScore) return b.dynamicScore - a.dynamicScore;
    return a.player.modelRank - b.player.modelRank;
  });

  if (forcedQbOverallPick(currentOverallPick, counts.QB)) {
    const forced = scored
      .filter((row) => row.player.pos === "QB")
      .sort((a, b) => a.player.modelRank - b.player.modelRank)[0];
    if (forced) {
      const rest = scored.filter((row) => row.player.id !== forced.player.id);
      return [forced, ...rest];
    }
  }

  return scored;
}

export function matchesFilters(
  player: Player,
  state: DraftState,
): boolean {
  if (state.positionFilter !== "ALL" && player.pos !== state.positionFilter) {
    return false;
  }
  if (state.tierFilter !== "ALL" && player.posTier !== state.tierFilter) {
    return false;
  }
  const query = state.search.trim().toLowerCase();
  if (query && !player.player.toLowerCase().includes(query) && !player.team.toLowerCase().includes(query)) {
    return false;
  }
  return true;
}
