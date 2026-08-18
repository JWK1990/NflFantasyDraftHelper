import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftState, Player, Position } from "../domain/types.ts";
import { completedTeamUtility, type TeamUtility } from "./teamUtility.ts";
import { lateRoundReservation } from "./lateRound.ts";
import { bestQb, isAcceptableQb } from "./qb.ts";
import { draftedIds, myRosterPlayers, playersById } from "./roster.ts";
import {
  isUserPick,
  nextUserPickAfter,
  roundForPick,
  slotForPick,
  upcomingUserPick,
  userPickSchedule,
} from "./snake.ts";

export type QbSimPolicy = "flex" | "punt" | "qb-next" | "cliff" | "middle";
export type BoardScenario = "median" | "early-qb" | "late-qb" | "early-wr" | "tier-cliff";

export const BOARD_SCENARIOS: BoardScenario[] = [
  "median",
  "early-qb",
  "late-qb",
  "early-wr",
];

export const QB2_POLICIES: QbSimPolicy[] = ["qb-next", "cliff", "middle", "punt"];

export interface SimAcquisition {
  player: Player;
  overallPick: number;
}

export interface SimulateExtras {
  qbPolicy?: QbSimPolicy;
  scenario?: BoardScenario;
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

export function scenarioAdp(player: Player, scenario: BoardScenario): number {
  const base = adpSortValue(player);
  switch (scenario) {
    case "median":
      return base;
    case "early-qb":
      return player.pos === "QB" ? base * 0.7 : base;
    case "late-qb":
      return player.pos === "QB" ? base * 1.35 : base;
    case "early-wr":
      return player.pos === "WR" ? base * 0.7 : base;
    case "tier-cliff":
      return player.posTier <= 2 ? base * 0.82 : base;
  }
}

export function compareByAdp(a: Player, b: Player): number {
  return adpSortValue(a) - adpSortValue(b) || b.modelPts - a.modelPts;
}

export function compareByScenario(
  a: Player,
  b: Player,
  scenario: BoardScenario,
): number {
  return scenarioAdp(a, scenario) - scenarioAdp(b, scenario) || b.modelPts - a.modelPts;
}

export function opponentPicksBetween(startPick: number, endPick: number): number {
  let count = 0;
  for (let overall = startPick + 1; overall < endPick; overall += 1) {
    if (!isUserPick(overall)) count += 1;
  }
  return count;
}

export function remainingOpponentPicks(
  currentOverallPick: number,
  targetPick: number,
): number {
  return opponentPicksBetween(currentOverallPick - 1, targetPick);
}

export function adpWindowIds(
  available: Player[],
  count: number,
  reservedId: string | null = null,
  scenario: BoardScenario = "median",
): Set<string> {
  const ids = new Set<string>();
  if (count <= 0) return ids;
  for (const player of [...available].sort((left, right) =>
    compareByScenario(left, right, scenario),
  )) {
    if (player.id === reservedId) continue;
    ids.add(player.id);
    if (ids.size >= count) break;
  }
  return ids;
}

export function preSelectionStateHash(state: DraftState): string {
  const raw = `${state.picks
    .map((pick) => `${pick.overallPick}:${pick.playerId}:${pick.draftedBy}`)
    .join(",")}|${state.picks.length + 1}|${state.qb2Mode}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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

export function qb2PolicyDue(
  policy: QbSimPolicy,
  overallPick: number,
  qbCount: number,
  available: Player[],
  config: RecommendationConfig,
  alreadyForced = false,
): boolean {
  if (qbCount >= 2) return false;
  if (policy === "flex") return false;
  if (policy === "punt") {
    return overallPick === 174 || (overallPick === 163 && qbCount === 0);
  }
  if (policy === "qb-next") return !alreadyForced && qbCount < 2;
  if (policy === "middle") {
    const round = roundForPick(overallPick);
    return qbCount < 2 && round >= 6 && round <= 9;
  }
  if (policy === "cliff") {
    const acceptable = available.filter((player) => isAcceptableQb(player, config));
    if (acceptable.length === 0) return false;
    if (acceptable.length <= config.qb.shrinkingPoolThreshold) return true;
    const minTier = Math.min(...acceptable.map((player) => player.posTier));
    return acceptable.filter((player) => player.posTier === minTier).length <= 2;
  }
  return false;
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

  const due = qb2PolicyDue(qbPolicy, overallPick, qbCount, eligible, config);
  const suppressQb =
    qbCount >= 1 &&
    (qbPolicy === "punt" || qbPolicy === "cliff" || qbPolicy === "middle") &&
    !due &&
    overallPick !== 174;
  if (suppressQb) {
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
  qbPoliciesTried: QbSimPolicy[];
  laterAcquisition: LaterAcquisition | null;
  laterQb: LaterAcquisition | null;
  laterWr: LaterAcquisition | null;
  laterTe: LaterAcquisition | null;
  skippedUserPick: number | null;
  securedBeforeOpponents: boolean;
  scenarioUtilities: number[];
}

function emptyLater(): Pick<
  CompletedSim,
  "laterAcquisition" | "laterQb" | "laterWr" | "laterTe" | "qbPoliciesTried" | "scenarioUtilities"
> {
  return {
    laterAcquisition: null,
    laterQb: null,
    laterWr: null,
    laterTe: null,
    qbPoliciesTried: [],
    scenarioUtilities: [],
  };
}

function mixUtility(parts: TeamUtility[]): TeamUtility {
  const count = Math.max(1, parts.length);
  const mix = (key: keyof TeamUtility) =>
    parts.reduce((sum, part) => sum + part[key], 0) / count;
  return {
    starterProjection: mix("starterProjection"),
    benchValue: mix("benchValue"),
    upsideAdjustment: mix("upsideAdjustment"),
    riskAdjustment: mix("riskAdjustment"),
    slotPenalty: mix("slotPenalty"),
    utility: mix("utility"),
  };
}

function nextUnskippedUserPick(overall: number, skipUserPick: number | null): number | null {
  let next = upcomingUserPick(overall);
  if (next != null && next === skipUserPick) {
    next = nextUserPickAfter(next);
  }
  return next;
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
  const scenario = extras.scenario ?? "median";
  let available = players
    .filter((player) => !taken.has(player.id) && !remove.has(player.id))
    .sort((left, right) => compareByScenario(left, right, scenario));
  const roster = [...myRosterPlayers(state.picks, byId)];
  const qbBySlot = slotPosCounts(state.picks, byId, "QB");
  const kBySlot = slotPosCounts(state.picks, byId, "K");
  const dstBySlot = slotPosCounts(state.picks, byId, "DST");
  const userPicks = new Set(userPickSchedule());
  const start = state.picks.length + 1;
  const last = LEAGUE.teams * LEAGUE.rounds;
  const reservedId = openingUserPick?.id ?? null;
  const skipUserPick = reservedId == null ? null : upcomingUserPick(start);
  const qbPolicy = extras.qbPolicy ?? (waitOnQb ? "punt" : "flex");
  const protect = extras.protectUntilPick;
  const forcePick = extras.forcePick;
  let firstPick: Player | null = null;
  let candidateLocked = reservedId == null;
  let tookForcedQb = false;
  let consumeIds: Set<string> | null = null;
  const acquisitions: SimAcquisition[] = [];
  const cap = config.branch.opponentQbCap;
  let securedBeforeOpponents = reservedId == null;

  if (openingUserPick) {
    const locked = available.find((player) => player.id === openingUserPick.id) ?? null;
    if (locked) {
      roster.push(locked);
      available = removePlayer(available, locked.id);
      firstPick = locked;
      candidateLocked = true;
      securedBeforeOpponents = true;
      acquisitions.push({ player: locked, overallPick: start });
    }
  }

  for (let overall = start; overall <= last; overall += 1) {
    const isUser = userPicks.has(overall);
    if (isUser && skipUserPick != null && overall === skipUserPick) {
      consumeIds = null;
      continue;
    }
    const slot = slotForPick(overall);
    const protectNow =
      protect != null && overall < protect.overallPick ? protect.playerId : null;
    let pick: Player | null = null;
    if (isUser) {
      if (roster.length >= LEAGUE.rosterSize) {
        consumeIds = null;
        continue;
      }
      const blocked = consumeIds ?? new Set<string>();
      const userPool = available.filter(
        (player) => player.id === forcePick?.playerId || !blocked.has(player.id),
      );
      if (
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
        const takeQbNow =
          reserved !== "K" &&
          reserved !== "DST" &&
          qb2PolicyDue(qbPolicy, overall, qbCount, available, config, tookForcedQb);
        if (takeQbNow && (qbPolicy === "qb-next" || qbPolicy === "cliff" || qbPolicy === "middle")) {
          pick = bestQb(userPool.length > 0 ? userPool : available, config);
          tookForcedQb = true;
        } else {
          const forceQb = reserved === "QB";
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
        const nextUser = nextUnskippedUserPick(overall, skipUserPick);
        const remainingOpponents =
          nextUser == null ? 0 : opponentPicksBetween(overall - 1, nextUser);
        consumeIds = adpWindowIds(available, remainingOpponents, null, scenario);
        if (protectNow) consumeIds.delete(protectNow);
      }
      const protectedPool = protectNow
        ? available.filter((player) => player.id !== protectNow)
        : available;
      pick = chooseOpponentPlayer(
        protectedPool.length > 0 ? protectedPool : available,
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
    skippedUserPick: skipUserPick,
    securedBeforeOpponents,
    ...emptyLater(),
  };
}

export function returnProbability(
  player: Player,
  available: Player[],
  currentOverallPick: number,
  nextUserPick: number | null,
  scenarios: readonly BoardScenario[] = BOARD_SCENARIOS,
): number {
  if (nextUserPick == null) return 0;
  const intervening = remainingOpponentPicks(currentOverallPick, nextUserPick);
  if (intervening <= 0) return 1;
  let survived = 0;
  for (const scenario of scenarios) {
    const ordered = [...available].sort((left, right) =>
      compareByScenario(left, right, scenario),
    );
    const index = ordered.findIndex((row) => row.id === player.id);
    if (index < 0) return 0;
    if (index >= intervening) survived += 1;
  }
  return survived / scenarios.length;
}

function laterByPos(
  sim: CompletedSim,
  candidate: Player,
  pos: Position,
): SimAcquisition | null {
  return (
    sim.acquisitions.find(
      (row) => row.player.id !== candidate.id && row.player.pos === pos,
    ) ?? null
  );
}

function annotateLater(
  row: SimAcquisition | null,
  candidate: Player,
  players: Player[],
  state: DraftState,
  qbPolicy: QbSimPolicy,
): LaterAcquisition | null {
  if (!row) return null;
  const taken = draftedIds(state.picks);
  const current = state.picks.length + 1;
  const available = players.filter(
    (player) => !taken.has(player.id) && player.id !== candidate.id,
  );
  return {
    player: row.player,
    overallPick: row.overallPick,
    returnProbability: returnProbability(row.player, available, current, row.overallPick),
    fallbackPlayer: null,
    qbPolicy,
  };
}

function policiesForCandidate(
  roster: Player[],
  candidate: Player,
): QbSimPolicy[] {
  const after = countPos(roster, "QB") + (candidate.pos === "QB" ? 1 : 0);
  if (after >= 2) return ["flex"];
  return [...QB2_POLICIES];
}

export function simulateCandidateDraft(
  players: Player[],
  state: DraftState,
  candidate: Player,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): CompletedSim {
  const byId = playersById(players);
  const roster = myRosterPlayers(state.picks, byId);
  const policies = policiesForCandidate(roster, candidate);
  let bestPolicy = policies[0] ?? "flex";
  let bestMedian: CompletedSim | null = null;
  for (const policy of policies) {
    const sim = simulateCompletedDraft(players, state, candidate, config, false, {
      qbPolicy: policy,
      scenario: "median",
    });
    if (!bestMedian || sim.utility.utility > bestMedian.utility.utility) {
      bestMedian = sim;
      bestPolicy = policy;
    }
  }

  const scenarioSims = BOARD_SCENARIOS.map((scenario) => {
    if (scenario === "median" && bestMedian) return bestMedian;
    return simulateCompletedDraft(players, state, candidate, config, false, {
      qbPolicy: bestPolicy,
      scenario,
    });
  });
  const median = scenarioSims[0] ?? bestMedian;
  if (!median) {
    return simulateCompletedDraft(players, state, candidate, config);
  }

  const laterQb = annotateLater(laterByPos(median, candidate, "QB"), candidate, players, state, bestPolicy);
  const laterWr = annotateLater(laterByPos(median, candidate, "WR"), candidate, players, state, bestPolicy);
  const laterTe = annotateLater(laterByPos(median, candidate, "TE"), candidate, players, state, bestPolicy);
  const primary = candidate.pos === "QB" ? laterWr ?? laterTe ?? laterQb : laterQb ?? laterWr ?? laterTe;

  return {
    ...median,
    utility: mixUtility(scenarioSims.map((sim) => sim.utility)),
    qbPolicy: bestPolicy,
    qbPoliciesTried: policies,
    laterAcquisition: primary,
    laterQb,
    laterWr,
    laterTe,
    candidateLocked: scenarioSims.every(
      (sim) => sim.candidateLocked && sim.roster.some((player) => player.id === candidate.id),
    ),
    scenarioUtilities: scenarioSims.map((sim) => sim.utility.utility),
  };
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
