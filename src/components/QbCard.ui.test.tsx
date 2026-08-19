/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { QbCardView } from "./QbCard.tsx";
import type { QbCard } from "../engine/qbCard.ts";
import type { LeagueWinnerTip } from "../engine/leagueWinnerTips.ts";

const players = loadPlayers();
const washington = players.find((player) => player.player === "Parker Washington");
if (!washington) throw new Error("Expected Parker Washington");

const tip: LeagueWinnerTip = {
  player: washington,
  expectedPick: 94,
  picksBefore: 14,
  rank: 8,
};

const qbCard: QbCard = {
  bestQb: null,
  bestSkill: null,
  edge: -12,
  leader: "skill",
  tooClose: false,
  userQbCount: 1,
  capacityToNext: 3,
  capacityToEnd: 8,
  guaranteedFloor: null,
  bestAvailableQb: null,
  remainingQbCount: 10,
  qbsTaken: 6,
  teamsNeedingQb: [],
  nextUserPick: 91,
  lastUserPick: 175,
};

describe("draft tip bar", () => {
  afterEach(() => cleanup());

  it("puts the upcoming league-winner reminder on the collapsed bar", () => {
    render(<QbCardView card={qbCard} leagueWinnerTips={[tip]} />);
    expect(
      screen.getAllByText(
        /LW Parker Washington \(WR\) is expected at pick 94, you have 14 picks before then, he is currently your 8th-best option/,
      ).length,
    ).toBeGreaterThan(0);
    expect(document.querySelector(".qb-card.has-lw-tip")).toBeTruthy();
  });

  it("still shows a league-winner tip after the QB card drops away", () => {
    render(<QbCardView card={null} leagueWinnerTips={[tip]} />);
    expect(
      screen.getAllByText(/LW Parker Washington \(WR\) is expected at pick 94/).length,
    ).toBeGreaterThan(0);
  });
});
