import { describe, expect, it } from "vitest";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftPick, Player, Position } from "../domain/types.ts";
import { slotForPick } from "./snake.ts";
import {
  buildTeamStates,
  teamInitials,
  teamPicksBefore,
  teamSlotForOverallPick,
  userTeamState,
} from "./teams.ts";

function player(id: string, pos: Position): Player {
  return {
    id,
    player: id,
    team: "FA",
    pos,
    modelRank: 1,
    posRank: 1,
    posTier: 1,
    tier: 1,
    modelPts: 100,
    vorp: 0,
    adp: 1,
    tag: "",
    note: "",
  };
}

function pick(overallPick: number, playerId: string): DraftPick {
  return {
    playerId,
    draftedBy: slotForPick(overallPick) === LEAGUE.userSlot ? "mine" : "other",
    overallPick,
    round: Math.ceil(overallPick / LEAGUE.teams),
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

describe("team tracking", () => {
  it("maps every overall pick to exactly one of the 12 teams", () => {
    const seen = new Set<number>();
    for (let overall = 1; overall <= LEAGUE.teams * LEAGUE.rounds; overall += 1) {
      const slot = teamSlotForOverallPick(overall);
      expect(slot).toBeGreaterThanOrEqual(1);
      expect(slot).toBeLessThanOrEqual(LEAGUE.teams);
      seen.add(slot);
    }
    expect(seen.size).toBe(LEAGUE.teams);
  });

  it("assigns each logged pick to the team that owns its overall pick", () => {
    const players = [player("a", "RB"), player("b", "WR"), player("c", "QB")];
    const picks = [pick(1, "a"), pick(2, "b"), pick(6, "c")];
    const teams = buildTeamStates(picks, players);

    // slot 1 owns overall 1, slot 2 owns overall 2, slot 6 (user) owns overall 6.
    expect(teams[0]!.players.map((p) => p.id)).toEqual(["a"]);
    expect(teams[1]!.players.map((p) => p.id)).toEqual(["b"]);
    expect(userTeamState(teams)!.players.map((p) => p.id)).toEqual(["c"]);
    expect(userTeamState(teams)!.slot).toBe(LEAGUE.userSlot);
    // Total rostered equals picks logged — one team per pick, no double-count.
    const total = teams.reduce((sum, t) => sum + t.players.length, 0);
    expect(total).toBe(picks.length);
  });

  it("rebuilds all team rosters deterministically after an undo", () => {
    const players = [player("a", "RB"), player("b", "WR")];
    const full = [pick(1, "a"), pick(2, "b")];
    const undone = full.slice(0, -1);

    const before = buildTeamStates(full, players);
    const after = buildTeamStates(undone, players);

    expect(before[1]!.players.map((p) => p.id)).toEqual(["b"]);
    expect(after[1]!.players).toEqual([]);
    // Rebuild is a pure function of the pick log.
    expect(after).toEqual(buildTeamStates(undone, players));
  });

  it("counts positions per team", () => {
    const players = [player("a", "QB"), player("b", "QB")];
    // slot 1 owns overall 1 and overall 24.
    const picks = [pick(1, "a"), pick(24, "b")];
    const teams = buildTeamStates(picks, players);
    expect(teams[0]!.counts.QB).toBe(2);
  });

  it("derives initials from team names", () => {
    expect(teamInitials("The Dan Marinehos")).toBe("TDM");
    expect(teamInitials("Gridiron")).toBe("GRI");
    expect(teamInitials("A B C D")).toBe("ABC");
  });

  it("counts a team's own picks within a window", () => {
    // Slot 1 owns the round 2/3 turn (overalls 24 and 25), then overall 48.
    expect(teamPicksBefore(1, 2, 26)).toBe(2); // 24 and 25
    expect(teamPicksBefore(1, 26, 48)).toBe(0); // next is 48, excluded
    expect(teamPicksBefore(1, 26, 49)).toBe(1); // 48 now included
  });
});
