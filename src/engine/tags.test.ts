import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { playerMatchesTagFilter, scoutingTag } from "./tags.ts";

const players = loadPlayers();

function named(name: string) {
  const match = players.find((player) => player.player === name);
  if (!match) throw new Error(`Missing player ${name}`);
  return match;
}

describe("scouting tags", () => {
  it("exposes McCaffrey as a risk chip without treating special-teams tags as scouting", () => {
    expect(scoutingTag(named("Christian McCaffrey"))).toBe("ELITE/RISK");
    const kicker = players.find((player) => player.pos === "K");
    expect(kicker).toBeDefined();
    expect(scoutingTag(kicker!)).toBeNull();
  });

  it("matches sleeper and deep sleeper as separate filters", () => {
    const sleeper = players.find((player) => player.tag === "SLEEPER");
    const deep = players.find((player) => player.tag === "DEEP SLEEPER");
    expect(sleeper).toBeDefined();
    expect(deep).toBeDefined();
    expect(playerMatchesTagFilter(sleeper!, "sleeper")).toBe(true);
    expect(playerMatchesTagFilter(sleeper!, "deep-sleeper")).toBe(false);
    expect(playerMatchesTagFilter(deep!, "deep-sleeper")).toBe(true);
    expect(playerMatchesTagFilter(deep!, "sleeper")).toBe(false);
  });

  it("matches risk from the scouting tag and value from the value profile", () => {
    const cmc = named("Christian McCaffrey");
    expect(playerMatchesTagFilter(cmc, "risk")).toBe(true);
    const valueRisk = players.find((player) => player.tag === "VALUE/RISK");
    expect(valueRisk).toBeDefined();
    expect(playerMatchesTagFilter(valueRisk!, "risk")).toBe(true);
    // Value is now driven by the ValueProfile, not the scouting tag.
    const murray = named("Kyler Murray");
    expect(murray.value).toBeDefined();
    expect(playerMatchesTagFilter(murray, "value")).toBe(true);
    expect(playerMatchesTagFilter(named("Saquon Barkley"), "value")).toBe(false);
  });

  it("matches Potential League Winner and Watchlist from metadata, not the scouting tag", () => {
    const murray = named("Kyler Murray");
    const plain = named("Saquon Barkley");
    expect(murray.leagueWinner).toBeDefined();
    expect(playerMatchesTagFilter(murray, "league-winner")).toBe(true);
    expect(plain.leagueWinner).toBeUndefined();
    expect(playerMatchesTagFilter(plain, "league-winner")).toBe(false);
    // Watchlist is its own independent flag.
    expect(murray.watchlist).toBe(true);
    expect(playerMatchesTagFilter(murray, "watchlist")).toBe(true);
    expect(playerMatchesTagFilter(plain, "watchlist")).toBe(false);
    expect(playerMatchesTagFilter(named("Josh Allen"), "anchor")).toBe(true);
  });
});
