import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { simulateCompletedDraft } from "./draftSim.ts";
import { bestQb, secureQbPool } from "./qb.ts";
import { draftedIds, myRosterPlayers, playersById } from "./roster.ts";

export type QbBranchVerdict = "qb-now" | "double-late" | "close";
export type QbBranchRisk = "low" | "medium" | "high";

export interface QbBranchSide {
  label: "QB now" | "Wait";
  starterPoints: number;
  adjustedPoints: number;
  ppw: number;
  qbs: Player[];
  firstPick: Player | null;
  risk: QbBranchRisk;
}

export interface QbBranchComparison {
  qbNow: QbBranchSide;
  wait: QbBranchSide;
  difference: number;
  ppwDifference: number;
  verdict: QbBranchVerdict;
  reason: string;
  riskLabel: string;
  doubleLateViable: boolean;
  allenException: boolean;
  securePool: number;
}

function riskFromPool(securePool: number, lateQbs: Player[]): QbBranchRisk {
  const fragileLate = lateQbs.some(
    (player) => player.qbStarterSecurity === "fragile" || player.qbStarterSecurity === "probable",
  );
  if (securePool <= 2 || fragileLate) return "high";
  if (securePool <= 5) return "medium";
  return "low";
}

function sideFromSim(
  label: QbBranchSide["label"],
  sim: ReturnType<typeof simulateCompletedDraft>,
  securePool: number,
  config: RecommendationConfig,
): QbBranchSide {
  return {
    label,
    starterPoints: sim.utility.starterProjection,
    adjustedPoints: sim.utility.utility,
    ppw: sim.utility.utility / config.branch.weeks,
    qbs: sim.roster.filter((player) => player.pos === "QB"),
    firstPick: sim.firstPick,
    risk: riskFromPool(securePool, sim.roster.filter((player) => player.pos === "QB")),
  };
}

export function compareQbBranches(
  players: Player[],
  state: DraftState,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): QbBranchComparison | null {
  const byId = playersById(players);
  const roster = myRosterPlayers(state.picks, byId);
  const qbCount = roster.filter((player) => player.pos === "QB").length;
  if (qbCount >= 2) return null;
  if (state.picks.length >= LEAGUE.teams * LEAGUE.rounds) return null;

  const taken = draftedIds(state.picks);
  const available = players.filter((player) => !taken.has(player.id));
  const secure = secureQbPool(available, config);
  const doubleLateViable = qbCount === 0 && secure.length >= 2;
  const nowQb = bestQb(available, config);
  const nowSim = simulateCompletedDraft(players, state, nowQb, config);
  const waitSim = simulateCompletedDraft(players, state, null, config, true);
  const qbNow = sideFromSim("QB now", nowSim, secure.length, config);
  const wait = sideFromSim("Wait", waitSim, secure.length, config);
  const difference = wait.adjustedPoints - qbNow.adjustedPoints;
  const ppwDifference = wait.ppw - qbNow.ppw;

  let verdict: QbBranchVerdict = "close";
  if (!doubleLateViable && qbCount === 0) {
    verdict = "qb-now";
  } else if (qbNow.ppw - wait.ppw >= config.branch.qbNowPpwLead) {
    verdict = "qb-now";
  } else if (doubleLateViable && ppwDifference >= config.branch.waitPpwLead) {
    verdict = "double-late";
  }

  const takenNowQb = nowSim.roster.find((player) => player.pos === "QB") ?? nowSim.firstPick;
  const waitQb = waitSim.roster.filter((player) => player.pos === "QB")[qbCount] ?? waitSim.roster.find((player) => player.pos === "QB");
  const waitSkill = waitSim.firstPick?.pos === "QB" ? null : waitSim.firstPick;
  const qbPtsDiff = (takenNowQb?.modelPts ?? 0) - (waitQb?.modelPts ?? 0);

  let reason: string;
  if (verdict === "double-late") {
    reason = `You can still wait on QBs: ${secure.length} safe starters remain. Use your next pick on a skill player.`;
  } else if (verdict === "close") {
    reason =
      "The two QB plans are within about a point per week. Follow the ranking below.";
  } else if (takenNowQb && waitSkill && qbPtsDiff > 0) {
    reason = `Taking ${takenNowQb.player} now likely means missing ${waitSkill.player}, but that QB is projected ${qbPtsDiff.toFixed(1)} points better than the late QB this sim expects.`;
  } else if (!doubleLateViable && qbCount === 0) {
    reason = "Not enough safe starting QBs are left to wait — take one with your next pick.";
  } else {
    reason = "Taking a QB with your next pick projects a stronger completed team.";
  }

  const risk = wait.risk === "high" ? "high" : qbNow.risk;
  const riskLabel =
    risk === "high"
      ? "Risky — waiting only works if a real starter is still there late."
      : risk === "medium"
        ? "Caution — fewer safe QBs are left."
        : "Comfortable — several safe starting QBs remain.";

  return {
    qbNow,
    wait,
    difference,
    ppwDifference,
    verdict,
    reason,
    riskLabel,
    doubleLateViable,
    allenException: false,
    securePool: secure.length,
  };
}

export function forcedQbOverallPick(overallPick: number, qbCount: number): boolean {
  if (qbCount >= 2) return false;
  if (overallPick === 174) return true;
  if (overallPick === 163 && qbCount === 0) return true;
  return false;
}
