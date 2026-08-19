import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";
import { recommend } from "./recommend.ts";
import { deriveQbCard } from "./qbCard.ts";
import { draftedIds } from "./roster.ts";

const players = loadPlayers();

function named(name: string): Player {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match;
}

function fillToPick(targetPick: number, userPickName = "Christian McCaffrey"): DraftState {
  const keep = new Set([named(userPickName).id]);
  let state: DraftState = initialDraftState;
  const queue = players
    .filter((player) => player.pos !== "K" && player.pos !== "DST" && !keep.has(player.id))
    .sort((a, b) => (a.adp ?? 900) - (b.adp ?? 900) || a.modelRank - b.modelRank);
  let index = 0;
  for (let overall = 1; overall < targetPick; overall += 1) {
    if (overall === 6) {
      state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: named(userPickName).id, draftedBy: "mine" });
      continue;
    }
    const next = queue[index++]!;
    state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: next.id, draftedBy: "other" });
  }
  return state;
}

function everyTeamOnTwoQbs(): DraftState {
  const qbs = players
    .filter((player) => player.pos === "QB" && !player.coverageOnly)
    .sort((a, b) => a.modelRank - b.modelRank)
    .slice(0, 24);
  let state: DraftState = initialDraftState;
  for (const qb of qbs) {
    state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: qb.id, draftedBy: "other" });
  }
  return state;
}

describe("QB card (factual, derived)", { timeout: 90_000 }, () => {
  it("matches the best-QB and best-non-QB row utilities exactly (test 22)", () => {
    const state = fillToPick(19);
    const recs = recommend(players, state);
    const card = deriveQbCard(recs, players, state);
    expect(card).not.toBeNull();

    const evaluated = recs.filter((row) => row.breakdown.lookahead);
    const bestQbRow = evaluated.find((row) => row.player.pos === "QB");
    const bestSkillRow = evaluated.find((row) =>
      ["RB", "WR", "TE"].includes(row.player.pos),
    );
    expect(card!.bestQb?.player.id).toBe(bestQbRow?.player.id);
    expect(card!.bestQb?.utility).toBe(bestQbRow?.breakdown.teamUtility);
    expect(card!.bestSkill?.player.id).toBe(bestSkillRow?.player.id);
    expect(card!.bestSkill?.utility).toBe(bestSkillRow?.breakdown.teamUtility);
    // Edge is exactly the difference of those two completed-team utilities.
    expect(card!.edge).toBeCloseTo(
      (bestQbRow?.breakdown.teamUtility ?? 0) - (bestSkillRow?.breakdown.teamUtility ?? 0),
      6,
    );
  });

  it("reports zero capacity and a guaranteed best QB when opponents are full (test 9)", () => {
    const state = everyTeamOnTwoQbs();
    const recs = recommend(players, state);
    const card = deriveQbCard(recs, players, state);
    expect(card).not.toBeNull();
    expect(card!.capacityToEnd).toBe(0);
    const remainingQbs = players.filter(
      (player) => player.pos === "QB" && !draftedIds(state.picks).has(player.id),
    );
    const bestRemaining = [...remainingQbs].sort(
      (a, b) => b.modelPts - a.modelPts || a.modelRank - b.modelRank,
    )[0];
    expect(card!.guaranteedFloor?.id).toBe(bestRemaining?.id);
    expect(card!.bestAvailableQb?.id).toBe(bestRemaining?.id);
  });

  it("returns null once the user already rosters two QBs", () => {
    let state = initialDraftState;
    state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: named("Josh Allen").id, draftedBy: "mine" });
    state = draftReducer(state, { type: "DRAFT_PLAYER", playerId: named("Lamar Jackson").id, draftedBy: "mine" });
    const recs = recommend(players, state);
    expect(deriveQbCard(recs, players, state)).toBeNull();
  });
});
