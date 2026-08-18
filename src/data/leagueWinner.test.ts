import { describe, expect, it } from "vitest";
import { parseLeagueWinner } from "./leagueWinner.ts";

describe("parseLeagueWinner", () => {
  it("returns undefined when the field is missing rather than a negative signal", () => {
    expect(parseLeagueWinner(undefined, "Test Player")).toBeUndefined();
    expect(parseLeagueWinner(null, "Test Player")).toBeUndefined();
  });

  it("keeps research text unchanged and allows missing optional url and reviewedAt", () => {
    const reason = "Has repeatedly separated from the normal QB1 baseline.";
    const profile = parseLeagueWinner(
      {
        confidence: "medium",
        archetypes: ["breakout-role"],
        reasons: [reason],
        sources: [{ label: "Source without URL" }],
      },
      "Test Player",
    );
    expect(profile).toEqual({
      confidence: "medium",
      archetypes: ["breakout-role"],
      reasons: [reason],
      sources: [{ label: "Source without URL" }],
    });
    expect(profile?.reasons[0]).toBe(reason);
  });
});
