import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftState, Player, Qb2Mode } from "../domain/types.ts";
import { completedTeamUtility, type TeamUtility } from "./teamUtility.ts";
import { bestQb } from "./qb.ts";
import { draftedIds, myRosterPlayers, playersById } from "./roster.ts";
import { roundForPick, slotForPick, userPickSchedule } from "./snake.ts";

export function adpSortValue(player: Player): number {
  return player.adp ?? 900 + player.posRank;
}

function byAdp(a: Player, b: Player): number {
  return adpSortValue(a) - adpSortValue(b) || b.modelPts - a.modelPts;
}

export function qbCountsBySlot(
  picks: DraftState["picks"],
  byId: Map<string, Player>,
): number[] {
  const counts = Array.from({ length: LEAGUE.teams + 1 }, () => 0);
  for (const pick of picks) {
    const player = byId.get(pick.playerId);
    if (player?.pos !== "QB") continue;
    counts[slotForPick(pick.overallPick)] += 1;
  }
  return counts;
}

function removePlayer(available: Player[], playerId: string): Player[] {
  return available.filter((player) => player.id !== playerId);
}

function rosterHas(roster: Player[], pos: Player["pos"]): boolean {
  return roster.some((player) => player.pos === pos);
}

function countPos(roster: Player[], pos: Player["pos"]): number {
  return roster.filter((player) => player.pos === pos).length;
}

function simEligible(available: Player[], roster: Player[]): Player[] {
  return available.filter((player) => {
    if (roster.length >= LEAGUE.rosterSize) return false;
    if (countPos(roster, player.pos) >= LEAGUE.hardCaps[player.pos]) return false;
    if (player.pos === "K" && rosterHas(roster, "K")) return false;
    if (player.pos === "DST" && rosterHas(roster, "DST")) return false;
    return true;
  });
}

function chooseOpponentPlayer(
  available: Player[],
  slot: number,
  qbBySlot: number[],
  cap: number,
): Player | null {
  for (const player of available) {
    if (player.pos === "QB" && qbBySlot[slot] >= cap) continue;
    return player;
  }
  return available[0] ?? null;
}

function greedyPool(eligible: Player[], roster: Player[]): Player[] {
  const rbs = countPos(roster, "RB");
  const wrs = countPos(roster, "WR");
  const tes = countPos(roster, "TE");
  const qbs = countPos(roster, "QB");
  const fillers = eligible.filter((player) => {
    if (player.pos === "RB" && rbs < 2) return true;
    if (player.pos === "WR" && wrs < 2) return true;
    if (player.pos === "TE" && tes < 1) return true;
    if (player.pos === "QB" && qbs < 1) return true;
    return false;
  });
  fillers.sort((a, b) => b.modelPts - a.modelPts);
  const rest = eligible
    .filter((player) => !fillers.some((row) => row.id === player.id))
    .sort((a, b) => b.modelPts - a.modelPts);
  const pooled = [...fillers.slice(0, 8), ...rest.slice(0, 8)];
  const seen = new Set<string>();
  return pooled.filter((player) => {
    if (seen.has(player.id)) return false;
    seen.add(player.id);
    return true;
  });
}

export function chooseGreedyUserPlayer(
  available: Player[],
  roster: Player[],
  overallPick: number,
  qb2Mode: Qb2Mode,
  config: RecommendationConfig,
): Player | null {
  if (roster.length >= LEAGUE.rosterSize) return null;
  let eligible = simEligible(available, roster);
  if (eligible.length === 0) return null;

  const qbCount = countPos(roster, "QB");
  if ((overallPick === 163 && qbCount === 0) || (overallPick === 174 && qbCount < 2)) {
    return bestQb(eligible, config) ?? eligible[0] ?? null;
  }

  const remaining = LEAGUE.rosterSize - roster.length;
  const needK = !rosterHas(roster, "K");
  const needDst = !rosterHas(roster, "DST");
  const specials = Number(needK) + Number(needDst);
  const round = roundForPick(overallPick);
  if (specials > 0 && (round >= 12 || remaining <= specials)) {
    if (needK) {
      const kicker = eligible
        .filter((player) => player.pos === "K")
        .sort((a, b) => a.posRank - b.posRank)[0];
      if (kicker) return kicker;
    }
    if (needDst) {
      const dst = eligible
        .filter((player) => player.pos === "DST")
        .sort((a, b) => a.posRank - b.posRank)[0];
      if (dst) return dst;
    }
  }

  if (qb2Mode === "adaptive-punt" && qbCount >= 1 && overallPick !== 174) {
    eligible = eligible.filter((player) => player.pos !== "QB");
    if (eligible.length === 0) eligible = simEligible(available, roster);
  }

  const skill = eligible.filter((player) => player.pos !== "K" && player.pos !== "DST");
  const pool = greedyPool(skill.length > 0 ? skill : eligible, roster);
  if (pool.length === 0) return eligible[0] ?? null;

  const remainingAfter = Math.max(0, remaining - 1);
  let best = pool[0];
  let bestUtility = Number.NEGATIVE_INFINITY;
  for (const player of pool) {
    const utility = completedTeamUtility([...roster, player], remainingAfter, config).utility;
    if (utility > bestUtility) {
      bestUtility = utility;
      best = player;
    }
  }
  return best ?? null;
}

export interface CompletedSim {
  roster: Player[];
  firstPick: Player | null;
  utility: TeamUtility;
}

export function simulateCompletedDraft(
  players: Player[],
  state: DraftState,
  openingUserPick: Player | null,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
  waitOnQb = false,
): CompletedSim {
  const byId = playersById(players);
  const taken = draftedIds(state.picks);
  let available = players.filter((player) => !taken.has(player.id)).sort(byAdp);
  const roster = [...myRosterPlayers(state.picks, byId)];
  const qbBySlot = qbCountsBySlot(state.picks, byId);
  const userPicks = new Set(userPickSchedule());
  const start = state.picks.length + 1;
  const last = LEAGUE.teams * LEAGUE.rounds;
  let firstPick: Player | null = null;
  const cap = config.branch.opponentQbCap;

  for (let overall = start; overall <= last; overall += 1) {
    const isUser = userPicks.has(overall);
    let pick: Player | null = null;
    if (isUser) {
      if (roster.length >= LEAGUE.rosterSize) continue;
      const qbCount = countPos(roster, "QB");
      const forceQb =
        (overall === 163 && qbCount === 0) || (overall === 174 && qbCount < 2);
      const pool =
        waitOnQb && !forceQb
          ? available.filter((player) => player.pos !== "QB")
          : available;
      if (firstPick == null && openingUserPick) {
        pick =
          available.find((player) => player.id === openingUserPick.id) ??
          (openingUserPick.pos === "QB" ? bestQb(pool.length > 0 ? pool : available, config) : null);
        if (!pick) {
          pick = chooseGreedyUserPlayer(
            pool.length > 0 ? pool : available,
            roster,
            overall,
            state.qb2Mode,
            config,
          );
        }
      } else {
        pick = chooseGreedyUserPlayer(
          pool.length > 0 ? pool : available,
          roster,
          overall,
          state.qb2Mode,
          config,
        );
      }
    } else {
      pick = chooseOpponentPlayer(available, slotForPick(overall), qbBySlot, cap);
    }
    if (!pick) continue;
    available = removePlayer(available, pick.id);
    if (isUser) {
      roster.push(pick);
      if (!firstPick) firstPick = pick;
    } else if (pick.pos === "QB") {
      qbBySlot[slotForPick(overall)] += 1;
    }
  }

  const remaining = Math.max(0, LEAGUE.rosterSize - roster.length);
  return {
    roster,
    firstPick,
    utility: completedTeamUtility(roster, remaining, config),
  };
}

export function returnProbability(
  player: Player,
  available: Player[],
  currentOverallPick: number,
  nextUserPick: number | null,
): number {
  if (nextUserPick == null) return 0;
  const intervening = Math.max(0, nextUserPick - currentOverallPick - 1);
  const ordered = [...available].sort(byAdp);
  const index = ordered.findIndex((row) => row.id === player.id);
  if (index < 0) return 0;
  if (index < intervening) {
    return Math.max(0.04, 0.18 - (intervening - 1 - index) * 0.012);
  }
  return Math.min(0.94, 0.52 + (index - intervening) * 0.025);
}

export function intrinsicLookaheadPool(
  eligible: Player[],
  roster: Player[],
  remainingUserPicks: number,
  config: RecommendationConfig,
): Set<string> {
  const scored = eligible
    .filter((player) => player.pos !== "K" && player.pos !== "DST")
    .map((player) => ({
      id: player.id,
      utility: completedTeamUtility(
        [...roster, player],
        Math.max(0, remainingUserPicks - 1),
        config,
      ).utility,
    }))
    .sort((a, b) => b.utility - a.utility);

  const ids = new Set(scored.slice(0, config.lookaheadTopN).map((row) => row.id));
  const qbNeed = roster.filter((player) => player.pos === "QB").length < 2;
  if (qbNeed) {
    eligible
      .filter((player) => player.pos === "QB")
      .sort((a, b) => b.modelPts - a.modelPts)
      .slice(0, 8)
      .forEach((player) => ids.add(player.id));
  }
  return ids;
}
