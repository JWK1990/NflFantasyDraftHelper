import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";
import { recommend } from "./recommend.ts";
import { simulateCandidateDraft } from "./draftSim.ts";
import { upperBoundUtility } from "./promotion.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { eligiblePlayers } from "./eligibility.ts";
import { LEAGUE } from "../config/leagueSettings.ts";

const players = loadPlayers();
const byId = playersById(players);

function fillToPick(targetPick: number, userPickName = "Josh Allen"): DraftState {
  const keepId = players.find((p) => p.player === userPickName)!.id;
  let state: DraftState = initialDraftState;
  const queue = players
    .filter((p) => p.pos !== "K" && p.pos !== "DST" && p.id !== keepId)
    .sort((a, b) => (a.adp ?? 900) - (b.adp ?? 900) || a.modelRank - b.modelRank);
  let index = 0;
  for (let overall = 1; overall < targetPick; overall += 1) {
    if (overall === 6) {
      state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: keepId, draftedBy: "mine" });
      continue;
    }
    state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: queue[index++]!.id, draftedBy: "other" });
  }
  return state;
}

describe("adaptive full-simulation promotion (§7)", () => {
  it("upper bound is sound: it never underestimates the full-sim utility (§33 basis)", () => {
    const state = fillToPick(16);
    const roster = myRosterPlayers(state.picks, byId);
    const counts = rosterCounts(state.picks, byId);
    const remaining = Math.max(0, LEAGUE.rosterSize - counts.total);
    const eligible = eligiblePlayers(players, state.picks, counts, 16);
    const sortedAvailable = [...eligible].sort((a, b) => b.modelPts - a.modelPts);
    const sample: Player[] = [
      players.find((p) => p.player === "Nico Collins")!,
      players.find((p) => p.player === "Rashee Rice")!,
      players.find((p) => p.player === "Daniel Jones")!,
    ];
    for (const candidate of sample) {
      const bound = upperBoundUtility(roster, candidate, sortedAvailable, remaining);
      const sim = simulateCandidateDraft(players, state, candidate);
      expect(bound).toBeGreaterThanOrEqual(sim.utility.utility - 1e-6);
    }
  });

  it("the actionable top rows are all comparable full simulations (§32)", () => {
    const recs = recommend(players, fillToPick(16));
    for (const row of recs.slice(0, 15)) {
      expect(row.breakdown.lookahead).toBe(true);
    }
  });

  it("keeps full-simulation and approximate rows in two clean classes — no arbitrary −4000 (§30/§31)", () => {
    const recs = recommend(players, fillToPick(16));
    const lastFullSim = recs.reduce(
      (acc, row, index) => (row.breakdown.lookahead ? index : acc),
      -1,
    );
    const firstApprox = recs.findIndex((row) => !row.breakdown.lookahead);
    if (firstApprox >= 0 && lastFullSim >= 0) {
      // Every full-simulation row ranks above every approximate row...
      expect(lastFullSim).toBeLessThan(firstApprox);
    }
    // ...and no row is demoted by a fixed −4000 offset from its own utility.
    for (const row of recs) {
      expect(row.dynamicScore).not.toBeCloseTo(row.breakdown.teamUtility - 4000, 3);
    }
  });
});
