import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftState, Player, Position } from "../domain/types.ts";
import { completedTeamUtility, type TeamUtility } from "./teamUtility.ts";
import { lateRoundReservation } from "./lateRound.ts";
import { bestQb } from "./qb.ts";
import { draftedIds, myRosterPlayers, playersById } from "./roster.ts";
import {
  isUserPick,
  roundForPick,
  slotForPick,
  upcomingUserPick,
  userPickSchedule,
} from "./snake.ts";

export type QbSimPolicy = "flex" | "punt" | "qb-next";

export interface SimAcquisition {
  player: Player;
  overallPick: number;
}

export interface SimulateExtras {
  qbPolicy?: QbSimPolicy;
  protectUntilPick?: { playerId: string; overallPick: number };
  forcePick?: { playerId: string; overallPick: number };
  removeIds?: Iterable<string>;
}

export interface LaterAcquisition {
  player: Player;
  overallPick: number;
  returnProbability: number;
  fallbackPlayer: Player | null;
  qbPolicy: QbSimPolicy;
}

export function adpSortValue(player: Player): number {
  return player.adp ?? 900 + player.posRank;
}

export function compareByAdp(a: Player, b: Player): number {
  return adpSortValue(a) - adpSortValue(b) || b.modelPts - a.modelPts;
}

export function opponentPicksBetween(startPick: number, endPick: number): number {
  let count = 0;
  for (let overall = startPick + 1; overall < endPick; overall += 1) {
    if (!isUserPick(overall)) count += 1;
  }
  return count;
}

export function adpWindowIds(
  available: Player[],
  count: number,
  reservedId: string | null = null,
): Set<string> {
  const ids = new Set<string>();
  if (count <= 0) return ids;
  for (const player of [...available].sort(compareByAdp)) {
    if (player.id === reservedId) continue;
    ids.add(player.id);
    if (ids.size >= count) break;
  }
  return ids;
}

function byAdp(a: Player, b: Player): number {
  return compareByAdp(a, b);
}

function slotPosCounts(
  picks: DraftState["picks"],
  byId: Map<string, Player>,
  pos: Player["pos"],
): number[] {
  const counts = Array.from({ length: LEAGUE.teams + 1 }, () => 0);
  for (const pick of picks) {
    const player = byId.get(pick.playerId);
    if (player?.pos !== pos) continue;
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

function bestByPos(eligible: Player[], pos: Position): Player | null {
  return (
    eligible
      .filter((player) => player.pos === pos)
      .sort((a, b) => a.posRank - b.posRank || b.modelPts - a.modelPts)[0] ?? null
  );
}

function chooseOpponentPlayer(
  available: Player[],
  overallPick: number,
  slot: number,
  qbBySlot: number[],
  kBySlot: number[],
  dstBySlot: number[],
  cap: number,
): Player | null {
  const round = roundForPick(overallPick);
  const remainingRounds = LEAGUE.rounds - round + 1;
  const needK = kBySlot[slot] === 0;
  const needDst = dstBySlot[slot] === 0;
  const specialsNeeded = Number(needK) + Number(needDst);
  const takeSpecials =
    specialsNeeded > 0 && (round >= 13 || remainingRounds <= specialsNeeded);

  if (takeSpecials) {
    if (needK) {
      const kicker = bestByPos(available, "K");
      if (kicker) return kicker;
    }
    if (needDst) {
      const dst = bestByPos(available, "DST");
      if (dst) return dst;
    }
  }

  for (const player of available) {
    if (player.pos === "QB" && qbBySlot[slot] >= cap) continue;
    if (player.pos === "K" && (kBySlot[slot] >= 1 || round < 13)) continue;
    if (player.pos === "DST" && (dstBySlot[slot] >= 1 || round < 13)) continue;
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
  config: RecommendationConfig,
  qbPolicy: QbSimPolicy = "flex",
): Player | null {
  if (roster.length >= LEAGUE.rosterSize) return null;
  let eligible = simEligible(available, roster);
  if (eligible.length === 0) return null;

  const qbCount = countPos(roster, "QB");
  const hasK = rosterHas(roster, "K");
  const hasDst = rosterHas(roster, "DST");
  const reserved = lateRoundReservation(overallPick, qbCount, hasK, hasDst);
  if (reserved === "QB") {
    return bestQb(eligible, config) ?? eligible[0] ?? null;
  }
  if (reserved === "K") {
    return bestByPos(eligible, "K") ?? eligible[0] ?? null;
  }
  if (reserved === "DST") {
    return bestByPos(eligible, "DST") ?? eligible[0] ?? null;
  }

  const remaining = LEAGUE.rosterSize - roster.length;
  const specials = Number(!hasK) + Number(!hasDst);
  if (specials > 0 && remaining <= specials) {
    if (!hasK) {
      const kicker = bestByPos(eligible, "K");
      if (kicker) return kicker;
    }
    if (!hasDst) {
      const dst = bestByPos(eligible, "DST");
      if (dst) return dst;
    }
  }

  if (qbPolicy === "punt" && qbCount >= 1 && overallPick !== 174) {
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
  qbBySlot: number[];
  kBySlot: number[];
  dstBySlot: number[];
  candidateLocked: boolean;
  acquisitions: SimAcquisition[];
  qbPolicy: QbSimPolicy;
  laterAcquisition: LaterAcquisition | null;
}

function poolWithoutReserved(
  available: Player[],
  reservedId: string | null,
): Player[] {
  if (reservedId == null) return available;
  return available.filter((player) => player.id !== reservedId);
}

function mixUtility(a: TeamUtility, b: TeamUtility, weight: number): TeamUtility {
  const mix = (left: number, right: number) => weight * left + (1 - weight) * right;
  return {
    starterProjection: mix(a.starterProjection, b.starterProjection),
    benchValue: mix(a.benchValue, b.benchValue),
    upsideAdjustment: mix(a.upsideAdjustment, b.upsideAdjustment),
    riskAdjustment: mix(a.riskAdjustment, b.riskAdjustment),
    slotPenalty: mix(a.slotPenalty, b.slotPenalty),
    utility: mix(a.utility, b.utility),
  };
}

export function simulateCompletedDraft(
  players: Player[],
  state: DraftState,
  openingUserPick: Player | null,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
  waitOnQb = false,
  extras: SimulateExtras = {},
): CompletedSim {
  const byId = playersById(players);
  const taken = draftedIds(state.picks);
  const remove = new Set(extras.removeIds ?? []);
  let available = players
    .filter((player) => !taken.has(player.id) && !remove.has(player.id))
    .sort(byAdp);
  const roster = [...myRosterPlayers(state.picks, byId)];
  const qbBySlot = slotPosCounts(state.picks, byId, "QB");
  const kBySlot = slotPosCounts(state.picks, byId, "K");
  const dstBySlot = slotPosCounts(state.picks, byId, "DST");
  const userPicks = new Set(userPickSchedule());
  const start = state.picks.length + 1;
  const last = LEAGUE.teams * LEAGUE.rounds;
  const reservedId = openingUserPick?.id ?? null;
  const decisionPick = reservedId == null ? null : upcomingUserPick(start);
  const qbPolicy = extras.qbPolicy ?? (waitOnQb ? "punt" : "flex");
  const protect = extras.protectUntilPick;
  const forcePick = extras.forcePick;
  let firstPick: Player | null = null;
  let candidateLocked = reservedId == null;
  let tookQbNext = false;
  let consumeIds: Set<string> | null = null;
  const acquisitions: SimAcquisition[] = [];
  const cap = config.branch.opponentQbCap;

  for (let overall = start; overall <= last; overall += 1) {
    const isUser = userPicks.has(overall);
    const slot = slotForPick(overall);
    const stillReserved = reservedId != null && firstPick == null;
    const protectNow =
      protect != null && overall < protect.overallPick ? protect.playerId : null;
    let pick: Player | null = null;
    if (isUser) {
      if (roster.length >= LEAGUE.rosterSize) {
        consumeIds = null;
        continue;
      }
      const shouldLock =
        reservedId != null &&
        firstPick == null &&
        decisionPick != null &&
        overall === decisionPick;
      const blocked = consumeIds ?? new Set<string>();
      const userPool = shouldLock
        ? available
        : available.filter(
            (player) =>
              player.id === reservedId ||
              player.id === forcePick?.playerId ||
              !blocked.has(player.id),
          );
      if (shouldLock) {
        pick = available.find((player) => player.id === reservedId) ?? null;
        if (!pick) {
          break;
        }
        candidateLocked = true;
      } else if (
        forcePick != null &&
        overall === forcePick.overallPick &&
        available.some((player) => player.id === forcePick.playerId)
      ) {
        pick = available.find((player) => player.id === forcePick.playerId) ?? null;
      } else {
        const qbCount = countPos(roster, "QB");
        const reserved = lateRoundReservation(
          overall,
          qbCount,
          rosterHas(roster, "K"),
          rosterHas(roster, "DST"),
        );
        const takeQbNext =
          qbPolicy === "qb-next" &&
          !tookQbNext &&
          qbCount < 2 &&
          reserved == null;
        if (takeQbNext) {
          pick = bestQb(userPool.length > 0 ? userPool : available, config);
          tookQbNext = true;
        } else {
          const qbCountNow = countPos(roster, "QB");
          const forceQb =
            lateRoundReservation(
              overall,
              qbCountNow,
              rosterHas(roster, "K"),
              rosterHas(roster, "DST"),
            ) === "QB";
          const waitPool =
            waitOnQb && !forceQb
              ? (userPool.length > 0 ? userPool : available).filter(
                  (player) => player.pos !== "QB",
                )
              : userPool.length > 0
                ? userPool
                : available;
          pick = chooseGreedyUserPlayer(
            waitPool.length > 0 ? waitPool : available,
            roster,
            overall,
            config,
            waitOnQb ? "flex" : qbPolicy,
          );
        }
      }
      consumeIds = null;
    } else {
      if (consumeIds == null) {
        const nextUser = upcomingUserPick(overall);
        const remainingOpponents =
          nextUser == null ? 0 : opponentPicksBetween(overall - 1, nextUser);
        consumeIds = adpWindowIds(
          available,
          remainingOpponents,
          stillReserved ? reservedId : null,
        );
        if (protectNow) consumeIds.delete(protectNow);
      }
      const opponentPool = stillReserved
        ? poolWithoutReserved(available, reservedId)
        : available;
      const protectedPool = protectNow
        ? opponentPool.filter((player) => player.id !== protectNow)
        : opponentPool;
      pick = chooseOpponentPlayer(
        protectedPool.length > 0 ? protectedPool : opponentPool,
        overall,
        slot,
        qbBySlot,
        kBySlot,
        dstBySlot,
        cap,
      );
    }
    if (!pick) continue;
    available = removePlayer(available, pick.id);
    if (pick.pos === "QB") qbBySlot[slot] += 1;
    if (pick.pos === "K") kBySlot[slot] += 1;
    if (pick.pos === "DST") dstBySlot[slot] += 1;
    if (isUser) {
      roster.push(pick);
      acquisitions.push({ player: pick, overallPick: overall });
      if (!firstPick) firstPick = pick;
    }
  }

  if (reservedId != null) {
    candidateLocked = roster.some((player) => player.id === reservedId);
  }

  const remaining = Math.max(0, LEAGUE.rosterSize - roster.length);
  return {
    roster,
    firstPick,
    utility: completedTeamUtility(roster, remaining, config),
    qbBySlot,
    kBySlot,
    dstBySlot,
    candidateLocked,
    acquisitions,
    qbPolicy,
    laterAcquisition: null,
  };
}

export function returnProbability(
  player: Player,
  available: Player[],
  currentOverallPick: number,
  nextUserPick: number | null,
): number {
  if (nextUserPick == null) return 0;
  const intervening = opponentPicksBetween(currentOverallPick, nextUserPick);
  const ordered = [...available].sort(byAdp);
  const index = ordered.findIndex((row) => row.id === player.id);
  if (index < 0) return 0;
  if (intervening <= 0) return 1;
  if (index < intervening) {
    return Math.max(0.04, 0.18 - (intervening - 1 - index) * 0.012);
  }
  return Math.min(0.94, 0.52 + (index - intervening) * 0.025);
}

function laterFromSim(sim: CompletedSim, candidate: Player): SimAcquisition | null {
  const rest = sim.acquisitions.filter((row) => row.player.id !== candidate.id);
  if (candidate.pos === "QB") {
    return (
      rest.find((row) => row.player.pos === "WR") ??
      rest.find(
        (row) =>
          row.player.pos !== "QB" &&
          row.player.pos !== "K" &&
          row.player.pos !== "DST",
      ) ??
      rest[0] ??
      null
    );
  }
  return rest.find((row) => row.player.pos === "QB") ?? rest[0] ?? null;
}

function policiesForCandidate(
  state: DraftState,
  roster: Player[],
  candidate: Player,
): QbSimPolicy[] {
  const after = countPos(roster, "QB") + (candidate.pos === "QB" ? 1 : 0);
  if (after >= 2) return ["flex"];
  if (state.qb2Mode === "adaptive-punt") return ["qb-next", "punt"];
  return ["flex"];
}

function simulatePolicyWithAvailability(
  players: Player[],
  state: DraftState,
  candidate: Player,
  config: RecommendationConfig,
  qbPolicy: QbSimPolicy,
): CompletedSim {
  const probe = simulateCompletedDraft(players, state, candidate, config, false, {
    qbPolicy,
  });
  const later = laterFromSim(probe, candidate);
  if (!later) return probe;

  const taken = draftedIds(state.picks);
  const current = state.picks.length + 1;
  const available = players.filter(
    (player) => !taken.has(player.id) && player.id !== candidate.id,
  );
  const chance = returnProbability(
    later.player,
    available,
    current,
    later.overallPick,
  );
  const gone = simulateCompletedDraft(players, state, candidate, config, false, {
    qbPolicy,
    removeIds: [later.player.id],
  });
  const fallback =
    laterFromSim(gone, candidate)?.player ??
    gone.roster.find((player) => player.id !== candidate.id) ??
    null;

  const annotate = (sim: CompletedSim, utility = sim.utility): CompletedSim => ({
    ...sim,
    utility,
    laterAcquisition: {
      player: later.player,
      overallPick: later.overallPick,
      returnProbability: chance,
      fallbackPlayer: fallback?.id === later.player.id ? null : fallback,
      qbPolicy,
    },
  });

  if (chance >= 0.9) return annotate(probe);
  if (chance <= 0.1) return annotate(gone);

  const survive = simulateCompletedDraft(players, state, candidate, config, false, {
    qbPolicy,
    protectUntilPick: { playerId: later.player.id, overallPick: later.overallPick },
    forcePick: { playerId: later.player.id, overallPick: later.overallPick },
  });
  return annotate(survive, mixUtility(survive.utility, gone.utility, chance));
}

export function simulateCandidateDraft(
  players: Player[],
  state: DraftState,
  candidate: Player,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): CompletedSim {
  const byId = playersById(players);
  const roster = myRosterPlayers(state.picks, byId);
  const policies = policiesForCandidate(state, roster, candidate);
  let best: CompletedSim | null = null;
  for (const policy of policies) {
    const sim = simulatePolicyWithAvailability(
      players,
      state,
      candidate,
      config,
      policy,
    );
    if (!best || sim.utility.utility > best.utility.utility) {
      best = sim;
    }
  }
  return best ?? simulateCompletedDraft(players, state, candidate, config);
}

export function intrinsicLookaheadPool(
  eligible: Player[],
  roster: Player[],
  remainingUserPicks: number,
  currentOverallPick: number,
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
  const qbCount = roster.filter((player) => player.pos === "QB").length;
  if (qbCount < 2) {
    const extra = qbCount === 1 ? 16 : 8;
    eligible
      .filter((player) => player.pos === "QB")
      .sort((a, b) => b.modelPts - a.modelPts)
      .slice(0, extra)
      .forEach((player) => ids.add(player.id));
  }
  const needExtras: Array<[Position, number]> = [
    ["TE", countPos(roster, "TE") < 1 ? 4 : 0],
    ["RB", countPos(roster, "RB") < 2 ? 4 : 0],
    ["WR", countPos(roster, "WR") < 2 ? 4 : 0],
  ];
  for (const [pos, extra] of needExtras) {
    if (extra === 0) continue;
    eligible
      .filter((player) => player.pos === pos)
      .sort((a, b) => b.modelPts - a.modelPts)
      .slice(0, extra)
      .forEach((player) => ids.add(player.id));
  }
  const reserved = lateRoundReservation(
    currentOverallPick,
    countPos(roster, "QB"),
    rosterHas(roster, "K"),
    rosterHas(roster, "DST"),
  );
  if (reserved === "K" || reserved === "DST") {
    eligible
      .filter((player) => player.pos === reserved)
      .sort((a, b) => a.posRank - b.posRank)
      .slice(0, 4)
      .forEach((player) => ids.add(player.id));
  }
  return ids;
}
