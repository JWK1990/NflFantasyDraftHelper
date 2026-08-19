/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { QbCardView } from "./QbCard.tsx";
import type { QbCard } from "../engine/qbCard.ts";
import type { LeagueWinnerTip } from "../engine/leagueWinnerTips.ts";

const players = loadPlayers();
const washington = players.find((player) => player.player === "Parker Washington");
const allen = players.find((player) => player.player === "Josh Allen");
if (!washington) throw new Error("Expected Parker Washington");
if (!allen) throw new Error("Expected Josh Allen");

const tip: LeagueWinnerTip = {
  player: washington,
  expectedPick: 94,
  picksBefore: 14,
  rank: 8,
};

const allenTip: LeagueWinnerTip = {
  player: allen,
  expectedPick: 3,
  picksBefore: 2,
  rank: 1,
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
    expect(screen.getByText("Upcoming LW players")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Washington (ADP 94, Rank 8, Picks Before 14)",
    ]);
    expect(document.querySelector(".qb-card.has-lw-tip")).toBeTruthy();
  });

  it("still shows a league-winner tip after the QB card drops away", () => {
    render(<QbCardView card={null} leagueWinnerTips={[tip]} />);
    expect(screen.getByText("Upcoming LW players")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Washington (ADP 94, Rank 8, Picks Before 14)",
    ]);
  });

  it("lists several upcoming league winners as bullet points on the bar", () => {
    render(<QbCardView card={qbCard} leagueWinnerTips={[tip, allenTip]} />);
    expect(screen.getByText("Upcoming LW players")).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Allen (ADP 3, Rank 1, Picks Before 2)",
      "Washington (ADP 94, Rank 8, Picks Before 14)",
    ]);
  });
});
