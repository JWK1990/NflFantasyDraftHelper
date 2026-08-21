import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { simulateCompletedDraft } from "./draftSim.ts";
import { recommend } from "./recommend.ts";
import { myRosterPlayers, playersById, rosterCounts } from "./roster.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";

const players = loadPlayers();
const byId = playersById(players);

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

function withAdp(board: Player[], name: string, adp: number): Player[] {
  const id = named(name).id;
  return board.map((player) =>
    player.id === id ? { ...player, adp, sfConsensusAdp: adp } : player,
  );
}

function fillToPick(
  targetPick: number,
  keepNames: string[],
  userRb = "Christian McCaffrey",
): DraftState {
  const keep = new Set(keepNames.map((name) => named(name).id));
  const userPick = named(userRb);
  keep.add(userPick.id);
  let state = initialDraftState;
  const queue = players
    .filter(
      (player) =>
        player.pos !== "K" &&
        player.pos !== "DST" &&
        !keep.has(player.id),
    )
    .sort((a, b) => (a.adp ?? 900) - (b.adp ?? 900) || a.modelRank - b.modelRank);
  let index = 0;
  for (let overall = 1; overall < targetPick; overall += 1) {
    if (overall === 6) {
      state = draft(state, userRb, "mine");
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

const keepStars = ["Jonathan Taylor", "Trey McBride", "De'Von Achane"];

describe("candidate lock", { timeout: 90_000 }, () => {
  it("keeps Jonathan Taylor on his completed roster at pick 16 even if ADP is before 19", () => {
    const state = fillToPick(16, keepStars);
    expect(state.picks).toHaveLength(15);
    const taylor = named("Jonathan Taylor");
    const sim = simulateCompletedDraft(players, state, taylor);
    expect(sim.candidateLocked).toBe(true);
    expect(sim.firstPick?.id).toBe(taylor.id);
    expect(sim.roster.some((player) => player.id === taylor.id)).toBe(true);
  });

  it("keeps Trey McBride on his completed roster at pick 16 with an empty TE slot", () => {
    const state = fillToPick(16, keepStars);
    const counts = rosterCounts(state.picks, byId);
    expect(counts.TE).toBe(0);
    const mcbride = named("Trey McBride");
    const sim = simulateCompletedDraft(players, state, mcbride);
    expect(sim.candidateLocked).toBe(true);
    expect(sim.firstPick?.id).toBe(mcbride.id);
    expect(sim.roster.some((player) => player.id === mcbride.id)).toBe(true);
  });

  it("keeps Achane on his completed roster rather than an RB fallback", () => {
    const state = fillToPick(16, keepStars);
    const achane = named("De'Von Achane");
    const sim = simulateCompletedDraft(players, state, achane);
    expect(sim.firstPick?.id).toBe(achane.id);
    expect(sim.roster.some((player) => player.id === achane.id)).toBe(true);
  });

  it("lets Taylor ADP change the availability badge without dropping Taylor from his evaluation", () => {
    const state = fillToPick(16, keepStars);
    const shifted = withAdp(players, "Jonathan Taylor", 1);
    const taylor = shifted.find((player) => player.player === "Jonathan Taylor");
    if (!taylor) throw new Error("Missing Taylor");
    const sim = simulateCompletedDraft(shifted, state, taylor);
    expect(sim.roster.some((player) => player.id === taylor.id)).toBe(true);

    const recs = recommend(shifted, state);
    const row = recs.find((item) => item.player.player === "Jonathan Taylor");
    expect(row).toBeDefined();
    expect(
      row!.reasons.some((reason) => reason.startsWith("Unlikely at pick 19")),
    ).toBe(true);
  });

  it("does not let intervening simulated opponents take the reserved candidate", () => {
    const state = fillToPick(16, keepStars);
    const taylor = { ...named("Jonathan Taylor"), adp: 1, sfConsensusAdp: 1 };
    const board = withAdp(players, "Jonathan Taylor", 1);
    const sim = simulateCompletedDraft(board, state, taylor);
    expect(sim.firstPick?.id).toBe(taylor.id);
    expect(sim.candidateLocked).toBe(true);
  });

  it("removes a player from the list after Other is recorded in the real draft", () => {
    const state = fillToPick(16, keepStars);
    const before = recommend(players, state);
    expect(before.some((row) => row.player.player === "Jonathan Taylor")).toBe(true);
    const after = recommend(players, draft(state, "Jonathan Taylor", "other"));
    expect(after.some((row) => row.player.player === "Jonathan Taylor")).toBe(false);
  });

  it("adds the candidate immediately on the user's pick 19 before later opponent picks", () => {
    const state = fillToPick(19, keepStars);
    expect(state.picks).toHaveLength(18);
    const roster = myRosterPlayers(state.picks, byId);
    expect(roster).toHaveLength(1);
    const taylor = named("Jonathan Taylor");
    const sim = simulateCompletedDraft(players, state, taylor);
    expect(sim.firstPick?.id).toBe(taylor.id);
    expect(sim.roster[1]?.id).toBe(taylor.id);
  });

  it("does not score two candidate rows from the same fallback selection", () => {
    const state = fillToPick(16, keepStars);
    const taylor = named("Jonathan Taylor");
    const mcbride = named("Trey McBride");
    const achane = named("De'Von Achane");
    const taylorSim = simulateCompletedDraft(players, state, taylor);
    const mcbrideSim = simulateCompletedDraft(players, state, mcbride);
    const achaneSim = simulateCompletedDraft(players, state, achane);
    expect(taylorSim.firstPick?.id).toBe(taylor.id);
    expect(mcbrideSim.firstPick?.id).toBe(mcbride.id);
    expect(achaneSim.firstPick?.id).toBe(achane.id);
    expect(new Set([taylorSim.firstPick?.id, mcbrideSim.firstPick?.id, achaneSim.firstPick?.id]).size).toBe(3);
  });

  it("may rank Achane above Taylor only when Achane's locked team is actually stronger", () => {
    const state = fillToPick(16, keepStars);
    const recs = recommend(players, state);
    const taylor = recs.find((row) => row.player.player === "Jonathan Taylor");
    const achane = recs.find((row) => row.player.player === "De'Von Achane");
    expect(taylor).toBeDefined();
    expect(achane).toBeDefined();
    const taylorSim = simulateCompletedDraft(players, state, named("Jonathan Taylor"));
    expect(taylorSim.roster.some((player) => player.player === "Jonathan Taylor")).toBe(true);
    if (achane!.dynamicScore > taylor!.dynamicScore) {
      expect(achane!.breakdown.lookahead).toBe(true);
      expect(taylor!.breakdown.lookahead).toBe(true);
    }
  });

  it("targets availability badges at pick 19 during opponent turns and pick 30 on the user's turn", () => {
    const chips = (recs: ReturnType<typeof recommend>, prefix: string) =>
      recs.flatMap((row) => row.reasons.filter((reason) => reason.startsWith(prefix)));

    const at16 = recommend(players, fillToPick(16, keepStars));
    const unlikely16 = chips(at16, "Unlikely at pick");
    const likely16 = chips(at16, "Likely at pick");
    expect(unlikely16.length + likely16.length).toBeGreaterThan(0);
    expect(unlikely16.every((reason) => reason.includes("pick 19"))).toBe(true);
    expect(likely16.every((reason) => reason.includes("pick 19"))).toBe(true);

    const at19 = recommend(players, fillToPick(19, keepStars));
    const unlikely19 = chips(at19, "Unlikely at pick");
    const likely19 = chips(at19, "Likely at pick");
    expect(unlikely19.length + likely19.length).toBeGreaterThan(0);
    expect(unlikely19.every((reason) => reason.includes("pick 30"))).toBe(true);
    expect(likely19.every((reason) => reason.includes("pick 30"))).toBe(true);
  });

  it("ranks the first row by the highest conditional completed-team utility at pick 16", () => {
    const recs = recommend(players, fillToPick(16, keepStars));
    const best = Math.max(...recs.map((row) => row.dynamicScore));
    expect(recs[0]?.dynamicScore).toBe(best);
    expect(recs[0]?.breakdown.lookahead).toBe(true);
  });
});
