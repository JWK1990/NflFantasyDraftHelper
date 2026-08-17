import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { compareQbBranches, forcedQbOverallPick } from "./qbBranch.ts";
import { recommend } from "./recommend.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";

const players = loadPlayers();

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

describe("QB branch comparison", () => {
  it("compares QB now vs wait while the user has fewer than two QBs", () => {
    const comparison = compareQbBranches(players, initialDraftState);
    expect(comparison).not.toBeNull();
    expect(comparison!.qbNow.starterPoints).toBeGreaterThan(0);
    expect(comparison!.wait.starterPoints).toBeGreaterThan(0);
    expect(comparison!.securePool).toBeGreaterThanOrEqual(2);
  });

  it("treats Josh Allen at pick 6 as a special QB-now exception", () => {
    let state = initialDraftState;
    const fillers = players.filter((player) => player.player !== "Josh Allen").slice(0, 5);
    for (const player of fillers) {
      state = draftReducer(state, {
        type: "DRAFT_PLAYER",
        playerId: player.id,
        draftedBy: "other",
      });
    }
    expect(state.picks).toHaveLength(5);
    const comparison = compareQbBranches(players, state);
    expect(comparison?.allenException).toBe(true);
    expect(comparison?.verdict).toBe("qb-now");
  });

  it("forces the best remaining QB at pick 163 with zero user QBs", () => {
    expect(forcedQbOverallPick(163, 0)).toBe(true);
    expect(forcedQbOverallPick(163, 1)).toBe(false);
    expect(forcedQbOverallPick(174, 1)).toBe(true);

    const allen = named("Josh Allen");
    const remainingQbs = players
      .filter((player) => player.pos === "QB" && player.id !== allen.id)
      .sort((a, b) => a.modelRank - b.modelRank);
    const bestRemaining = remainingQbs[0];
    if (!bestRemaining) throw new Error("Expected remaining QBs");

    let state = draft(initialDraftState, allen.player, "other");
    const fillers = players.filter(
      (player) => player.id !== allen.id && player.id !== bestRemaining.id,
    );
    for (const player of fillers.slice(0, 161)) {
      state = draftReducer(state, {
        type: "DRAFT_PLAYER",
        playerId: player.id,
        draftedBy: "other",
      });
    }
    expect(state.picks).toHaveLength(162);
    const recs = recommend(players, state);
    expect(recs[0]?.player.pos).toBe("QB");
    expect(recs[0]?.player.id).toBe(bestRemaining.id);
  });
});
