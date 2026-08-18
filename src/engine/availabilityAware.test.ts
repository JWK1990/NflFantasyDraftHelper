import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import {
  adpWindowIds,
  remainingOpponentPicks,
  simulateCandidateDraft,
  simulateCompletedDraft,
  QB2_POLICIES,
} from "./draftSim.ts";
import { recommend } from "./recommend.ts";
import { likelyGoneByNextTurn } from "./vona.ts";
import { eligiblePlayers } from "./eligibility.ts";
import { nextUserPickAfter } from "./snake.ts";
import { playersById, rosterCounts } from "./roster.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";
import { RECOMMENDATION_CONFIG } from "../config/recommendationConfig.ts";

const players = loadPlayers();
const byId = playersById(players);

function named(name: string): Player {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match;
}

function draft(state: DraftState, name: string, draftedBy: "mine" | "other"): DraftState {
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

function fillToPick(targetPick: number, keepNames: string[], userPickName = "Josh Allen"): DraftState {
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

const keepStars = ["Rashee Rice", "Daniel Jones", "Bryce Young", "Malik Nabers", "Amon-Ra St. Brown"];

describe("availability-aware rest-of-draft", { timeout: 30_000 }, () => {
  it("uses the same ADP window for chips and opponent consumption", () => {
    const state = fillToPick(16, keepStars);
    const counts = rosterCounts(state.picks, byId);
    const eligible = eligiblePlayers(players, state.picks, counts, 16, RECOMMENDATION_CONFIG);
    const next = nextUserPickAfter(16);
    expect(next).toBe(19);
    expect(likelyGoneByNextTurn(eligible, 16)).toEqual(
      adpWindowIds(eligible, remainingOpponentPicks(16, 19)),
    );
  });

  it("lets a WR row consider next, cliff, middle, and final QB2 paths instead of auto-punting to 174", () => {
    const state = fillToPick(16, keepStars);
    const rice = named("Rashee Rice");
    const sim = simulateCandidateDraft(players, state, rice);
    const qb2 = sim.acquisitions.find(
      (row) => row.player.pos === "QB" && row.player.player !== "Josh Allen",
    );
    expect(sim.candidateLocked).toBe(true);
    expect(sim.firstPick?.id).toBe(rice.id);
    expect(sim.qbPoliciesTried).toEqual(QB2_POLICIES);
    expect(qb2).toBeDefined();
    if (sim.qbPolicy !== "punt") {
      expect(qb2!.overallPick).toBeLessThan(174);
    }
  });

  it("does not treat an ADP-unlikely later WR as a certain Jones-branch acquisition", () => {
    const state = fillToPick(16, keepStars);
    const board = withAdp(players, "Rashee Rice", 1);
    const jones = named("Daniel Jones");
    const rice = named("Rashee Rice");
    const sim = simulateCandidateDraft(board, state, jones);
    expect(sim.firstPick?.id).toBe(jones.id);
    expect(sim.roster.some((player) => player.id === rice.id)).toBe(false);
    const riceRow = simulateCandidateDraft(board, state, rice);
    expect(riceRow.roster.some((player) => player.id === rice.id)).toBe(true);
  });

  it("averages matched board scenarios instead of EV-weighting only one later player", () => {
    const state = fillToPick(16, keepStars);
    const jones = named("Daniel Jones");
    const mixed = simulateCandidateDraft(players, state, jones);
    const median = simulateCompletedDraft(players, state, jones, undefined, false, {
      qbPolicy: mixed.qbPolicy,
      scenario: "median",
    });
    expect(mixed.scenarioUtilities.length).toBeGreaterThan(1);
    expect(mixed.laterQb || mixed.laterWr || mixed.laterTe).toBeTruthy();
    const average =
      mixed.scenarioUtilities.reduce((sum, value) => sum + value, 0) /
      mixed.scenarioUtilities.length;
    expect(mixed.utility.utility).toBeCloseTo(average, 5);
    expect(median.candidateLocked).toBe(true);
  });

  it("ranks Rice's availability-aware team without forcing the Round 15 punt pairing", () => {
    const state = fillToPick(16, keepStars);
    const recs = recommend(players, state);
    const rice = recs.find((row) => row.player.player === "Rashee Rice");
    const jones = recs.find((row) => row.player.player === "Daniel Jones");
    expect(rice).toBeDefined();
    expect(jones).toBeDefined();
    expect(rice!.breakdown.lookahead).toBe(true);
    expect(QB2_POLICIES).toContain(rice!.breakdown.laterQbPolicy);
    if (rice!.breakdown.laterQbPolicy !== "punt") {
      expect(rice!.breakdown.laterOverallPick).toBeLessThan(174);
    }
  });
});
