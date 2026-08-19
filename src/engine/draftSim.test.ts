import { describe, expect, it } from "vitest";
import { LEAGUE } from "../config/leagueSettings.ts";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { simulateCompletedDraft, adpSortValue, marketAdp } from "./draftSim.ts";
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

  it("defers specials from pick 139 but still finishes a legal roster", () => {
    const state = fillUntil(139);
    const sim = simulateCompletedDraft(players, state, null);
    // Feasibility no longer force-pins K at 139 (4 picks left for 3 mandatory
    // slots), so the first pick chases value instead of a zero-point special.
    expect(sim.firstPick?.pos).not.toBe("K");
    expect(sim.firstPick?.pos).not.toBe("DST");
    // Mandatory slots are still completed by the last feasible picks.
    expect(sim.roster.some((player) => player.pos === "K")).toBe(true);
    expect(sim.roster.some((player) => player.pos === "DST")).toBe(true);
    expect(sim.roster.filter((player) => player.pos === "QB").length).toBeGreaterThanOrEqual(1);
  });

  it("uses Superflex consensus ADP for opponent ordering, not ESPN room ADP", () => {
    const bijan = players.find((player) => player.player === "Bijan Robinson");
    if (!bijan) throw new Error("Missing Bijan Robinson");
    expect(marketAdp(bijan)).toBe(bijan.sfConsensusAdp);
    expect(bijan.adp).toBe(bijan.sfConsensusAdp);
    const espnSwapped = { ...bijan, espnRoomAdp: 999, sleeperSfAdp: 999 };
    expect(adpSortValue(espnSwapped)).toBe(adpSortValue(bijan));
    const sfShifted = { ...bijan, sfConsensusAdp: 80, adp: 80 };
    expect(adpSortValue(sfShifted)).toBeGreaterThan(adpSortValue(bijan));
  });
});
