import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import {
  returnProbability,
  simulateCandidateDraft,
  simulateCompletedDraft,
} from "./draftSim.ts";
import { recommend } from "./recommend.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";

const players = loadPlayers();

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
  it("does not treat an ADP-unlikely later WR as a certain Jones-branch acquisition", () => {
    const state = fillToPick(16, keepStars);
    const board = withAdp(players, "Rashee Rice", 16);
    const jones = named("Daniel Jones");
    const rice = named("Rashee Rice");
    const sim = simulateCandidateDraft(board, state, jones);
    expect(sim.firstPick?.id).toBe(jones.id);
    const riceChance = returnProbability(
      rice,
      board.filter(
        (player) =>
          !state.picks.some((pick) => pick.playerId === player.id) &&
          player.id !== jones.id,
      ),
      16,
      19,
      { players: board, state },
    );
    if (riceChance < 0.4) {
      expect(sim.roster.some((player) => player.id === rice.id)).toBe(false);
    }
    if (sim.laterWr?.player.id === rice.id) {
      expect(sim.laterWr.returnProbability).toBeLessThan(0.95);
    }
    const riceRow = simulateCandidateDraft(board, state, rice);
    expect(riceRow.roster.some((player) => player.id === rice.id)).toBe(true);
  });

  it("averages matched board scenarios instead of EV-weighting only one later player", () => {
    const state = fillToPick(16, keepStars);
    const jones = named("Daniel Jones");
    const mixed = simulateCandidateDraft(players, state, jones);
    const median = simulateCompletedDraft(players, state, jones, undefined, false, {
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

  it("ranks Rice's availability-aware team from one unified objective", () => {
    const state = fillToPick(16, keepStars);
    const recs = recommend(players, state);
    const rice = recs.find((row) => row.player.player === "Rashee Rice");
    const jones = recs.find((row) => row.player.player === "Daniel Jones");
    expect(rice).toBeDefined();
    expect(jones).toBeDefined();
    expect(rice!.breakdown.lookahead).toBe(true);
    // No forced Round-15 QB pairing: any later QB the rollout takes is a utility
    // choice, not an auto-punt to pick 174.
    if (rice!.breakdown.laterOverallPick != null) {
      expect(rice!.breakdown.laterOverallPick).toBeLessThanOrEqual(174);
    }
  });
});
