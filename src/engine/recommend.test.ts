import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { remainingByPosTier, currentEdgeTiers, tierCliffBonus } from "./tierScarcity.ts";
import { recommend } from "./recommend.ts";
import { rbStarterNeed } from "./rosterNeed.ts";
import { playersById, rosterCounts } from "./roster.ts";
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

function rankOf(recs: ReturnType<typeof recommend>, name: string): number {
  return recs.findIndex((row) => row.player.player === name);
}

describe("recommendation engine", () => {
  it("never returns a drafted player", () => {
    const state = draft(initialDraftState, "Bijan Robinson", "other");
    const recs = recommend(players, state);
    expect(recs.some((row) => row.player.player === "Bijan Robinson")).toBe(false);
  });

  it("keeps the empty-roster board close to the static Superflex model", () => {
    const recs = recommend(players, initialDraftState);
    expect(recs[0]?.player.player).toBe("Josh Allen");
    expect(rankOf(recs, "Bijan Robinson")).toBeLessThan(rankOf(recs, "Lamar Jackson"));
    expect(rankOf(recs, "Jahmyr Gibbs")).toBeLessThan(rankOf(recs, "Lamar Jackson"));
    expect(rankOf(recs, "Puka Nacua")).toBeLessThan(rankOf(recs, "Lamar Jackson"));
    expect(recs.find((row) => row.player.player === "Lamar Jackson")?.breakdown.qbTiming).toBe(0);
  });

  it("removes remaining QBs after two user QBs", () => {
    let state = draft(initialDraftState, "Josh Allen", "mine");
    state = draft(state, "Lamar Jackson", "mine");
    const recs = recommend(players, state);
    expect(recs.every((row) => row.player.pos !== "QB")).toBe(true);
  });

  it("drops RB starter-need after two user RBs but keeps RBs eligible", () => {
    let state = draft(initialDraftState, "Bijan Robinson", "mine");
    state = draft(state, "Jahmyr Gibbs", "mine");
    const counts = rosterCounts(state.picks, byId);
    expect(rbStarterNeed(counts)).toBe(0);
    const recs = recommend(players, state);
    const cmc = recs.find((row) => row.player.player === "Christian McCaffrey");
    expect(cmc).toBeDefined();
    expect(cmc!.breakdown.coveragePressure).toBe(0);
    expect(cmc!.breakdown.lineupDelta).toBeGreaterThan(0);
  });

  it("gives empty WR slots a coverage edge without letting a weak WR pass McCaffrey", () => {
    let state = draft(initialDraftState, "Bijan Robinson", "mine");
    state = draft(state, "Jahmyr Gibbs", "mine");
    const recs = recommend(players, state);
    const cmc = recs.find((row) => row.player.player === "Christian McCaffrey");
    const chase = recs.find((row) => row.player.player === "Ja'Marr Chase");
    const weakWr = recs.find((row) => row.player.player === "Dontayvion Wicks");
    expect(cmc).toBeDefined();
    expect(chase).toBeDefined();
    expect(weakWr).toBeDefined();
    expect(chase!.breakdown.coveragePressure).toBeGreaterThan(cmc!.breakdown.coveragePressure);
    expect(weakWr!.dynamicScore).toBeLessThan(cmc!.dynamicScore);
  });

  it("scores last-in-tier only by the drop to the next tier, not by headcount", () => {
    const allen = named("Josh Allen");
    const jsn = named("Jaxon Smith-Njigba");
    expect(tierCliffBonus(allen, players)).toBeGreaterThan(0);
    expect(tierCliffBonus(jsn, players)).toBe(0);
  });

  it("does not manufacture early QB2 need in adaptive-punt with similar secure QBs", () => {
    const state = draft(initialDraftState, "Josh Allen", "mine");
    const punt = recommend(players, { ...state, qb2Mode: "adaptive-punt" });
    const normal = recommend(players, { ...state, qb2Mode: "normal" });
    const lamarPunt = punt.find((row) => row.player.player === "Lamar Jackson");
    const lamarNormal = normal.find((row) => row.player.player === "Lamar Jackson");
    expect(lamarPunt).toBeDefined();
    expect(lamarNormal).toBeDefined();
    expect(lamarPunt!.breakdown.qbTiming).toBeLessThan(lamarNormal!.breakdown.qbTiming);
    expect(lamarPunt!.reasons.some((reason) => reason.startsWith("QB2 can wait"))).toBe(true);
  });

  it("ranks the best eligible QB first at pick 174 with only one user QB", () => {
    const allen = named("Josh Allen");
    const remainingQbs = players
      .filter((player) => player.pos === "QB" && player.id !== allen.id)
      .sort((a, b) => a.modelRank - b.modelRank);
    const bestRemaining = remainingQbs[0];
    if (!bestRemaining) throw new Error("Expected remaining QBs");

    let state = draft(initialDraftState, allen.player, "mine");
    const fillers = players.filter(
      (player) => player.id !== allen.id && player.id !== bestRemaining.id,
    );
    for (const player of fillers.slice(0, 172)) {
      state = draftReducer(state, {
        type: "DRAFT_PLAYER",
        playerId: player.id,
        draftedBy: "other",
      });
    }
    expect(state.picks).toHaveLength(173);
    const recs = recommend(players, state);
    expect(recs[0]?.player.pos).toBe("QB");
    expect(recs[0]?.player.id).toBe(bestRemaining.id);
  });

  it("flags players ADP says will be gone before the next user pick", () => {
    let state = initialDraftState;
    const fillers = [...players]
      .filter(
        (player) =>
          player.player !== "Jaxon Smith-Njigba" &&
          player.player !== "Puka Nacua" &&
          player.adp != null,
      )
      .sort((a, b) => (a.adp ?? 0) - (b.adp ?? 0))
      .slice(0, 5);
    for (const player of fillers) {
      state = draft(state, player.player, "other");
    }
    expect(state.picks).toHaveLength(5);

    const recs = recommend(players, state);
    const jsn = recs.find((row) => row.player.player === "Jaxon Smith-Njigba");
    const puka = recs.find((row) => row.player.player === "Puka Nacua");
    expect(jsn).toBeDefined();
    expect(puka).toBeDefined();
    expect(
      jsn!.reasons.some((reason) => reason.startsWith("unlikely to be available")),
    ).toBe(true);
    expect(jsn!.reasons).not.toContain("big drop if you pass (VONA)");
    expect(
      puka!.reasons.some((reason) => reason.startsWith("unlikely to be available")),
    ).toBe(true);
    expect(puka!.reasons).toContain("big drop if you pass (VONA)");
  });

  it("suppresses K and D/ST before the configured late rounds", () => {
    const recs = recommend(players, initialDraftState);
    expect(recs.every((row) => row.player.pos !== "K" && row.player.pos !== "DST")).toBe(
      true,
    );
  });

  it("gives every promoted player at least one reason", () => {
    const recs = recommend(players, initialDraftState).slice(0, 20);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((row) => row.reasons.length >= 1)).toBe(true);
  });
});

describe("current edge tiers", () => {
  it("advances from QB T1 to QB T2 after the last T1 QB is drafted", () => {
    const before = currentEdgeTiers(remainingByPosTier(players));
    expect(before.find((tier) => tier.pos === "QB")).toEqual({
      pos: "QB",
      posTier: 1,
      left: 1,
    });

    const remaining = players.filter((player) => player.player !== "Josh Allen");
    const after = currentEdgeTiers(remainingByPosTier(remaining));
    const qb = after.find((tier) => tier.pos === "QB");
    expect(qb?.posTier).toBe(2);
    expect(qb?.left).toBeGreaterThan(0);
  });
});
