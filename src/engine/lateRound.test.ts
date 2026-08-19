import { describe, expect, it } from "vitest";
import { lateRoundReservation, specialTeamsWindowOpen } from "./lateRound.ts";
import { emptyRosterCounts } from "./roster.ts";

// User (slot 6) picks: 6,19,30,43,54,67,78,91,102,115,126,139,150,163,174.
// Picks remaining at/after: 139->4, 150->3, 163->2, 174->1.

describe("late-round reservation (feasibility-based)", () => {
  it("does not force any mandatory position while there is room to wait", () => {
    // With 0 QB and no K/DST (3 mandatory), pick 139 has 4 picks left — wait.
    expect(lateRoundReservation(139, 0, false, false)).toBeNull();
    // With a QB and no K/DST (2 mandatory), pick 150 has 3 picks left — wait.
    expect(lateRoundReservation(150, 1, false, false)).toBeNull();
    // Nothing unfilled — never a reservation.
    expect(lateRoundReservation(139, 1, true, true)).toBeNull();
  });

  it("forces a mandatory position once picks left equal unfilled mandatory slots", () => {
    // 0 QB + no K/DST = 3 mandatory; pick 150 has exactly 3 left -> forced (QB first).
    expect(lateRoundReservation(150, 0, false, false)).toBe("QB");
    // 1 QB + no K/DST = 2 mandatory; pick 163 has exactly 2 left -> DST (QB not needed).
    expect(lateRoundReservation(163, 1, false, false)).toBe("DST");
    // 1 QB + K, no DST = 1 mandatory; pick 174 (last) -> DST.
    expect(lateRoundReservation(174, 1, true, false)).toBe("DST");
  });

  it("still forces a legal QB1 at the last feasible pick, but never a QB2", () => {
    // 0 QB with K/DST filled (1 mandatory): can wait at 163, forced at 174.
    expect(lateRoundReservation(163, 0, true, true)).toBeNull();
    expect(lateRoundReservation(174, 0, true, true)).toBe("QB");
    // Already have one QB: QB2 is never forced, at any pick.
    expect(lateRoundReservation(174, 1, true, true)).toBeNull();
    expect(lateRoundReservation(163, 1, true, true)).toBeNull();
  });

  it("prioritises QB1 over specials when several mandatory slots remain", () => {
    // 0 QB + no K/DST, pick 163 (2 left, 3 mandatory) -> QB1 first.
    expect(lateRoundReservation(163, 0, false, false)).toBe("QB");
  });

  it("opens the K/DST window only when specials are nearly forced", () => {
    const zero = { ...emptyRosterCounts(), QB: 0 };
    // 3 mandatory, pick 139 has 4 left (<= 3+1) -> window open.
    expect(specialTeamsWindowOpen(139, zero)).toBe(true);
    // Early on there is plenty of room -> closed.
    expect(specialTeamsWindowOpen(6, zero)).toBe(false);
    // Nothing mandatory -> never open.
    expect(
      specialTeamsWindowOpen(174, { ...emptyRosterCounts(), QB: 2, K: 1, DST: 1 }),
    ).toBe(false);
  });
});
