import { describe, expect, it } from "vitest";
import { lateRoundReservation, specialTeamsWindowOpen } from "./lateRound.ts";
import { emptyRosterCounts } from "./roster.ts";

describe("late-round reservation", () => {
  it("schedules K then DST then two QBs when double-late is still open", () => {
    expect(lateRoundReservation(139, 0, false, false)).toBe("K");
    expect(lateRoundReservation(150, 0, true, false)).toBe("DST");
    expect(lateRoundReservation(163, 0, true, true)).toBe("QB");
    expect(lateRoundReservation(174, 1, true, true)).toBe("QB");
  });

  it("leaves pick 139 for skill after a first QB, then takes K/DST before QB2", () => {
    expect(lateRoundReservation(139, 1, false, false)).toBeNull();
    expect(lateRoundReservation(150, 1, false, false)).toBe("K");
    expect(lateRoundReservation(163, 1, true, false)).toBe("DST");
    expect(lateRoundReservation(174, 1, true, true)).toBe("QB");
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
