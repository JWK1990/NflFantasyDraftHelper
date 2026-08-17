import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { starterPoints } from "./lineup.ts";
import { bestQb, qbJobSecurityPenalty, secureQbPool } from "./qb.ts";
import { draftedIds, myRosterPlayers, playersById } from "./roster.ts";
import { roundForPick, upcomingUserPick, userPickSchedule } from "./snake.ts";

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

type Strategy = "qb-now" | "wait";

function adpKey(player: Player): number {
  return player.adp ?? 900 + player.modelRank;
}

function skillNeedRank(player: Player, roster: Player[]): number {
  const rbs = roster.filter((row) => row.pos === "RB").length;
  const wrs = roster.filter((row) => row.pos === "WR").length;
  const tes = roster.filter((row) => row.pos === "TE").length;
  if (player.pos === "RB" && rbs < 2) return 0;
  if (player.pos === "WR" && wrs < 2) return 0;
  if (player.pos === "TE" && tes < 1) return 0;
  return 1;
}

function takeSkillOrSpecial(available: Player[], roster: Player[], overallPick: number): Player | null {
  const round = roundForPick(overallPick);
  const kickers = available.filter((player) => player.pos === "K");
  const dst = available.filter((player) => player.pos === "DST");
  const hasK = roster.some((player) => player.pos === "K");
  const hasDst = roster.some((player) => player.pos === "DST");
  if (round >= 12 && !hasK && kickers[0]) {
    return kickers.sort((a, b) => a.modelRank - b.modelRank)[0] ?? null;
  }
  if (round >= 12 && !hasDst && dst[0]) {
    return dst.sort((a, b) => a.modelRank - b.modelRank)[0] ?? null;
  }
  const skill = available.filter(
    (player) => player.pos === "RB" || player.pos === "WR" || player.pos === "TE",
  );
  skill.sort(
    (a, b) => skillNeedRank(a, roster) - skillNeedRank(b, roster) || a.modelRank - b.modelRank,
  );
  return skill[0] ?? null;
}

function removePlayer(available: Player[], playerId: string): Player[] {
  return available.filter((player) => player.id !== playerId);
}

function chooseUserPlayer(
  available: Player[],
  roster: Player[],
  overallPick: number,
  strategy: Strategy,
  isOpeningUserPick: boolean,
): Player | null {
  const qbCount = roster.filter((player) => player.pos === "QB").length;
  const is163 = overallPick === 163;
  const is174 = overallPick === 174;

  if (strategy === "qb-now") {
    if (isOpeningUserPick && qbCount < 2) return bestQb(available);
    if (is174 && qbCount < 2) return bestQb(available);
    return takeSkillOrSpecial(available, roster, overallPick);
  }

  if ((is163 && qbCount === 0) || (is174 && qbCount < 2)) {
    return bestQb(available);
  }
  return takeSkillOrSpecial(available, roster, overallPick);
}

function chooseOpponentPlayer(
  available: Player[],
  otherQbs: number,
  cap: number,
): Player | null {
  const ordered = [...available].sort((a, b) => adpKey(a) - adpKey(b) || a.modelRank - b.modelRank);
  for (const player of ordered) {
    if (player.pos === "QB" && otherQbs >= cap) continue;
    return player;
  }
  return ordered[0] ?? null;
}

function simulateBranch(
  players: Player[],
  state: DraftState,
  strategy: Strategy,
  config: RecommendationConfig,
): { roster: Player[]; firstPick: Player | null; qbs: Player[] } {
  const byId = playersById(players);
  const taken = draftedIds(state.picks);
  let available = players.filter((player) => !taken.has(player.id));
  const roster = [...myRosterPlayers(state.picks, byId)];
  let otherQbs = state.picks.filter((pick) => {
    if (pick.draftedBy !== "other") return false;
    return byId.get(pick.playerId)?.pos === "QB";
  }).length;

  const userPicks = new Set(userPickSchedule());
  const start = state.picks.length + 1;
  const last = LEAGUE.teams * LEAGUE.rounds;
  let firstPick: Player | null = null;

  for (let overall = start; overall <= last; overall += 1) {
    const isUser = userPicks.has(overall);
    const pick: Player | null = isUser
      ? roster.length >= LEAGUE.rosterSize
        ? null
        : chooseUserPlayer(available, roster, overall, strategy, firstPick == null)
      : chooseOpponentPlayer(available, otherQbs, config.branch.opponentQbCap);
    if (!pick) continue;
    available = removePlayer(available, pick.id);
    if (isUser) {
      roster.push(pick);
      if (!firstPick) firstPick = pick;
    } else if (pick.pos === "QB") {
      otherQbs += 1;
    }
  }

  return {
    roster,
    firstPick,
    qbs: roster.filter((player) => player.pos === "QB"),
  };
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
  sim: { roster: Player[]; firstPick: Player | null; qbs: Player[] },
  securePool: number,
  config: RecommendationConfig,
): QbBranchSide {
  const raw = starterPoints(sim.roster);
  const penalty = sim.qbs.reduce((sum, qb) => sum + qbJobSecurityPenalty(qb, config), 0);
  const adjusted = raw - penalty;
  return {
    label,
    starterPoints: raw,
    adjustedPoints: adjusted,
    ppw: adjusted / config.branch.weeks,
    qbs: sim.qbs,
    firstPick: sim.firstPick,
    risk: riskFromPool(securePool, sim.qbs),
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
  const allen = available.find((player) => player.player === "Josh Allen");
  const nextUser = upcomingUserPick(state.picks.length + 1);
  const allenException = Boolean(allen && nextUser === 6);

  const nowSim = simulateBranch(players, state, "qb-now", config);
  const waitSim = simulateBranch(players, state, "wait", config);
  const qbNow = sideFromSim("QB now", nowSim, secure.length, config);
  const wait = sideFromSim("Wait", waitSim, secure.length, config);
  const difference = wait.adjustedPoints - qbNow.adjustedPoints;
  const ppwDifference = wait.ppw - qbNow.ppw;

  let verdict: QbBranchVerdict = "close";
  if (allenException) {
    verdict = "qb-now";
  } else if (!doubleLateViable && qbCount === 0) {
    verdict = "qb-now";
  } else if (qbNow.ppw - wait.ppw >= config.branch.qbNowPpwLead) {
    verdict = "qb-now";
  } else if (doubleLateViable && ppwDifference >= config.branch.waitPpwLead) {
    verdict = "double-late";
  }

  const nowQb = nowSim.qbs[qbCount] ?? nowSim.firstPick;
  const waitQb = waitSim.qbs[qbCount] ?? waitSim.qbs[0];
  const waitSkill = waitSim.firstPick?.pos === "QB" ? null : waitSim.firstPick;
  const qbPtsDiff =
    (nowQb?.modelPts ?? 0) - (waitQb?.modelPts ?? 0);

  let reason: string;
  if (allenException) {
    reason = "Josh Allen is still there at 1.06 — take him with this pick.";
  } else if (verdict === "double-late") {
    reason = `You can still wait on QBs: ${secure.length} safe starters remain. Use your next pick on a skill player.`;
  } else if (verdict === "close") {
    reason =
      "The two QB plans are within about a point per week. Follow the ranking below — who is last in a tier, and who will not last until you pick again. If you are unsure, take a QB sooner rather than later.";
  } else if (nowQb && waitSkill && qbPtsDiff > 0) {
    reason = `Taking ${nowQb.player} now likely means missing ${waitSkill.player}, but that QB is projected ${qbPtsDiff.toFixed(1)} points better than the late QB this sim expects.`;
  } else if (!doubleLateViable && qbCount === 0) {
    reason = "Not enough safe starting QBs are left to wait — take one with your next pick.";
  } else {
    reason = "Taking a QB with your next pick projects a stronger starting lineup.";
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
    allenException,
    securePool: secure.length,
  };
}

export function forcedQbOverallPick(overallPick: number, qbCount: number): boolean {
  if (qbCount >= 2) return false;
  if (overallPick === 174) return true;
  if (overallPick === 163 && qbCount === 0) return true;
  return false;
}
