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
import {
  intrinsicLookaheadPool,
  preSelectionStateHash,
  returnProbability,
  simulateCandidateDraft,
  type CompletedSim,
  type LaterAcquisition,
} from "./draftSim.ts";
import { upperBoundUtility } from "./promotion.ts";
import { completedTeamUtility } from "./teamUtility.ts";
import { lateRoundReservation } from "./lateRound.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { remainingByPosTier } from "./tierScarcity.ts";
import { nextUserPickAfter } from "./snake.ts";
import { playerMatchesTagFilter, scoutingTag } from "./tags.ts";
import { LEAGUE } from "../config/leagueSettings.ts";
import {
  classifyVerdict,
  clampSamePositionUtilities,
  inversionIsAuthoritative,
  pairedWinRate,
  percentile,
} from "./robustness.ts";

function collectReasons(
  player: Player,
  leftInTier: number,
  currentOverallPick: number,
  returnChance: number,
  counts: RosterCounts,
  starts: boolean,
  config: RecommendationConfig,
): string[] {
  const reasons: string[] = [];
  const tag = scoutingTag(player);
  if (tag) reasons.push(tag);
  if (leftInTier === 1) {
    reasons.push(`Last in ${player.pos} T${player.posTier}`);
  } else if (leftInTier === 2 || leftInTier === 3) {
    reasons.push(`${player.pos} T${player.posTier}: ${leftInTier} left`);
  }

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
  if (returnChance < config.robustness.unlikelyReturn) {
    const next = nextUserPickAfter(currentOverallPick);
    if (next != null) {
      reasons.push(`Unlikely at pick ${next}`);
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
): Recommendation[] {
  // The only legitimate override of the top score is a genuine legal-roster
  // requirement with no remaining alternative: a required K/DST, or a required
  // QB1 (never QB2 — that is left to ordinary utility). See §1.4 / §13.
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
  if (reserved === "QB") {
    const forced = scored
      .filter((row) => row.player.pos === "QB")
      .sort((a, b) => b.player.modelPts - a.player.modelPts)[0];
    if (forced) return moveToFront(scored, forced.player.id);
  }
  return scored;
}

function addLikelyAvailableReasons(
  scored: Recommendation[],
  currentOverallPick: number,
  config: RecommendationConfig,
): Recommendation[] {
  const next = nextUserPickAfter(currentOverallPick);
  if (next == null) return scored;

  const label = `Likely at pick ${next}`;

  for (const row of scored.slice(0, config.returnChip.topN)) {
    if (row.player.pos === "K" || row.player.pos === "DST") continue;
    if (row.breakdown.returnProbability < config.returnChip.minProbability) continue;
    if (row.reasons.some((reason) => reason.startsWith("Unlikely at pick"))) {
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
      row.breakdown.returnProbability < config.robustness.unlikelyReturn
    ) {
      if (!row.reasons.includes("Take now")) row.reasons.push("Take now");
    } else if (
      row.breakdown.returnProbability >= config.returnChip.minProbability &&
      row.breakdown.expectedPassLoss < config.canWaitPassLoss
    ) {
      if (!row.reasons.includes("Can wait")) row.reasons.push("Can wait");
    }
    if (row.breakdown.verdict === "too-close" && !row.reasons.includes("Too close")) {
      row.reasons.push("Too close");
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

function compareEffectiveUtility(left: Recommendation, right: Recommendation): number {
  const diff = right.dynamicScore - left.dynamicScore;
  if (diff !== 0) return diff;
  return right.player.vorp - left.player.vorp || left.player.modelRank - right.player.modelRank;
}

function samePositionPeer(
  row: Recommendation,
  scored: Recommendation[],
): Recommendation | undefined {
  if (row.player.pos === "K" || row.player.pos === "DST") return undefined;
  const same = scored.filter(
    (peer) => peer.player.pos === row.player.pos && peer.player.id !== row.player.id,
  );
  if (same.length === 0) return undefined;
  const closerBetter = same
    .filter((peer) => peer.player.modelPts > row.player.modelPts)
    .sort((left, right) => left.player.modelPts - right.player.modelPts)[0];
  if (closerBetter) return closerBetter;
  return [...same].sort((left, right) => right.player.modelPts - left.player.modelPts)[0];
}

/**
 * The realistic same-position fallback if you pass now: the best lower-projected
 * player at this position that is actually likely to still be available at your
 * next pick (§11.2 — expected later positional option, not merely the next name
 * down the projection list). Falls back to the next name if none look safe.
 */
function expectedLaterSamePosition(
  row: Recommendation,
  scored: Recommendation[],
  config: RecommendationConfig,
): Recommendation | undefined {
  if (row.player.pos === "K" || row.player.pos === "DST") return undefined;
  const lower = scored.filter(
    (peer) =>
      peer.player.pos === row.player.pos &&
      peer.player.id !== row.player.id &&
      peer.player.modelPts < row.player.modelPts,
  );
  if (lower.length === 0) return undefined;
  const likely = lower.filter(
    (peer) => peer.breakdown.returnProbability >= config.returnChip.minProbability,
  );
  const pool = likely.length > 0 ? likely : lower;
  return [...pool].sort(
    (left, right) => right.breakdown.rawUtility - left.breakdown.rawUtility,
  )[0];
}

function samePositionBreakdown(
  row: Recommendation,
  other: Recommendation,
  config: RecommendationConfig,
) {
  const directEdge = row.player.modelPts - other.player.modelPts;
  const netEdge = row.breakdown.rawUtility - other.breakdown.rawUtility;
  const winRate =
    pairedWinRate(row.breakdown.scenarioUtilities, other.breakdown.scenarioUtilities) ?? 0;
  return {
    otherPlayer: other.player.player,
    directEdge,
    continuationEdge: netEdge - directEdge,
    netEdge,
    winRate,
    verdict: classifyVerdict(netEdge, winRate, config),
  };
}

function annotateSamePositionComparisons(
  scored: Recommendation[],
  config: RecommendationConfig,
): void {
  for (const row of scored) {
    const peer = samePositionPeer(row, scored);
    if (peer) {
      row.breakdown.samePositionComparison = samePositionBreakdown(row, peer, config);
    }
  }

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
    const directEdge = behind.player.modelPts - ahead.player.modelPts;
    const netEdge = ahead.breakdown.rawUtility - behind.breakdown.rawUtility;
    const winRate =
      pairedWinRate(
        ahead.breakdown.scenarioUtilities,
        behind.breakdown.scenarioUtilities,
      ) ?? 0;
    if (
      !inversionIsAuthoritative(
        netEdge,
        netEdge + directEdge,
        directEdge,
        winRate,
        config,
      )
    ) {
      continue;
    }
    ahead.breakdown.samePositionInversion = {
      otherPlayer: behind.player.player,
      directEdge,
      continuationEdge: netEdge + directEdge,
      netEdge,
      winRate,
      verdict: classifyVerdict(netEdge, winRate, config),
    };
  }
}

function annotateAlternatives(
  scored: Recommendation[],
  config: RecommendationConfig,
): void {
  for (const row of scored) {
    const alternative =
      scored.find((peer) => peer.player.id !== row.player.id) ?? row;
    const raw = row.breakdown.rawUtility;
    const altRaw = alternative.breakdown.rawUtility;
    row.breakdown.alternativeUtility = alternative.breakdown.teamUtility;
    row.breakdown.alternativePlayer = alternative.player.player;
    row.breakdown.expectedGain = raw - altRaw;
    row.breakdown.continuationEffect =
      raw - altRaw - (row.player.modelPts - alternative.player.modelPts);
    row.breakdown.expectedPassLoss =
      (1 - row.breakdown.returnProbability) * Math.max(0, raw - altRaw);
    const laterSame = expectedLaterSamePosition(row, scored, config);
    row.breakdown.positionalPassLoss = laterSame
      ? (1 - row.breakdown.returnProbability) *
        Math.max(0, raw - laterSame.breakdown.rawUtility)
      : 0;
    const utilities = row.breakdown.scenarioUtilities ?? [];
    if (utilities.length > 0) {
      row.breakdown.utilityP25 = percentile(utilities, 0.25);
      row.breakdown.utilityP75 = percentile(utilities, 0.75);
    }
    row.breakdown.winsVsAlternative =
      pairedWinRate(
        row.breakdown.scenarioUtilities,
        alternative.breakdown.scenarioUtilities,
      ) ?? undefined;
    row.breakdown.verdict = classifyVerdict(
      row.breakdown.expectedGain,
      row.breakdown.winsVsAlternative ?? null,
      config,
    );
  }
}

interface SimulationSet {
  simulations: Map<string, CompletedSim>;
  upperBounds: Map<string, number>;
}

/**
 * Choose which candidates get a full rest-of-draft simulation (§7.2).
 *
 * Step 1 fully simulates a cheap-utility shortlist with positional coverage —
 * this reliably captures the actionable group. Step 2 is adaptive promotion: any
 * candidate the shortlist missed whose SOUND upper bound still reaches the
 * actionable full-simulation threshold is promoted (catching fallers), bounded
 * by a hard simulation cap so live ranking stays responsive.
 */
function selectSimulations(
  players: Player[],
  state: DraftState,
  eligible: Player[],
  roster: Player[],
  remainingUserPicks: number,
  currentOverallPick: number,
  config: RecommendationConfig,
): SimulationSet {
  const sortedAvailable = [...eligible].sort((a, b) => b.modelPts - a.modelPts);
  const upperBounds = new Map<string, number>();
  for (const player of eligible) {
    upperBounds.set(
      player.id,
      upperBoundUtility(roster, player, sortedAvailable, remainingUserPicks, config),
    );
  }

  const eligibleById = new Map(eligible.map((player) => [player.id, player]));
  const simulations = new Map<string, CompletedSim>();
  const runSim = (player: Player) =>
    simulations.set(player.id, simulateCandidateDraft(players, state, player, config));

  const shortlist = intrinsicLookaheadPool(
    eligible,
    roster,
    remainingUserPicks,
    currentOverallPick,
    config,
  );
  for (const id of shortlist) {
    const player = eligibleById.get(id);
    if (player) runSim(player);
  }

  const { actionableTopN, maxSimulations } = config.promotion;
  const actionableThreshold = (): number => {
    const utils = [...simulations.values()]
      .filter((sim) => sim.candidateLocked)
      .map((sim) => sim.utility.utility)
      .sort((a, b) => b - a);
    return utils[actionableTopN - 1] ?? Number.NEGATIVE_INFINITY;
  };

  const promotable = eligible
    .filter((player) => !simulations.has(player.id))
    .sort(
      (a, b) =>
        (upperBounds.get(b.id) ?? 0) - (upperBounds.get(a.id) ?? 0) ||
        a.modelRank - b.modelRank,
    );
  for (const player of promotable) {
    if (simulations.size >= maxSimulations) break;
    // Upper bounds are non-increasing here; once one cannot reach the actionable
    // threshold, none of the rest can either.
    if ((upperBounds.get(player.id) ?? 0) < actionableThreshold()) break;
    runSim(player);
  }

  return { simulations, upperBounds };
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

  const eligible = eligiblePlayers(
    players,
    state.picks,
    counts,
    currentOverallPick,
    config,
  );
  const remaining = remainingByPosTier(eligible);
  const sims = selectSimulations(
    players,
    state,
    eligible,
    roster,
    remainingUserPicks,
    currentOverallPick,
    config,
  );
  const lockedUtilities = [...sims.simulations.values()]
    .filter((sim) => sim.candidateLocked)
    .map((sim) => sim.utility.utility);
  const minSimUtility = lockedUtilities.length > 0 ? Math.min(...lockedUtilities) : 0;
  const maxUpperBound = Math.max(0, ...eligible.map((p) => sims.upperBounds.get(p.id) ?? 0));

  const scored: Recommendation[] = eligible.map((player) => {
    const leftInTier = remaining.get(`${player.pos}-${player.posTier}`) ?? 0;
    const starts = makesStartingLineup(roster, player);
    const sim = sims.simulations.get(player.id) ?? null;
    const simLocked = Boolean(
      sim?.candidateLocked && sim.roster.some((row) => row.id === player.id),
    );

    let team;
    let rankingScore: number;
    if (simLocked && sim) {
      team = sim.utility;
      rankingScore = team.utility;
    } else {
      // Approximate row: cheap one-step utility for the breakdown display, and a
      // ranking score placed just below every fully simulated row, ordered by
      // the candidate's upper bound. No arbitrary offset — the gap is derived
      // from the actual simulated scores, so no approximate row can outrank a
      // fully evaluated one without being promoted (§7.1/§7.2).
      team = completedTeamUtility(
        [...roster, player],
        Math.max(0, remainingUserPicks - 1),
        config,
      );
      const upper = sims.upperBounds.get(player.id) ?? 0;
      rankingScore = minSimUtility - config.promotion.approxMargin - (maxUpperBound - upper);
    }

    const returnChance = returnProbability(
      player,
      eligible,
      currentOverallPick,
      nextUser,
      { players, state, config },
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
      lookahead: simLocked,
      preSelectionStateHash: stateHash,
      candidateSecuredNow: player.player,
      directProjection: player.modelPts,
      continuationEffect: 0,
      expectedPassLoss: 0,
      positionalPassLoss: 0,
      rawUtility: rankingScore,
      waitPick: nextUser,
      laterPlayer: later?.player.player,
      laterPos: later?.player.pos,
      laterOverallPick: later?.overallPick,
      laterReturnProbability: later?.returnProbability,
      laterFallback: later?.fallbackPlayer?.player,
      laterQb: laterNote(sim?.laterQb),
      laterWr: laterNote(sim?.laterWr),
      laterTe: laterNote(sim?.laterTe),
      scenarioUtilities: sim?.scenarioUtilities,
    };

    return {
      player,
      dynamicScore: rankingScore,
      breakdown,
      reasons: collectReasons(
        player,
        leftInTier,
        currentOverallPick,
        returnChance,
        counts,
        starts,
        config,
      ),
    };
  });

  clampSamePositionUtilities(scored, config);
  scored.sort(compareEffectiveUtility);
  annotateAlternatives(scored, config);
  annotateSamePositionComparisons(scored, config);

  return addTimingReasons(
    addLikelyAvailableReasons(
      applyLivePins(scored, currentOverallPick, counts),
      currentOverallPick,
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
