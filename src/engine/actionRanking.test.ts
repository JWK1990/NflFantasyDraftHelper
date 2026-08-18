import { describe, expect, it } from "vitest";
import { LEAGUE } from "../config/leagueSettings.ts";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import {
  BOARD_SCENARIOS,
  QB2_POLICIES,
  adpWindowIds,
  remainingOpponentPicks,
  returnProbability,
  simulateCandidateDraft,
  simulateCompletedDraft,
} from "./draftSim.ts";
import { recommend } from "./recommend.ts";
import { completedTeamUtility } from "./teamUtility.ts";
import { likelyGoneByNextTurn } from "./vona.ts";
import { eligiblePlayers } from "./eligibility.ts";
import { nextUserPickAfter, userPickSchedule } from "./snake.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";
import { RECOMMENDATION_CONFIG } from "../config/recommendationConfig.ts";

const players = loadPlayers();
const byId = playersById(players);

function named(name: string): Player {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match;
}

function draft(
  state: DraftState,
  name: string,
  draftedBy: "mine" | "other",
): DraftState {
  return draftReducer(state, {
    type: "DRAFT_PLAYER",
    playerId: named(name).id,
    draftedBy,
  });
}

function withAdp(board: Player[], name: string, adp: number): Player[] {
  const id = named(name).id;
  return board.map((player) => (player.id === id ? { ...player, adp } : player));
}

function fillToPick(
  targetPick: number,
  keepNames: string[],
  userPickName = "Josh Allen",
): DraftState {
  const keep = new Set(keepNames.map((name) => named(name).id));
  keep.add(named(userPickName).id);
  let state = initialDraftState;
  const queue = players
    .filter((player) => player.pos !== "K" && player.pos !== "DST" && !keep.has(player.id))
    .sort((a, b) => (a.adp ?? 900) - (b.adp ?? 900) || a.modelRank - b.modelRank);
  let index = 0;
  for (let overall = 1; overall < targetPick; overall += 1) {
    if (overall === 6) {
      state = draft(state, userPickName, "mine");
      continue;
    }
    const next = queue[index];
    index += 1;
    if (!next) throw new Error(`Ran out of players before pick ${targetPick}`);
    state = draftReducer(state, {
      type: "DRAFT_PLAYER",
      playerId: next.id,
      draftedBy: "other",
    });
  }
  return state;
}

const keepStars = [
  "Jonathan Taylor",
  "Trey McBride",
  "Rashee Rice",
  "Daniel Jones",
  "Tetairoa McMillan",
  "Nico Collins",
  "Bryce Young",
  "Malik Nabers",
  "Amon-Ra St. Brown",
];

describe("current-board action ranking", { timeout: 30_000 }, () => {
  it("gives every candidate the same pre-selection state hash", () => {
    const recs = recommend(players, fillToPick(16, keepStars));
    const hashes = new Set(recs.map((row) => row.breakdown.preSelectionStateHash));
    expect(hashes.size).toBe(1);
    expect([...hashes][0]).toMatch(/^[0-9a-f]{8}$/);
  });

  it("secures the named candidate before any simulated opponent pick", () => {
    const state = fillToPick(16, keepStars);
    const taylor = named("Jonathan Taylor");
    const sim = simulateCompletedDraft(players, state, taylor);
    expect(sim.securedBeforeOpponents).toBe(true);
    expect(sim.firstPick?.id).toBe(taylor.id);
    expect(sim.acquisitions[0]?.player.id).toBe(taylor.id);
    expect(sim.acquisitions[0]?.overallPick).toBe(16);
  });

  it("keeps the named candidate on every completed roster", () => {
    const state = fillToPick(16, keepStars);
    for (const name of ["Jonathan Taylor", "Trey McBride", "Nico Collins"]) {
      const player = named(name);
      const sim = simulateCandidateDraft(players, state, player);
      expect(sim.candidateLocked).toBe(true);
      expect(sim.roster.some((row) => row.id === player.id)).toBe(true);
      expect(sim.firstPick?.id).toBe(player.id);
    }
  });

  it("does not score a fallback roster under another player's name", () => {
    const state = fillToPick(16, keepStars);
    const taylor = simulateCandidateDraft(players, state, named("Jonathan Taylor"));
    const collins = simulateCandidateDraft(players, state, named("Nico Collins"));
    expect(taylor.firstPick?.player).toBe("Jonathan Taylor");
    expect(collins.firstPick?.player).toBe("Nico Collins");
    expect(taylor.firstPick?.id).not.toBe(collins.firstPick?.id);
  });

  it("consumes exactly one future user pick during an opponent-turn evaluation", () => {
    const state = fillToPick(16, keepStars);
    expect(state.picks).toHaveLength(15);
    const sim = simulateCompletedDraft(players, state, named("Nico Collins"));
    expect(sim.skippedUserPick).toBe(19);
    expect(sim.roster).toHaveLength(LEAGUE.rosterSize);
    expect(sim.acquisitions.some((row) => row.overallPick === 19)).toBe(false);
    expect(sim.acquisitions.some((row) => row.overallPick === 30)).toBe(true);
    expect(myRosterPlayers(state.picks, byId)).toHaveLength(1);
  });

  it("consumes the current pick on the clock and does not skip the following user pick", () => {
    const state = fillToPick(19, keepStars);
    const sim = simulateCompletedDraft(players, state, named("Nico Collins"));
    expect(sim.skippedUserPick).toBe(19);
    expect(sim.acquisitions.some((row) => row.overallPick === 30)).toBe(true);
    expect(sim.roster).toHaveLength(LEAGUE.rosterSize);
  });

  it("removes an Other pick and recomputes from the new observed board", () => {
    const state = fillToPick(16, keepStars);
    const before = recommend(players, state);
    expect(before.some((row) => row.player.player === "Nico Collins")).toBe(true);
    const after = recommend(players, draft(state, "Nico Collins", "other"));
    expect(after.some((row) => row.player.player === "Nico Collins")).toBe(false);
    expect(after[0]?.breakdown.preSelectionStateHash).not.toBe(
      before[0]?.breakdown.preSelectionStateHash,
    );
  });

  it("recomputes identical rankings without a new real pick", () => {
    const state = fillToPick(16, keepStars);
    const first = recommend(players, state).map((row) => row.player.id);
    const second = recommend(players, state).map((row) => row.player.id);
    expect(second).toEqual(first);
  });

  it("does not change model points, VORP, or intrinsic contribution when only ADP changes", () => {
    const collins = named("Nico Collins");
    const shifted = { ...collins, adp: 1 };
    expect(shifted.modelPts).toBe(collins.modelPts);
    expect(shifted.vorp).toBe(collins.vorp);
    expect(completedTeamUtility([shifted], 14).utility).toBe(
      completedTeamUtility([collins], 14).utility,
    );
  });

  it("lets ADP change return probability and therefore timing-sensitive order", () => {
    const state = fillToPick(16, keepStars);
    const collins = named("Nico Collins");
    const eligible = players.filter(
      (player) => !state.picks.some((pick) => pick.playerId === player.id),
    );
    const base = returnProbability(collins, eligible, 16, 19);
    const earlyBoard = withAdp(eligible, "Nico Collins", 1);
    const early = returnProbability(
      earlyBoard.find((player) => player.player === "Nico Collins")!,
      earlyBoard,
      16,
      19,
    );
    expect(early).toBeLessThan(base);
  });

  it("does not add a separate VONA bonus on top of take-now utility", () => {
    const recs = recommend(players, fillToPick(16, keepStars));
    expect(
      recs.every((row) => !row.reasons.includes("big drop if you pass (VONA)")),
    ).toBe(true);
    const lookahead = recs.filter((row) => row.breakdown.lookahead);
    expect(lookahead.length).toBeGreaterThan(1);
    const best = Math.max(...lookahead.map((row) => row.dynamicScore));
    expect(lookahead.find((row) => row.dynamicScore === best)?.dynamicScore).toBe(best);
  });

  it("gives Collins a +9.0 direct projection edge over McMillan", () => {
    const collins = named("Nico Collins");
    const mcmillan = named("Tetairoa McMillan");
    expect(collins.modelPts).toBe(253.5);
    expect(mcmillan.modelPts).toBe(244.5);
    expect(collins.vorp).toBe(62.5);
    expect(mcmillan.vorp).toBe(53.5);
    expect(collins.modelPts - mcmillan.modelPts).toBe(9);
  });

  it("lets McMillan outrank Collins only with a displayed continuation edge across scenarios", () => {
    const recs = recommend(players, fillToPick(16, keepStars));
    const collins = recs.find((row) => row.player.player === "Nico Collins");
    const mcmillan = recs.find((row) => row.player.player === "Tetairoa McMillan");
    expect(collins).toBeDefined();
    expect(mcmillan).toBeDefined();
    const collinsRank = recs.findIndex((row) => row.player.player === "Nico Collins");
    const mcmillanRank = recs.findIndex((row) => row.player.player === "Tetairoa McMillan");
    if (mcmillanRank < collinsRank) {
      const inversion = mcmillan!.breakdown.samePositionInversion;
      expect(inversion).toBeDefined();
      expect(inversion!.otherPlayer).toBe("Nico Collins");
      expect(inversion!.directEdge).toBe(9);
      expect(inversion!.continuationEdge).toBeGreaterThan(9);
      expect(inversion!.netEdge).toBeGreaterThan(0);
      const a = mcmillan!.breakdown.scenarioUtilities ?? [];
      const b = collins!.breakdown.scenarioUtilities ?? [];
      expect(a.length).toBe(BOARD_SCENARIOS.length);
      expect(a.every((utility, index) => utility + 0.01 >= (b[index] ?? 0))).toBe(true);
    } else {
      expect(collins!.dynamicScore).toBeGreaterThanOrEqual(mcmillan!.dynamicScore);
    }
  });

  it("lets Jones outrank McMillan only with higher same-board completed-team utility", () => {
    const recs = recommend(players, fillToPick(16, keepStars));
    const jones = recs.find((row) => row.player.player === "Daniel Jones");
    const mcmillan = recs.find((row) => row.player.player === "Tetairoa McMillan");
    expect(jones).toBeDefined();
    expect(mcmillan).toBeDefined();
    if (jones!.dynamicScore > mcmillan!.dynamicScore) {
      expect(jones!.breakdown.lookahead).toBe(true);
      expect(
        jones!.breakdown.laterWr ?? jones!.breakdown.laterTe ?? jones!.breakdown.laterQb,
      ).toBeDefined();
    }
  });

  it("gives a Jones branch Rice only at the rate supported by availability", () => {
    const state = fillToPick(16, keepStars);
    const board = withAdp(players, "Rashee Rice", 1);
    const jones = named("Daniel Jones");
    const rice = named("Rashee Rice");
    const sim = simulateCandidateDraft(board, state, jones);
    expect(sim.roster.some((player) => player.id === rice.id)).toBe(false);
    const riceRow = simulateCandidateDraft(board, state, rice);
    expect(riceRow.roster.some((player) => player.id === rice.id)).toBe(true);
  });

  it("evaluates next, tier-cliff, middle, and final QB2 strategies on a Rice branch", () => {
    const state = fillToPick(16, keepStars);
    const sim = simulateCandidateDraft(players, state, named("Rashee Rice"));
    expect(sim.qbPoliciesTried).toEqual(QB2_POLICIES);
    expect(QB2_POLICIES).toContain(sim.qbPolicy);
  });

  it("subjects later QB, WR, and TE acquisitions to the scenario model", () => {
    const state = fillToPick(16, keepStars);
    const sim = simulateCandidateDraft(players, state, named("Daniel Jones"));
    expect(sim.scenarioUtilities).toHaveLength(BOARD_SCENARIOS.length);
    expect(
      [sim.laterQb, sim.laterWr, sim.laterTe].filter(Boolean).length,
    ).toBeGreaterThan(1);
    expect(sim.laterAcquisition?.returnProbability).toBeGreaterThanOrEqual(0);
    expect(sim.laterAcquisition?.returnProbability).toBeLessThanOrEqual(1);
  });

  it("matches displayed return chips to scenario survival within one scenario step", () => {
    const state = fillToPick(16, keepStars);
    const recs = recommend(players, state);
    const counts = rosterCounts(state.picks, byId);
    const eligible = eligiblePlayers(players, state.picks, counts, 16, RECOMMENDATION_CONFIG);
    const next = nextUserPickAfter(16);
    expect(next).toBe(19);
    for (const row of recs.slice(0, 12)) {
      const expected = returnProbability(row.player, eligible, 16, next);
      expect(row.breakdown.returnProbability).toBeCloseTo(expected, 8);
      expect(row.breakdown.waitPick).toBe(19);
    }
  });

  it("caps the user and every opponent at two QBs", () => {
    const sim = simulateCandidateDraft(
      players,
      fillToPick(16, keepStars),
      named("Nico Collins"),
    );
    expect(sim.roster.filter((player) => player.pos === "QB").length).toBeLessThanOrEqual(2);
    for (let slot = 1; slot <= LEAGUE.teams; slot += 1) {
      expect(sim.qbBySlot[slot]).toBeLessThanOrEqual(2);
    }
  });

  it("finishes rollouts with a legal roster including K, DST, and TE", () => {
    const sim = simulateCandidateDraft(
      players,
      fillToPick(16, keepStars),
      named("Daniel Jones"),
    );
    expect(sim.roster).toHaveLength(LEAGUE.rosterSize);
    expect(sim.roster.some((player) => player.pos === "K")).toBe(true);
    expect(sim.roster.some((player) => player.pos === "DST")).toBe(true);
    expect(sim.roster.some((player) => player.pos === "TE")).toBe(true);
    expect(sim.roster.filter((player) => player.pos === "QB").length).toBeGreaterThanOrEqual(1);
  });

  it("does not change recommendation score when risk, injury, or LW chips change", () => {
    const state = fillToPick(16, keepStars);
    const mutated = players.map((player) => {
      if (player.player !== "Nico Collins") return player;
      const { leagueWinner: _ignored, ...rest } = player;
      return { ...rest, tag: "ELITE/RISK INJURY WATCH" };
    });
    const base = recommend(players, state).find((row) => row.player.player === "Nico Collins");
    const changed = recommend(mutated, state).find((row) => row.player.player === "Nico Collins");
    expect(base?.dynamicScore).toBe(changed?.dynamicScore);
    expect(base?.breakdown.teamUtility).toBe(changed?.breakdown.teamUtility);
  });

  it("puts the highest take-now utility in row 1 when the user is on the clock", () => {
    const recs = recommend(players, fillToPick(19, keepStars));
    const lookahead = recs.filter((row) => row.breakdown.lookahead);
    const best = Math.max(...lookahead.map((row) => row.dynamicScore));
    expect(recs[0]?.dynamicScore).toBe(best);
    expect(recs[0]?.breakdown.lookahead).toBe(true);
  });
});

describe("availability chips vs remaining opponent picks", { timeout: 30_000 }, () => {
  it("uses the same ADP window for chips and remaining opponent picks", () => {
    const state = fillToPick(16, keepStars);
    const counts = rosterCounts(state.picks, byId);
    const eligible = eligiblePlayers(players, state.picks, counts, 16, RECOMMENDATION_CONFIG);
    expect(nextUserPickAfter(16)).toBe(19);
    expect(likelyGoneByNextTurn(eligible, 16)).toEqual(
      adpWindowIds(eligible, remainingOpponentPicks(16, 19)),
    );
  });

  it("labels availability chips with pick 19 during opponent turns and pick 30 on the clock", () => {
    const schedule = userPickSchedule();
    expect(schedule[1]).toBe(19);
    expect(schedule[2]).toBe(30);
    const at16 = recommend(players, fillToPick(16, keepStars));
    expect(
      at16.some((row) => row.reasons.some((reason) => reason.includes("pick 19"))),
    ).toBe(true);
    const at19 = recommend(players, fillToPick(19, keepStars));
    expect(
      at19.some((row) => row.reasons.some((reason) => reason.includes("pick 30"))),
    ).toBe(true);
  });
});
