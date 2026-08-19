import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState } from "../domain/types.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";
import { buildTeamStates } from "./teams.ts";
import { guaranteedQbFloor, opponentQbCapacityBefore } from "./qbCapacity.ts";
import { returnProbability } from "./draftSim.ts";
import { draftedIds } from "./roster.ts";

const players = loadPlayers();

/**
 * Draft the first 24 QBs (by model rank) across overalls 1..24. Rounds 1-2 of a
 * 12-team snake cover every draft slot exactly twice, so every team ends with 2
 * QBs and opponent QB capacity is exhausted.
 */
function boardWithEveryTeamOnTwoQbs(): DraftState {
  const qbs = players
    .filter((player) => player.pos === "QB")
    .sort((a, b) => a.modelRank - b.modelRank)
    .slice(0, 24);
  let state: DraftState = initialDraftState;
  for (const qb of qbs) {
    state = draftReducer(state, {
      type: "DRAFT_PLAYER",
      playerId: qb.id,
      draftedBy: "other",
    });
  }
  return state;
}

describe("QB capacity — engine integration", () => {
  it("reports zero opponent QB capacity once every team holds two QBs (tests 7)", () => {
    const state = boardWithEveryTeamOnTwoQbs();
    expect(state.picks).toHaveLength(24);
    const teams = buildTeamStates(state.picks, players);
    for (const team of teams) {
      expect(team.counts.QB).toBe(2);
    }
    expect(opponentQbCapacityBefore(teams, 25, 174)).toBe(0);
  });

  it("guarantees 100% availability for every remaining QB when capacity is zero (tests 8, 13)", () => {
    const state = boardWithEveryTeamOnTwoQbs();
    const taken = draftedIds(state.picks);
    const available = players.filter((player) => !taken.has(player.id));
    const remainingQbs = available.filter((player) => player.pos === "QB");
    expect(remainingQbs.length).toBeGreaterThan(0);

    // Current pick is 25; the user's next pick is 30.
    for (const qb of remainingQbs.slice(0, 4)) {
      const survival = returnProbability(qb, available, 25, 30, { players, state });
      expect(survival).toBe(1);
    }
  });

  it("guarantees the best remaining QB as the hard floor when capacity is zero (test 9 basis)", () => {
    const state = boardWithEveryTeamOnTwoQbs();
    const taken = draftedIds(state.picks);
    const remainingQbs = players.filter(
      (player) => player.pos === "QB" && !taken.has(player.id),
    );
    const floor = guaranteedQbFloor(remainingQbs, 0);
    expect(floor.guaranteedFloor).not.toBeNull();
    expect(floor.guaranteedCount).toBe(remainingQbs.length);
  });
});
