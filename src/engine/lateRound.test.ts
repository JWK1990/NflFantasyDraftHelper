import { describe, expect, it } from "vitest";
import { lateRoundReservation, specialTeamsWindowOpen } from "./lateRound.ts";
import { emptyRosterCounts } from "./roster.ts";

describe("late-round reservation", () => {
  it("reserves K/DST and a legal QB1 late, but never forces a QB2", () => {
    expect(lateRoundReservation(139, 0, false, false)).toBe("K");
    expect(lateRoundReservation(150, 0, true, false)).toBe("DST");
    // QB1 is still forced when the user would otherwise finish with no QB.
    expect(lateRoundReservation(163, 0, true, true)).toBe("QB");
    expect(lateRoundReservation(174, 0, true, true)).toBe("QB");
  });

  it("leaves pick 139 for skill after a first QB, then takes K/DST — QB2 is never forced", () => {
    expect(lateRoundReservation(139, 1, false, false)).toBeNull();
    expect(lateRoundReservation(150, 1, false, false)).toBe("K");
    expect(lateRoundReservation(163, 1, true, false)).toBe("DST");
    // Regression (§1.3): with one QB already and K/DST filled, 174 does NOT
    // force a second QB — a skill player may legally fill OP.
    expect(lateRoundReservation(174, 1, true, true)).toBeNull();
    expect(lateRoundReservation(163, 1, true, true)).toBeNull();
  });

  it("holds K/DST until 163 and 174 once two QBs are rostered", () => {
    expect(lateRoundReservation(139, 2, false, false)).toBeNull();
    expect(lateRoundReservation(150, 2, false, false)).toBeNull();
    expect(lateRoundReservation(163, 2, false, false)).toBe("K");
    expect(lateRoundReservation(174, 2, true, false)).toBe("DST");
  });

  it("opens special-teams eligibility at 139 with zero QBs", () => {
    const counts = { ...emptyRosterCounts(), QB: 0 };
    expect(specialTeamsWindowOpen(139, counts)).toBe(true);
    expect(specialTeamsWindowOpen(6, counts)).toBe(false);
  });
});
