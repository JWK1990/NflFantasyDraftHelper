import { describe, expect, it } from "vitest";
import { loadPlayers } from "./loadPlayers.ts";

describe("loadPlayers", () => {
  it("validates the offensive dataset and merges special teams", () => {
    const players = loadPlayers();
    const ids = new Set(players.map((player) => player.id));
    expect(ids.size).toBe(players.length);
    expect(players.filter((player) => player.pos === "QB").length).toBe(32);
    expect(players.filter((player) => player.pos === "K").length).toBe(15);
    expect(players.filter((player) => player.pos === "DST").length).toBe(15);
    expect(players.some((player) => player.player === "Josh Allen")).toBe(true);
    expect(players.some((player) => player.player === "Brandon Aubrey")).toBe(true);
  });
});
