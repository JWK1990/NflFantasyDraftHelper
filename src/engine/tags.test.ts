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

  it("matches compound value and risk tags", () => {
    const cmc = named("Christian McCaffrey");
    expect(playerMatchesTagFilter(cmc, "risk")).toBe(true);
    expect(playerMatchesTagFilter(cmc, "value")).toBe(false);
    const valueRisk = players.find((player) => player.tag === "VALUE/RISK");
    expect(valueRisk).toBeDefined();
    expect(playerMatchesTagFilter(valueRisk!, "value")).toBe(true);
    expect(playerMatchesTagFilter(valueRisk!, "risk")).toBe(true);
  });

  it("matches Potential League Winner from leagueWinner metadata, not the scouting tag", () => {
    const allen = named("Josh Allen");
    const taylor = named("Jonathan Taylor");
    expect(allen.leagueWinner).toBeDefined();
    expect(playerMatchesTagFilter(allen, "league-winner")).toBe(true);
    expect(playerMatchesTagFilter(taylor, "league-winner")).toBe(false);
    expect(playerMatchesTagFilter(allen, "anchor")).toBe(true);
  });
});
