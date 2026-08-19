import { describe, expect, it } from "vitest";
import { LEAGUE } from "../config/leagueSettings.ts";
import type { Player, Position } from "../domain/types.ts";
import { emptyPosCounts, type TeamDraftState } from "./teams.ts";
import {
  guaranteedQbFloor,
  maxAdditionalQbsBefore,
  opponentQbCapacityBefore,
  remainingQbCapacity,
} from "./qbCapacity.ts";

function team(slot: number, qbCount: number): TeamDraftState {
  return {
    slot,
    isUser: slot === LEAGUE.userSlot,
    displayName: `Team ${slot}`,
    players: [],
    counts: { ...emptyPosCounts(), QB: qbCount },
  };
}

function qb(id: string, modelPts: number, posRank: number): Player {
  return {
    id,
    player: id,
    team: "FA",
    pos: "QB" as Position,
    modelRank: posRank,
    posRank,
    posTier: 1,
    tier: 1,
    modelPts,
    vorp: 0,
    adp: posRank,
    tag: "",
    note: "",
  };
}

/** 12 teams; user at slot 6 with `userQb` QBs, every opponent with `oppQb`. */
function board(userQb: number, oppQb: number): TeamDraftState[] {
  return Array.from({ length: LEAGUE.teams }, (_, index) => {
    const slot = index + 1;
    return team(slot, slot === LEAGUE.userSlot ? userQb : oppQb);
  });
}

describe("QB capacity", () => {
  it("remaining capacity is 2 minus qb count, floored at 0", () => {
    expect(remainingQbCapacity(team(1, 0))).toBe(2);
    expect(remainingQbCapacity(team(1, 1))).toBe(1);
    expect(remainingQbCapacity(team(1, 2))).toBe(0);
    expect(remainingQbCapacity(team(1, 3))).toBe(0);
  });

  it("is zero when opponents collectively hold 22 QBs (test 7)", () => {
    const teams = board(1, 2); // 11 opponents x 2 = 22
    expect(opponentQbCapacityBefore(teams, 55, 174)).toBe(0);
  });

  it("counts only opponent picks occurring before the target (test 11)", () => {
    const teams = board(1, 0); // every opponent has full capacity
    const early = opponentQbCapacityBefore(teams, 55, 67);
    const late = opponentQbCapacityBefore(teams, 55, 174);
    expect(late).toBeGreaterThan(early);
  });

  it("a team with capacity but no pick before the target contributes zero (test 12)", () => {
    // Slot 7 owns overall 7, then not again until overall 18. Target 18 leaves
    // slot 7 no pick strictly before it in the window [8, 18).
    const openSlot7 = team(7, 0);
    expect(maxAdditionalQbsBefore(openSlot7, 8, 18)).toBe(0);
    // But it does own a pick before a later target.
    expect(maxAdditionalQbsBefore(openSlot7, 8, 30)).toBeGreaterThan(0);
  });

  it("guaranteed floor is QB C+1 with four QBs and capacity two (test 10)", () => {
    const qbs = [qb("q1", 400, 1), qb("q2", 380, 2), qb("q3", 360, 3), qb("q4", 340, 4)];
    const floor = guaranteedQbFloor(qbs, 2);
    expect(floor.guaranteedFloor!.id).toBe("q3"); // QB3
    expect(floor.guaranteedCount).toBe(2); // at least two remain
  });

  it("guarantees the best QB when capacity is zero (test 9 basis)", () => {
    const qbs = [qb("q1", 400, 1), qb("q2", 380, 2)];
    const floor = guaranteedQbFloor(qbs, 0);
    expect(floor.guaranteedFloor!.id).toBe("q1");
    expect(floor.guaranteedCount).toBe(2);
  });
});
