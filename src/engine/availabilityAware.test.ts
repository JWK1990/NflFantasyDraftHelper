import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import {
  adpWindowIds,
  opponentPicksBetween,
  returnProbability,
  simulateCandidateDraft,
  simulateCompletedDraft,
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

describe("availability-aware rest-of-draft", () => {
  it("uses the same ADP window for chips and opponent consumption", () => {
    const state = fillToPick(16, keepStars);
    const counts = rosterCounts(state.picks, byId);
    const eligible = eligiblePlayers(players, state.picks, counts, 16, RECOMMENDATION_CONFIG);
    const next = nextUserPickAfter(16);
    expect(next).toBe(19);
    expect(likelyGoneByNextTurn(eligible, 16)).toEqual(
      adpWindowIds(eligible, opponentPicksBetween(16, 19)),
    );
  });

  it("lets a WR row take a QB2 at the next pick instead of auto-punting to 174", () => {
    const state = fillToPick(16, keepStars);
    const rice = named("Rashee Rice");
    const sim = simulateCandidateDraft(players, state, rice);
    const qb2 = sim.acquisitions.find(
      (row) => row.player.pos === "QB" && row.player.player !== "Josh Allen",
    );
    expect(sim.candidateLocked).toBe(true);
    expect(sim.firstPick?.id).toBe(rice.id);
    expect(qb2).toBeDefined();
    expect(qb2!.overallPick).toBeLessThan(174);
    expect(sim.qbPolicy).toBe("qb-next");
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

  it("weights a mid-probability later acquisition instead of counting it at 100%", () => {
    const state = fillToPick(16, keepStars);
    const jones = named("Daniel Jones");
    const probe = simulateCompletedDraft(players, state, jones, undefined, false, {
      qbPolicy: "flex",
    });
    const later = probe.acquisitions.find(
      (row) => row.player.pos === "WR" && row.player.id !== jones.id,
    );
    expect(later).toBeDefined();
    const taken = new Set(state.picks.map((pick) => pick.playerId));
    const available = players.filter(
      (player) => !taken.has(player.id) && player.id !== jones.id,
    );
    const chance = returnProbability(
      later!.player,
      available,
      16,
      later!.overallPick,
    );
    const survive = simulateCompletedDraft(players, state, jones, undefined, false, {
      qbPolicy: "flex",
      protectUntilPick: {
        playerId: later!.player.id,
        overallPick: later!.overallPick,
      },
      forcePick: { playerId: later!.player.id, overallPick: later!.overallPick },
    });
    const gone = simulateCompletedDraft(players, state, jones, undefined, false, {
      qbPolicy: "flex",
      removeIds: [later!.player.id],
    });
    const mixed = simulateCandidateDraft(players, state, jones);
    if (chance > 0.1 && chance < 0.9) {
      const expected =
        chance * survive.utility.utility + (1 - chance) * gone.utility.utility;
      expect(mixed.utility.utility).toBeCloseTo(expected, 5);
      expect(mixed.laterAcquisition?.returnProbability).toBeCloseTo(chance, 5);
    } else if (chance >= 0.9) {
      expect(mixed.utility.utility).toBeCloseTo(probe.utility.utility, 5);
    } else {
      expect(mixed.utility.utility).toBeCloseTo(gone.utility.utility, 5);
    }
  });

  it("ranks Rice's availability-aware team without forcing the Round 15 punt pairing", () => {
    const state = fillToPick(16, keepStars);
    const recs = recommend(players, state);
    const rice = recs.find((row) => row.player.player === "Rashee Rice");
    const jones = recs.find((row) => row.player.player === "Daniel Jones");
    expect(rice).toBeDefined();
    expect(jones).toBeDefined();
    expect(rice!.breakdown.lookahead).toBe(true);
    expect(rice!.breakdown.laterQbPolicy).toBe("qb-next");
    expect(rice!.breakdown.laterOverallPick).toBeLessThan(174);
    expect(rice!.breakdown.laterPlayer).not.toBe("Bryce Young");
  });
});
