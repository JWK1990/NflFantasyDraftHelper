import { describe, expect, it } from "vitest";
import { LEAGUE } from "../config/leagueSettings.ts";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { simulateCompletedDraft } from "./draftSim.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";

const players = loadPlayers();

function fillUntil(targetPick: number, prefer: Player[] = []): DraftState {
  let state = initialDraftState;
  const used = new Set<string>();
  const queue = [
    ...prefer,
    ...players.filter(
      (player) =>
        player.pos !== "K" &&
        player.pos !== "DST" &&
        !prefer.some((row) => row.id === player.id),
    ),
  ];
  for (let overall = 1; overall < targetPick; overall += 1) {
    const next = queue.find((player) => !used.has(player.id));
    if (!next) throw new Error(`Ran out of players before pick ${targetPick}`);
    used.add(next.id);
    state = draftReducer(state, {
      type: "DRAFT_PLAYER",
      playerId: next.id,
      draftedBy: "other",
    });
  }
  return state;
}

describe("draft simulation", () => {
  it("caps every opponent at two QBs and reserves them a K and D/ST", () => {
    const sim = simulateCompletedDraft(players, initialDraftState, null);
    for (let slot = 1; slot <= LEAGUE.teams; slot += 1) {
      expect(sim.qbBySlot[slot], `QB cap slot ${slot}`).toBeLessThanOrEqual(2);
      expect(sim.kBySlot[slot], `K slot ${slot}`).toBe(1);
      expect(sim.dstBySlot[slot], `DST slot ${slot}`).toBe(1);
    }
  });

  it("completes a QB-wait from pick 139 with K, DST, and a legal QB1 (no forced QB2)", () => {
    const state = fillUntil(139);
    const sim = simulateCompletedDraft(players, state, null, undefined, true);
    expect(sim.firstPick?.pos).toBe("K");
    expect(sim.roster.some((player) => player.pos === "K")).toBe(true);
    expect(sim.roster.some((player) => player.pos === "DST")).toBe(true);
    // QB1 remains a legal requirement; QB2 is never forced by the wait branch.
    // (Only the last four user picks remain here, so the user roster is small.)
    expect(sim.roster.filter((player) => player.pos === "QB").length).toBe(1);
  });
});
