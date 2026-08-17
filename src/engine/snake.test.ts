import { describe, expect, it } from "vitest";
import { pickForRound, slotForPick, userPickSchedule } from "./snake.ts";

describe("snake draft math", () => {
  it("slot 6 produces the 15 scheduled user picks", () => {
    expect(userPickSchedule(12, 15, 6)).toEqual([
      6, 19, 30, 43, 54, 67, 78, 91, 102, 115, 126, 139, 150, 163, 174,
    ]);
  });

  it("generates odd and even rounds from the snake formula", () => {
    expect(pickForRound(1, 12, 6)).toBe(6);
    expect(pickForRound(2, 12, 6)).toBe(19);
    expect(pickForRound(3, 12, 6)).toBe(30);
  });

  it("maps overall picks to snake slots", () => {
    expect(slotForPick(1)).toBe(1);
    expect(slotForPick(6)).toBe(6);
    expect(slotForPick(13)).toBe(12);
    expect(slotForPick(19)).toBe(6);
  });
});
