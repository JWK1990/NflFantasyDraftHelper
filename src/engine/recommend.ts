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
import { makesStartingLineup } from "./lineup.ts";
import { isAcceptableQb, hasRiskTag } from "./qb.ts";
import { compareQbBranches, forcedQbOverallPick, type QbBranchComparison } from "./qbBranch.ts";
import {
  intrinsicLookaheadPool,
  returnProbability,
  simulateCompletedDraft,
} from "./draftSim.ts";
import { completedTeamUtility } from "./teamUtility.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { remainingByPosTier, tierCliffDrop } from "./tierScarcity.ts";
import {
  formatPickLabel,
  nextUserPickAfter,
  userPickSchedule,
} from "./snake.ts";
import { likelyGoneByNextTurn, vonaForCandidate } from "./vona.ts";
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
  vonaUrgency: number,
  cliffDrop: number,
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
    const cliff = cliffDrop >= config.coverage.cliffVorp;
    const strongVona = vonaUrgency >= config.qb.qb2VonaThreshold;
    const shrinking = acceptableLeft <= config.qb.shrinkingPoolThreshold;
    if (cliff) reasons.push("QB2 tier cliff");
    else if (strongVona) reasons.push("QB2 value now");
    else if (shrinking) {
      reasons.push(`Starter pool shrinking (${acceptableLeft} left)`);
    } else {
      reasons.push(`QB2 can wait; ${similar} similar options remain`);
    }
  }

  if (hasRiskTag(player) || player.qbStarterSecurity === "fragile") {
    reasons.push("Risky starter job");
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
  cliffDrop: number,
  leftInTier: number,
  currentOverallPick: number,
  likelyGone: Set<string>,
  vonaUrgency: number,
  counts: RosterCounts,
  starts: boolean,
): string[] {
  const reasons: string[] = [];
  if (leftInTier === 1 && cliffDrop > 0) {
    reasons.push(`Last in ${player.pos} T${player.posTier}`);
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
      reasons.push(`unlikely to be available at ${formatPickLabel(next)}`);
    }
  }
  if (vonaUrgency >= 6) {
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
  const remainingUserPicks = Math.max(0, LEAGUE.rosterSize - counts.total);
  const nextUser = nextUserPickAfter(currentOverallPick);
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
    config,
  );

  const scored: Recommendation[] = eligible.map((player) => {
    const leftInTier = remaining.get(`${player.pos}-${player.posTier}`) ?? 0;
    const cliffDrop = tierCliffDrop(player, eligible);
    const vonaUrgency = vonaForCandidate(player, eligible, likelyGone, config);
    const qbReasons = qbReasonChips(
      player,
      counts,
      eligible,
      vonaUrgency,
      cliffDrop,
      currentOverallPick,
      state.qb2Mode,
      branch,
      config,
    );
    const starts = makesStartingLineup(roster, player, null);
    const fullLookahead = lookahead.has(player.id);
    const sim = fullLookahead
      ? simulateCompletedDraft(players, state, player, config)
      : null;
    const cheap = completedTeamUtility(
      [...roster, player],
      Math.max(0, remainingUserPicks - 1),
      config,
    );
    const team = sim?.utility ?? cheap;
    const returnChance = returnProbability(
      player,
      eligible,
      currentOverallPick,
      nextUser,
    );

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
    };

    return {
      player,
      dynamicScore: fullLookahead ? team.utility : team.utility - 4000,
      breakdown,
      reasons: collectReasons(
        player,
        qbReasons,
        cliffDrop,
        leftInTier,
        currentOverallPick,
        likelyGone,
        vonaUrgency,
        counts,
        starts,
      ),
    };
  });

  scored.sort((a, b) => {
    if (b.dynamicScore !== a.dynamicScore) return b.dynamicScore - a.dynamicScore;
    return b.player.vorp - a.player.vorp || a.player.modelRank - b.player.modelRank;
  });

  const bestUtility = scored[0]?.dynamicScore ?? 0;
  const alternativeUtility = scored[1]?.dynamicScore ?? bestUtility;
  for (const row of scored) {
    row.breakdown.alternativeUtility =
      row.player.id === scored[0]?.player.id ? alternativeUtility : bestUtility;
    row.breakdown.expectedGain =
      row.dynamicScore - row.breakdown.alternativeUtility;
  }

  if (forcedQbOverallPick(currentOverallPick, counts.QB)) {
    const forced = scored
      .filter((row) => row.player.pos === "QB")
      .sort((a, b) => b.player.modelPts - a.player.modelPts)[0];
    if (forced) {
      const rest = scored.filter((row) => row.player.id !== forced.player.id);
      return [forced, ...rest];
    }
  }

  if (
    branch?.verdict === "qb-now" &&
    branch.qbNow.firstPick &&
    scored[0] &&
    scored[0].player.id !== branch.qbNow.firstPick.id
  ) {
    scored[0].reasons.unshift(
      `List prefers this over ${branch.qbNow.firstPick.player} because the completed-team projection is higher.`,
    );
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
