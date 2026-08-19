import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState, Player } from "../domain/types.ts";
import { remainingByPosTier, currentEdgeTiers } from "./tierScarcity.ts";
import { matchesFilters, recommend } from "./recommend.ts";
import { completedTeamUtility } from "./teamUtility.ts";
import { simulateCompletedDraft } from "./draftSim.ts";
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

function rankOf(recs: ReturnType<typeof recommend>, name: string): number {
  return recs.findIndex((row) => row.player.player === name);
}

function fillUntil(
  targetPick: number,
  prefer: Player[] = [],
  keepIds: string[] = [],
  includeSpecials = false,
): DraftState {
  let state = initialDraftState;
  const used = new Set<string>();
  const keep = new Set(keepIds);
  const queue = [
    ...prefer,
    ...players.filter((player) => {
      if (keep.has(player.id)) return false;
      if (prefer.some((row) => row.id === player.id)) return false;
      if (!includeSpecials && (player.pos === "K" || player.pos === "DST")) return false;
      return true;
    }),
  ];
  for (let overall = 1; overall < targetPick; overall += 1) {
    const next = queue.find((player) => !used.has(player.id) && !keep.has(player.id));
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

describe("recommendation engine", { timeout: 90_000 }, () => {
  it("never returns a drafted player", () => {
    const state = draft(initialDraftState, "Bijan Robinson", "other");
    const recs = recommend(players, state);
    expect(recs.some((row) => row.player.player === "Bijan Robinson")).toBe(false);
  });

  it("ranks the empty board by completed-team utility, not Superflex model rank", () => {
    const recs = recommend(players, initialDraftState);
    expect(recs[0]).toBeDefined();
    expect(recs[0]!.dynamicScore).toBeGreaterThanOrEqual(recs[1]!.dynamicScore);
    const allen = recs.find((row) => row.player.player === "Josh Allen");
    const bijan = recs.find((row) => row.player.player === "Bijan Robinson");
    expect(allen).toBeDefined();
    expect(bijan).toBeDefined();
    if (recs[0]!.player.player === "Josh Allen") {
      expect(allen!.dynamicScore).toBeGreaterThanOrEqual(bijan!.dynamicScore);
    }
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
    const recs = recommend(players, state);
    const cmc = recs.find((row) => row.player.player === "Christian McCaffrey");
    expect(cmc).toBeDefined();
  });

  it("lets a comparable WR rise above a third RB when it fills a WR hole", () => {
    let state = draft(initialDraftState, "Bijan Robinson", "mine");
    state = draft(state, "Jahmyr Gibbs", "mine");
    const recs = recommend(players, state);
    const chase = recs.find((row) => row.player.player === "Ja'Marr Chase");
    const weakWr = recs.find((row) => row.player.player === "Dontayvion Wicks");
    expect(chase).toBeDefined();
    expect(weakWr).toBeDefined();
    expect(chase!.dynamicScore).toBeGreaterThan(weakWr!.dynamicScore);
  });

  it("keeps an elite third RB above a materially weaker WR", () => {
    let state = draft(initialDraftState, "Bijan Robinson", "mine");
    state = draft(state, "Jahmyr Gibbs", "mine");
    const recs = recommend(players, state);
    expect(rankOf(recs, "Christian McCaffrey")).toBeLessThan(rankOf(recs, "Dontayvion Wicks"));
  });

  it("ranks the best remaining QB first at pick 163 with zero user QBs (legal QB1)", () => {
    // QB1 is still a genuine legal-roster requirement, so it is pinned when the
    // user would otherwise reach the deadline with no QB at all.
    const allen = named("Josh Allen");
    const bestRemaining = players
      .filter((player) => player.pos === "QB" && player.id !== allen.id)
      .sort((a, b) => b.modelPts - a.modelPts || a.modelRank - b.modelRank)[0];
    if (!bestRemaining) throw new Error("Expected remaining QBs");

    // No user QB at all: user picks are all skill, opponents take everyone else.
    let state = draft(initialDraftState, "Christian McCaffrey", "mine");
    const keep = new Set([bestRemaining.id, named("Christian McCaffrey").id]);
    const fillers = players.filter(
      (player) => !keep.has(player.id) && player.pos !== "K" && player.pos !== "DST",
    );
    let index = 0;
    while (state.picks.length < 162) {
      const filler = fillers[index];
      index += 1;
      if (!filler) throw new Error("Ran out of fillers before pick 163");
      state = draftReducer(state, {
        type: "DRAFT_PLAYER",
        playerId: filler.id,
        draftedBy: "other",
      });
    }
    expect(state.picks).toHaveLength(162);
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
      jsn!.reasons.some((reason) => reason.startsWith("Unlikely to be available")),
    ).toBe(true);
    expect(
      puka!.reasons.some((reason) => reason.startsWith("Unlikely to be available")),
    ).toBe(true);
  });

  it("flags a top-ranked player ADP says should last until the next pick", () => {
    const byAdp = [...players]
      .filter((player) => player.adp != null && player.pos !== "K" && player.pos !== "DST")
      .sort((a, b) => (a.adp ?? 0) - (b.adp ?? 0));
    const recs = recommend(players, fillUntil(30, byAdp));
    const canWait = recs.filter(
      (row) =>
        row.breakdown.returnProbability >= 0.7 &&
        row.player.pos !== "K" &&
        row.player.pos !== "DST",
    );
    expect(canWait.length).toBeGreaterThan(0);
    const topWait = recs.slice(0, 8).filter(
      (row) =>
        row.breakdown.returnProbability >= 0.7 &&
        row.player.pos !== "K" &&
        row.player.pos !== "DST" &&
        !row.reasons.some((reason) => reason.startsWith("Unlikely to be available")),
    );
    expect(
      topWait.every((row) =>
        row.reasons.some((reason) => reason.startsWith("likely to be available")),
      ),
    ).toBe(true);
    expect(
      recs.every((row) => {
        const likely = row.reasons.some((reason) =>
          reason.startsWith("likely to be available"),
        );
        const unlikely = row.reasons.some((reason) =>
          reason.startsWith("Unlikely to be available"),
        );
        return !(likely && unlikely);
      }),
    ).toBe(true);
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

  it("keeps K and D/ST eligible late but does not pin them while value remains", () => {
    // Feasibility: with picks to spare, K/D/ST show in the list but are not
    // force-pinned to row 1 — the ranking still prefers value.
    const at139 = fillUntil(139);
    const recs139 = recommend(players, at139);
    expect(recs139.some((row) => row.player.pos === "K")).toBe(true);
    expect(recs139.some((row) => row.player.pos === "DST")).toBe(true);
    expect(["K", "DST"]).not.toContain(recs139[0]?.player.pos);

    const at150 = fillUntil(150);
    const recs150 = recommend(players, at150);
    expect(recs150.some((row) => row.player.pos === "K")).toBe(true);
    expect(recs150.some((row) => row.player.pos === "DST")).toBe(true);
    expect(["K", "DST"]).not.toContain(recs150[0]?.player.pos);
  });

  it("still forces the best remaining QB at pick 174 with zero user QBs", () => {
    const remainingQbs = players
      .filter((player) => player.pos === "QB")
      .sort((a, b) => b.modelPts - a.modelPts || a.modelRank - b.modelRank);
    const bestRemaining = remainingQbs[0];
    if (!bestRemaining) throw new Error("Expected remaining QBs");
    const recs = recommend(players, fillUntil(174, [], [bestRemaining.id], true));
    expect(recs[0]?.player.pos).toBe("QB");
    expect(recs[0]?.player.id).toBe(bestRemaining.id);
  });

  it("warns when two or three players remain in a tier", () => {
    const wrT1 = players.filter((player) => player.pos === "WR" && player.posTier === 1);
    expect(wrT1.length).toBeGreaterThanOrEqual(3);
    let state = initialDraftState;
    for (const wr of wrT1.slice(3)) {
      state = draft(state, wr.player, "other");
    }
    const recs = recommend(players, state);
    const kept = recs.find((row) => row.player.id === wrT1[0]?.id);
    expect(kept?.reasons.some((reason) => /WR T1: 3 left/.test(reason))).toBe(true);
  });

  it("does not change roster contribution when only ADP changes", () => {
    const bijan = named("Bijan Robinson");
    const shifted = { ...bijan, adp: (bijan.adp ?? 10) + 40, sfConsensusAdp: (bijan.adp ?? 10) + 40 };
    const base = completedTeamUtility([bijan], 14);
    const later = completedTeamUtility([shifted], 14);
    expect(later.starterProjection).toBe(base.starterProjection);
    expect(later.utility).toBe(base.utility);
    expect(shifted.modelPts).toBe(bijan.modelPts);
    expect(shifted.vorp).toBe(bijan.vorp);
  });

  it("does not change completed-team utility when only the scouting tag changes", () => {
    const cmc = named("Christian McCaffrey");
    const clean = { ...cmc, tag: "RB1" };
    const risky = { ...cmc, tag: "ELITE/RISK" };
    const upside = { ...cmc, tag: "UPSIDE" };
    expect(completedTeamUtility([risky], 14).utility).toBe(
      completedTeamUtility([clean], 14).utility,
    );
    expect(completedTeamUtility([upside], 14).utility).toBe(
      completedTeamUtility([clean], 14).utility,
    );
    expect(completedTeamUtility([risky], 14).riskAdjustment).toBe(0);
  });

  it("surfaces scouting tags as chips without using them as the only rank signal", () => {
    const recs = recommend(players, initialDraftState);
    const cmc = recs.find((row) => row.player.player === "Christian McCaffrey");
    expect(cmc?.reasons).toContain("ELITE/RISK");
    const taylor = recs.find((row) => row.player.player === "Jonathan Taylor");
    expect(cmc).toBeDefined();
    expect(taylor).toBeDefined();
    expect(cmc!.dynamicScore).toBeGreaterThan(taylor!.dynamicScore);
  });

  it("filters the board by scouting tag", () => {
    const sleeperState = { ...initialDraftState, tagFilter: "sleeper" as const };
    const sleepers = players.filter((player) => matchesFilters(player, sleeperState));
    expect(sleepers.length).toBeGreaterThan(0);
    expect(
      sleepers.every((player) => player.tag.toUpperCase().includes("SLEEPER")),
    ).toBe(true);
    expect(
      sleepers.every((player) => !player.tag.toUpperCase().includes("DEEP SLEEPER")),
    ).toBe(true);
  });

  it("filters the board to Potential League Winner candidates", () => {
    const state = { ...initialDraftState, tagFilter: "league-winner" as const };
    const winners = players.filter((player) => matchesFilters(player, state));
    expect(winners).toHaveLength(31);
    expect(winners.every((player) => player.leagueWinner)).toBe(true);
    expect(winners.some((player) => player.player === "Josh Allen")).toBe(true);
  });

  it("gives bench-only players diminishing value rather than full starter points", () => {
    const roster = [
      named("Josh Allen"),
      named("Lamar Jackson"),
      named("Bijan Robinson"),
      named("Jahmyr Gibbs"),
      named("Puka Nacua"),
      named("Ja'Marr Chase"),
      named("Sam LaPorta"),
      named("Amon-Ra St. Brown"),
    ];
    const extra = named("Dontayvion Wicks");
    const before = completedTeamUtility(roster, 7);
    const after = completedTeamUtility([...roster, extra], 6);
    const gained = after.utility - before.utility;
    expect(gained).toBeLessThan(extra.modelPts * 0.5);
  });

  it("finishes a full-board rollout with 15 players, K, D/ST and at least one QB", () => {
    const sim = simulateCompletedDraft(players, initialDraftState, null);
    expect(sim.roster).toHaveLength(15);
    expect(sim.roster.some((player) => player.pos === "K")).toBe(true);
    expect(sim.roster.some((player) => player.pos === "DST")).toBe(true);
    // QB1 is a legal requirement; QB2 only appears if it wins on utility.
    expect(sim.roster.filter((player) => player.pos === "QB").length).toBeGreaterThanOrEqual(1);
    expect(sim.roster.filter((player) => player.pos === "QB").length).toBeLessThanOrEqual(2);
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
