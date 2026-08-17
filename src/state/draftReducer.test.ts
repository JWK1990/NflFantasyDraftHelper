import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { playersById, rosterCounts } from "../engine/roster.ts";
import { draftReducer, initialDraftState } from "./draftReducer.ts";

const players = loadPlayers();
const byId = playersById(players);

function playerId(name: string): string {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match.id;
}

describe("draftReducer", () => {
  it("Other removes a player without changing the user's roster", () => {
    const bijan = playerId("Bijan Robinson");
    const state = draftReducer(initialDraftState, {
      type: "DRAFT_PLAYER",
      playerId: bijan,
      draftedBy: "other",
    });
    expect(state.picks).toHaveLength(1);
    expect(state.picks[0]?.draftedBy).toBe("other");
    expect(rosterCounts(state.picks, byId).RB).toBe(0);
    expect(rosterCounts(state.picks, byId).total).toBe(0);
  });

  it("Mine removes a player and updates roster coverage", () => {
    const bijan = playerId("Bijan Robinson");
    const state = draftReducer(initialDraftState, {
      type: "DRAFT_PLAYER",
      playerId: bijan,
      draftedBy: "mine",
    });
    const counts = rosterCounts(state.picks, byId);
    expect(state.picks[0]?.draftedBy).toBe("mine");
    expect(counts.RB).toBe(1);
    expect(counts.total).toBe(1);
  });

  it("Undo restores the player, pick number, and roster", () => {
    const bijan = playerId("Bijan Robinson");
    const gibbs = playerId("Jahmyr Gibbs");
    let state = draftReducer(initialDraftState, {
      type: "DRAFT_PLAYER",
      playerId: bijan,
      draftedBy: "mine",
    });
    state = draftReducer(state, {
      type: "DRAFT_PLAYER",
      playerId: gibbs,
      draftedBy: "other",
    });
    expect(state.picks).toHaveLength(2);
    state = draftReducer(state, { type: "UNDO_LAST_PICK" });
    expect(state.picks).toHaveLength(1);
    expect(state.picks[0]?.playerId).toBe(bijan);
    expect(rosterCounts(state.picks, byId).RB).toBe(1);
    state = draftReducer(state, { type: "UNDO_LAST_PICK" });
    expect(state.picks).toHaveLength(0);
    expect(rosterCounts(state.picks, byId).total).toBe(0);
  });

  it("refuses to draft an already-drafted player", () => {
    const bijan = playerId("Bijan Robinson");
    const first = draftReducer(initialDraftState, {
      type: "DRAFT_PLAYER",
      playerId: bijan,
      draftedBy: "other",
    });
    const second = draftReducer(first, {
      type: "DRAFT_PLAYER",
      playerId: bijan,
      draftedBy: "mine",
    });
    expect(second.picks).toHaveLength(1);
    expect(second.picks[0]?.draftedBy).toBe("other");
  });
});
