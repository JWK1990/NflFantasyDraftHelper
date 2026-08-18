import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type {
  DraftState,
  LaterPosBreakdown,
  Player,
  Recommendation,
  RosterCounts,
  ScoreBreakdown,
} from "../domain/types.ts";
import { eligiblePlayers } from "./eligibility.ts";
import { makesStartingLineup } from "./lineup.ts";
import { isAcceptableQb } from "./qb.ts";
import { compareQbBranches, forcedQbOverallPick, type QbBranchComparison } from "./qbBranch.ts";
import {
  intrinsicLookaheadPool,
  preSelectionStateHash,
  returnProbability,
  simulateCandidateDraft,
  type LaterAcquisition,
} from "./draftSim.ts";
import { completedTeamUtility } from "./teamUtility.ts";
import { lateRoundReservation } from "./lateRound.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { remainingByPosTier } from "./tierScarcity.ts";
import {
  isUserPick,
  nextUserPickAfter,
  userPickSchedule,
} from "./snake.ts";
import { playerMatchesTagFilter, scoutingTag } from "./tags.ts";
import { likelyGoneByNextTurn } from "./vona.ts";
import { LEAGUE } from "../config/leagueSettings.ts";

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

function qbReasonChips(
  player: Player,
  counts: RosterCounts,
  available: Player[],
  currentOverallPick: number,
  qb2Mode: DraftState["qb2Mode"],
  branch: QbBranchComparison | null,
  config: RecommendationConfig,
): string[] {
  const reasons: string[] = [];
  if (player.pos !== "QB") return reasons;

  const remainingQbs = available.filter((candidate) => candidate.pos === "QB");
  const acceptableLeft = remainingQbs.filter((candidate) =>
    isAcceptableQb(candidate, config),
  ).length;
  const similar = similarSecureQbCount(remainingQbs, config);
  const lastPick = userPickSchedule().at(-1) ?? 174;

  if (counts.QB === 0 && branch && !branch.doubleLateViable) {
    reasons.push("Late QB pool no longer safe");
  }

  if (counts.QB === 1 && qb2Mode === "adaptive-punt") {
    const shrinking = acceptableLeft <= config.qb.shrinkingPoolThreshold;
    if (shrinking) {
      reasons.push(`Starter pool shrinking (${acceptableLeft} left)`);
    } else {
      reasons.push(`QB2 can wait; ${similar} similar options remain`);
    }
  }

  if (player.qbStarterSecurity === "fragile") {
    reasons.push("Backup / insecure job");
  }

  if (
    currentOverallPick === lastPick &&
    counts.QB === 1 &&
    isAcceptableQb(player, config)
  ) {
    reasons.push("Force QB2 at 15.06");
  }

  return reasons;
}

function collectReasons(
  player: Player,
  extras: string[],
  leftInTier: number,
  currentOverallPick: number,
  likelyGone: Set<string>,
  counts: RosterCounts,
  starts: boolean,
): string[] {
  const reasons: string[] = [];
  const tag = scoutingTag(player);
  if (tag) reasons.push(tag);
  if (leftInTier === 1) {
    reasons.push(`Last in ${player.pos} T${player.posTier}`);
  } else if (leftInTier === 2 || leftInTier === 3) {
    reasons.push(`${player.pos} T${player.posTier}: ${leftInTier} left`);
  }
  reasons.push(...extras);

  const missing = player.pos === "QB" || player.pos === "RB" || player.pos === "WR" || player.pos === "TE";
  if (missing) {
    const need =
      player.pos === "QB"
        ? counts.QB < 1
        : player.pos === "RB"
          ? counts.RB < 2
          : player.pos === "WR"
            ? counts.WR < 2
            : counts.TE < 1;
    if (need) reasons.push(`Need ${player.pos}`);
  }
  if (!starts && player.pos !== "K" && player.pos !== "DST") {
    reasons.push("Bench only");
  }
  if (likelyGone.has(player.id)) {
    const next = nextUserPickAfter(currentOverallPick);
    if (next != null) {
      reasons.push(`Unlikely to be available at pick ${next}`);
    }
  }

  const unique = [...new Set(reasons)].filter(Boolean);
  if (unique.length === 0) {
    unique.push(player.tag || `Model #${player.modelRank}`);
  }
  return unique;
}

function moveToFront(
  scored: Recommendation[],
  playerId: string,
): Recommendation[] {
  const hit = scored.find((row) => row.player.id === playerId);
  if (!hit) return scored;
  return [hit, ...scored.filter((row) => row.player.id !== playerId)];
}

function applyLivePins(
  scored: Recommendation[],
  currentOverallPick: number,
  counts: RosterCounts,
  branch: QbBranchComparison | null,
): Recommendation[] {
  const reserved = lateRoundReservation(
    currentOverallPick,
    counts.QB,
    counts.K >= 1,
    counts.DST >= 1,
  );
  if (reserved === "K" || reserved === "DST") {
    const special = scored
      .filter((row) => row.player.pos === reserved)
      .sort((a, b) => a.player.posRank - b.player.posRank)[0];
    if (special) return moveToFront(scored, special.player.id);
  }
  if (reserved === "QB" || forcedQbOverallPick(currentOverallPick, counts.QB)) {
    const forced = scored
      .filter((row) => row.player.pos === "QB")
      .sort((a, b) => b.player.modelPts - a.player.modelPts)[0];
    if (forced) return moveToFront(scored, forced.player.id);
  }
  if (
    isUserPick(currentOverallPick) &&
    branch?.verdict === "qb-now" &&
    branch.qbNow.firstPick
  ) {
    return moveToFront(scored, branch.qbNow.firstPick.id);
  }
  return scored;
}

function addLikelyAvailableReasons(
  scored: Recommendation[],
  currentOverallPick: number,
  likelyGone: Set<string>,
  branch: QbBranchComparison | null,
  config: RecommendationConfig,
): Recommendation[] {
  const next = nextUserPickAfter(currentOverallPick);
  if (next == null) return scored;

  const reservedNow =
    branch?.verdict === "qb-now" ? branch.qbNow.firstPick?.id : undefined;
  const label = `likely to be available at pick ${next}`;

  for (const row of scored.slice(0, config.returnChip.topN)) {
    if (row.player.pos === "K" || row.player.pos === "DST") continue;
    if (row.player.id === reservedNow) continue;
    if (likelyGone.has(row.player.id)) continue;
    if (row.breakdown.returnProbability < config.returnChip.minProbability) continue;
    if (row.reasons.some((reason) => reason.startsWith("Unlikely to be available"))) {
      continue;
    }
    if (!row.reasons.includes(label)) row.reasons.push(label);
  }
  return scored;
}

function addTimingReasons(
  scored: Recommendation[],
  config: RecommendationConfig,
): Recommendation[] {
  for (const row of scored) {
    if (row.player.pos === "K" || row.player.pos === "DST") continue;
    if (
      row.breakdown.expectedPassLoss >= config.takeNowPassLoss &&
      row.breakdown.returnProbability < 0.5
    ) {
      if (!row.reasons.includes("Take now")) row.reasons.push("Take now");
    } else if (
      row.breakdown.returnProbability >= config.returnChip.minProbability &&
      row.breakdown.expectedPassLoss < config.canWaitPassLoss
    ) {
      if (!row.reasons.includes("Can wait")) row.reasons.push("Can wait");
    }
  }
  return scored;
}

function laterNote(row: LaterAcquisition | null | undefined): LaterPosBreakdown | undefined {
  if (!row) return undefined;
  return {
    player: row.player.player,
    overallPick: row.overallPick,
    returnProbability: row.returnProbability,
  };
}

function scenariosAllowInversion(ahead: Recommendation, behind: Recommendation): boolean {
  const aScen = ahead.breakdown.scenarioUtilities;
  const bScen = behind.breakdown.scenarioUtilities;
  if (!aScen || !bScen || aScen.length !== bScen.length || aScen.length === 0) {
    return false;
  }
  return aScen.every((utility, index) => utility + 0.01 >= (bScen[index] ?? 0));
}

function samePositionInversionBlocked(
  ahead: Recommendation,
  behind: Recommendation,
): boolean {
  if (ahead.player.pos !== behind.player.pos) return false;
  if (ahead.player.pos === "K" || ahead.player.pos === "DST") return false;
  if (ahead.player.modelPts >= behind.player.modelPts) return false;
  const directEdge = behind.player.modelPts - ahead.player.modelPts;
  const continuation =
    ahead.dynamicScore - behind.dynamicScore + directEdge;
  return !(continuation > directEdge + 0.01 && scenariosAllowInversion(ahead, behind));
}

function annotateInversions(scored: Recommendation[]): void {
  for (let index = 0; index < scored.length; index += 1) {
    const ahead = scored[index];
    if (!ahead) continue;
    const behind = scored.find(
      (row, inner) =>
        inner > index &&
        row.player.pos === ahead.player.pos &&
        row.player.modelPts > ahead.player.modelPts,
    );
    if (!behind) continue;
    if (samePositionInversionBlocked(ahead, behind)) continue;
    const directEdge = behind.player.modelPts - ahead.player.modelPts;
    ahead.breakdown.samePositionInversion = {
      otherPlayer: behind.player.player,
      directEdge,
      continuationEdge: ahead.dynamicScore - behind.dynamicScore + directEdge,
      netEdge: ahead.dynamicScore - behind.dynamicScore,
    };
  }
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
  const remainingUserPicks = Math.max(0, LEAGUE.rosterSize - counts.total);
  const nextUser = nextUserPickAfter(currentOverallPick);
  const stateHash = preSelectionStateHash(state);
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
  const lookahead = intrinsicLookaheadPool(
    eligible,
    roster,
    remainingUserPicks,
    currentOverallPick,
    config,
  );

  const scored: Recommendation[] = eligible.map((player) => {
    const leftInTier = remaining.get(`${player.pos}-${player.posTier}`) ?? 0;
    const qbReasons = qbReasonChips(
      player,
      counts,
      eligible,
      currentOverallPick,
      state.qb2Mode,
      branch,
      config,
    );
    const starts = makesStartingLineup(roster, player);
    const fullLookahead = lookahead.has(player.id);
    const sim = fullLookahead
      ? simulateCandidateDraft(players, state, player, config)
      : null;
    const cheap = completedTeamUtility(
      [...roster, player],
      Math.max(0, remainingUserPicks - 1),
      config,
    );
    const simLocked = Boolean(
      sim?.candidateLocked && sim.roster.some((row) => row.id === player.id),
    );
    const team = simLocked && sim ? sim.utility : cheap;
    const returnChance = returnProbability(
      player,
      eligible,
      currentOverallPick,
      nextUser,
    );

    const later = sim?.laterAcquisition;
    const breakdown: ScoreBreakdown = {
      starterProjection: team.starterProjection,
      benchValue: team.benchValue,
      riskAdjustment: team.riskAdjustment,
      slotPenalty: team.slotPenalty,
      teamUtility: team.utility,
      alternativeUtility: 0,
      expectedGain: 0,
      returnProbability: returnChance,
      lookahead: fullLookahead,
      preSelectionStateHash: stateHash,
      candidateSecuredNow: player.player,
      directProjection: player.modelPts,
      continuationEffect: 0,
      expectedPassLoss: 0,
      waitPick: nextUser,
      laterPlayer: later?.player.player,
      laterPos: later?.player.pos,
      laterOverallPick: later?.overallPick,
      laterReturnProbability: later?.returnProbability,
      laterFallback: later?.fallbackPlayer?.player,
      laterQbPolicy: later?.qbPolicy ?? sim?.qbPolicy,
      laterQb: laterNote(sim?.laterQb),
      laterWr: laterNote(sim?.laterWr),
      laterTe: laterNote(sim?.laterTe),
      scenarioUtilities: sim?.scenarioUtilities,
    };

    return {
      player,
      dynamicScore: simLocked ? team.utility : team.utility - 4000,
      breakdown,
      reasons: collectReasons(
        player,
        qbReasons,
        leftInTier,
        currentOverallPick,
        likelyGone,
        counts,
        starts,
      ),
    };
  });

  const compareUtility = (left: Recommendation, right: Recommendation) => {
    if (samePositionInversionBlocked(left, right)) return 1;
    if (samePositionInversionBlocked(right, left)) return -1;
    const diff = right.dynamicScore - left.dynamicScore;
    if (Math.abs(diff) > config.timingTieTolerance) return diff;
    const pass =
      (right.breakdown.expectedPassLoss ?? 0) - (left.breakdown.expectedPassLoss ?? 0);
    if (pass !== 0) return pass;
    return right.player.vorp - left.player.vorp || left.player.modelRank - right.player.modelRank;
  };

  scored.sort((left, right) => {
    const diff = right.dynamicScore - left.dynamicScore;
    if (diff !== 0) return diff;
    return right.player.vorp - left.player.vorp || left.player.modelRank - right.player.modelRank;
  });

  for (const row of scored) {
    const alternative =
      scored.find((peer) => peer.player.id !== row.player.id) ?? row;
    row.breakdown.alternativeUtility = alternative.dynamicScore;
    row.breakdown.alternativePlayer = alternative.player.player;
    row.breakdown.expectedGain = row.dynamicScore - alternative.dynamicScore;
    row.breakdown.continuationEffect =
      row.dynamicScore -
      alternative.dynamicScore -
      (row.player.modelPts - alternative.player.modelPts);
    row.breakdown.expectedPassLoss =
      (1 - row.breakdown.returnProbability) *
      Math.max(0, row.dynamicScore - alternative.dynamicScore);
  }

  scored.sort(compareUtility);
  annotateInversions(scored);

  return addTimingReasons(
    addLikelyAvailableReasons(
      applyLivePins(scored, currentOverallPick, counts, branch),
      currentOverallPick,
      likelyGone,
      branch,
      config,
    ),
    config,
  );
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
  if (!playerMatchesTagFilter(player, state.tagFilter)) {
    return false;
  }
  const query = state.search.trim().toLowerCase();
  if (query && !player.player.toLowerCase().includes(query) && !player.team.toLowerCase().includes(query)) {
    return false;
  }
  return true;
}
