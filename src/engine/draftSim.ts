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
import { mulberry32, scenarioStreamSalt, seedForScenario, weightedSample, type Rng } from "./rng.ts";
import {
  marketWeight,
  opponentPoolSize,
  opponentTemperature,
} from "./robustness.ts";
import {
  isUserPick,
  roundForPick,
  slotForPick,
  upcomingUserPick,
  userPickSchedule,
} from "./snake.ts";

export type BoardScenario = "median" | "early-qb" | "late-qb" | "early-wr" | "tier-cliff";

export const BOARD_SCENARIOS: BoardScenario[] = [
  "median",
  "early-qb",
  "late-qb",
  "early-wr",
  "tier-cliff",
];

export function availabilityTrialCount(
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  return BOARD_SCENARIOS.length * config.robustness.availabilityStreams;
}

export function utilityTrialCount(
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  return BOARD_SCENARIOS.length * config.robustness.utilityStreams;
}

export interface SimAcquisition {
  player: Player;
  overallPick: number;
}

export interface SimulateExtras {
  scenario?: BoardScenario;
  rngSeed?: number;
  seedSalt?: number;
  protectUntilPick?: { playerId: string; overallPick: number };
  forcePick?: { playerId: string; overallPick: number };
  removeIds?: Iterable<string>;
}

export interface LaterAcquisition {
  player: Player;
  overallPick: number;
  returnProbability: number;
  fallbackPlayer: Player | null;
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

export function preSelectionStateHash(state: DraftState): string {
  const raw = `${state.picks
    .map((pick) => `${pick.overallPick}:${pick.playerId}:${pick.draftedBy}`)
    .join(",")}|${state.picks.length + 1}`;
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

type SlotCounts = Record<Position, number[]>;

function slotCountsFromPicks(
  picks: DraftState["picks"],
  byId: Map<string, Player>,
): SlotCounts {
  return {
    QB: slotPosCounts(picks, byId, "QB"),
    RB: slotPosCounts(picks, byId, "RB"),
    WR: slotPosCounts(picks, byId, "WR"),
    TE: slotPosCounts(picks, byId, "TE"),
    K: slotPosCounts(picks, byId, "K"),
    DST: slotPosCounts(picks, byId, "DST"),
  };
}

export type TeamPosCounts = Record<Position, number>;

/**
 * Modest positional-need multiplier on top of ADP likelihood (§4.2). Never zero
 * for RB/WR/TE: a filled starter slot reduces but does not eliminate demand
 * because FLEX/OP/bench remain. QB/K/DST hard caps are enforced separately.
 */
export function opponentNeedMultiplier(
  pos: Position,
  counts: TeamPosCounts,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): number {
  const w = config.opponentNeeds;
  if (pos === "K" || pos === "DST") return 1;
  if (pos === "QB") return counts.QB === 0 ? w.starterMissing : w.opQbOpening;
  const starterSlots = pos === "TE" ? 1 : 2;
  const have = counts[pos];
  if (have < starterSlots) return w.starterMissing;
  if ((pos === "RB" || pos === "WR") && have >= w.deepThreshold) return w.deep;
  const skillTotal = counts.RB + counts.WR + counts.TE;
  return skillTotal < 8 ? w.flexOpening : w.filled;
}

function teamCountsAtSlot(bySlot: SlotCounts, slot: number): TeamPosCounts {
  return {
    QB: bySlot.QB[slot],
    RB: bySlot.RB[slot],
    WR: bySlot.WR[slot],
    TE: bySlot.TE[slot],
    K: bySlot.K[slot],
    DST: bySlot.DST[slot],
  };
}

function chooseOpponentPlayer(
  available: Player[],
  overallPick: number,
  slot: number,
  bySlot: SlotCounts,
  cap: number,
  rng: Rng,
  config: RecommendationConfig,
): Player | null {
  const round = roundForPick(overallPick);
  const remainingRounds = LEAGUE.rounds - round + 1;
  const needK = bySlot.K[slot] === 0;
  const needDst = bySlot.DST[slot] === 0;
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

  const legal: Player[] = [];
  for (const player of available) {
    if (player.pos === "QB" && bySlot.QB[slot] >= cap) continue;
    if (player.pos === "K" && (bySlot.K[slot] >= 1 || round < 13)) continue;
    if (player.pos === "DST" && (bySlot.DST[slot] >= 1 || round < 13)) continue;
    legal.push(player);
  }
  if (legal.length === 0) return available[0] ?? null;

  const pool = legal.slice(0, opponentPoolSize(round, config));
  const temperature = opponentTemperature(round, config);
  const counts = teamCountsAtSlot(bySlot, slot);
  return weightedSample(
    pool.map((player) => ({
      item: player,
      weight:
        marketWeight(player.adp, overallPick, temperature, config) *
        opponentNeedMultiplier(player.pos, counts, config),
    })),
    rng,
  );
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

/**
 * The simulated user's future pick. One unified objective across every legal
 * position: maximise one-step completed-team utility. QB competes with RB/WR/TE
 * on the same footing — no QB strategy, suppression or forcing. Only genuine
 * legal-roster feasibility (a required QB1, or a late K/DST that must be taken
 * to finish a legal roster) overrides the utility choice.
 */
export function chooseGreedyUserPlayer(
  available: Player[],
  roster: Player[],
  overallPick: number,
  config: RecommendationConfig,
): Player | null {
  if (roster.length >= LEAGUE.rosterSize) return null;
  const eligible = simEligible(available, roster);
  if (eligible.length === 0) return null;

  const qbCount = countPos(roster, "QB");
  const hasK = rosterHas(roster, "K");
  const hasDst = rosterHas(roster, "DST");
  const reserved = lateRoundReservation(overallPick, qbCount, hasK, hasDst);
  if (reserved === "QB") {
    return bestQb(eligible) ?? eligible[0] ?? null;
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
  "laterAcquisition" | "laterQb" | "laterWr" | "laterTe" | "scenarioUtilities"
> {
  return {
    laterAcquisition: null,
    laterQb: null,
    laterWr: null,
    laterTe: null,
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

/**
 * Roll a board out to completion from the current state. The simulated user
 * always picks under one unified completed-team objective — there is no QB
 * strategy, suppression or "wait" mode.
 */
export function simulateCompletedDraft(
  players: Player[],
  state: DraftState,
  openingUserPick: Player | null,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
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
  const bySlot = slotCountsFromPicks(state.picks, byId);
  const userPicks = new Set(userPickSchedule());
  const start = state.picks.length + 1;
  const last = LEAGUE.teams * LEAGUE.rounds;
  const reservedId = openingUserPick?.id ?? null;
  const skipUserPick = reservedId == null ? null : upcomingUserPick(start);
  const protect = extras.protectUntilPick;
  const forcePick = extras.forcePick;
  const rng = mulberry32(
    extras.rngSeed ??
      seedForScenario(preSelectionStateHash(state), scenario, extras.seedSalt ?? 0),
  );
  let firstPick: Player | null = null;
  let candidateLocked = reservedId == null;
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
      continue;
    }
    const slot = slotForPick(overall);
    const protectNow =
      protect != null && overall < protect.overallPick ? protect.playerId : null;
    let pick: Player | null = null;
    if (isUser) {
      if (roster.length >= LEAGUE.rosterSize) {
        continue;
      }
      if (
        forcePick != null &&
        overall === forcePick.overallPick &&
        available.some((player) => player.id === forcePick.playerId)
      ) {
        pick = available.find((player) => player.id === forcePick.playerId) ?? null;
      } else {
        pick = chooseGreedyUserPlayer(available, roster, overall, config);
      }
    } else {
      const protectedPool = protectNow
        ? available.filter((player) => player.id !== protectNow)
        : available;
      pick = chooseOpponentPlayer(
        protectedPool.length > 0 ? protectedPool : available,
        overall,
        slot,
        bySlot,
        cap,
        rng,
        config,
      );
    }
    if (!pick) continue;
    available = removePlayer(available, pick.id);
    bySlot[pick.pos][slot] += 1;
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
    qbBySlot: bySlot.QB,
    kBySlot: bySlot.K,
    dstBySlot: bySlot.DST,
    candidateLocked,
    acquisitions,
    skippedUserPick: skipUserPick,
    securedBeforeOpponents,
    ...emptyLater(),
  };
}

export interface ReturnSimContext {
  players: Player[];
  state: DraftState;
  config?: RecommendationConfig;
  seedSalt?: number;
}

export function returnProbability(
  player: Player,
  available: Player[],
  currentOverallPick: number,
  nextUserPick: number | null,
  context?: ReturnSimContext,
): number {
  if (nextUserPick == null) return 0;
  if (context) {
    return sampledReturnProbability(
      player,
      available,
      currentOverallPick,
      nextUserPick,
      context,
    );
  }
  const intervening = remainingOpponentPicks(currentOverallPick, nextUserPick);
  if (intervening <= 0) return 1;
  let survived = 0;
  for (const scenario of BOARD_SCENARIOS) {
    const ordered = [...available].sort((left, right) =>
      compareByScenario(left, right, scenario),
    );
    const index = ordered.findIndex((row) => row.id === player.id);
    if (index < 0) return 0;
    if (index >= intervening) survived += 1;
  }
  return survived / BOARD_SCENARIOS.length;
}

function sampledReturnProbability(
  player: Player,
  available: Player[],
  currentOverallPick: number,
  nextUserPick: number,
  context: ReturnSimContext,
): number {
  const config = context.config ?? RECOMMENDATION_CONFIG;
  const byId = playersById(context.players);
  const cap = config.branch.opponentQbCap;
  const hash = preSelectionStateHash(context.state);
  const userPicks = new Set(userPickSchedule());
  const streams = config.robustness.availabilityStreams;
  const baseSalt = context.seedSalt ?? 0;
  let survived = 0;
  let trials = 0;
  for (const scenario of BOARD_SCENARIOS) {
    for (let stream = 0; stream < streams; stream += 1) {
      const salt = scenarioStreamSalt(baseSalt, stream);
      const rng = mulberry32(seedForScenario(hash, scenario, salt));
      let pool = [...available].sort((left, right) =>
        compareByScenario(left, right, scenario),
      );
      const bySlot = slotCountsFromPicks(context.state.picks, byId);
      let taken = false;
      for (let overall = currentOverallPick; overall < nextUserPick; overall += 1) {
        if (userPicks.has(overall)) continue;
        const pick = chooseOpponentPlayer(
          pool,
          overall,
          slotForPick(overall),
          bySlot,
          cap,
          rng,
          config,
        );
        if (!pick) continue;
        if (pick.id === player.id) {
          taken = true;
          break;
        }
        pool = removePlayer(pool, pick.id);
        bySlot[pick.pos][slotForPick(overall)] += 1;
      }
      trials += 1;
      if (!taken && pool.some((row) => row.id === player.id)) survived += 1;
    }
  }
  return trials === 0 ? 0 : survived / trials;
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
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
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
    returnProbability: returnProbability(row.player, available, current, row.overallPick, {
      players,
      state,
      config,
    }),
    fallbackPlayer: null,
  };
}

export function simulateCandidateDraft(
  players: Player[],
  state: DraftState,
  candidate: Player,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
  seedSalt = 0,
): CompletedSim {
  const stateHash = preSelectionStateHash(state);
  const streams = config.robustness.utilityStreams;

  const scenarioSims: CompletedSim[] = [];
  for (const scenario of BOARD_SCENARIOS) {
    for (let stream = 0; stream < streams; stream += 1) {
      const salt = scenarioStreamSalt(seedSalt, stream);
      scenarioSims.push(
        simulateCompletedDraft(players, state, candidate, config, {
          scenario,
          rngSeed: seedForScenario(stateHash, scenario, salt),
          seedSalt: salt,
        }),
      );
    }
  }
  const median = scenarioSims[0];
  if (!median) {
    return simulateCompletedDraft(players, state, candidate, config);
  }

  const laterQb = annotateLater(laterByPos(median, candidate, "QB"), candidate, players, state, config);
  const laterWr = annotateLater(laterByPos(median, candidate, "WR"), candidate, players, state, config);
  const laterTe = annotateLater(laterByPos(median, candidate, "TE"), candidate, players, state, config);
  const primary = candidate.pos === "QB" ? laterWr ?? laterTe ?? laterQb : laterQb ?? laterWr ?? laterTe;

  return {
    ...median,
    utility: mixUtility(scenarioSims.map((sim) => sim.utility)),
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
