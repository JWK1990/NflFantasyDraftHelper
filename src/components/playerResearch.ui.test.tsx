/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { PlayerRow } from "./PlayerRow.tsx";
import { ChipExplainProvider } from "./ChipExplainContext.tsx";
import type { DraftedBy, Player, Recommendation } from "../domain/types.ts";

const players = loadPlayers();
const bijan = players.find((player) => player.player === "Bijan Robinson");
const treHarris = players.find((player) => player.player === "Tre Harris");
if (!bijan) throw new Error("Expected Bijan Robinson");
if (!treHarris) throw new Error("Expected Tre Harris");

const USER_PICK = { isUserPick: true, label: "Josh", teamName: "The Dan Marinehos" };

function renderRow(
  player: Player,
  extras: { expanded?: boolean; recommendation?: Recommendation } = {},
) {
  const onToggle = () => undefined;
  const onDraft = (_draftedBy: DraftedBy) => undefined;
  return render(
    <ChipExplainProvider>
      <PlayerRow
        player={player}
        rank={1}
        expanded={extras.expanded ?? false}
        recommendation={extras.recommendation}
        pickTeam={USER_PICK}
        onToggle={onToggle}
        onDraft={onDraft}
      />
    </ChipExplainProvider>,
  );
}

describe("player research UI", () => {
  afterEach(() => cleanup());

  it("shows draft-day age and Superflex ADP on the compact row", () => {
    renderRow(bijan);
    expect(screen.getByText(new RegExp(`${bijan.team} · RB`))).toBeTruthy();
    expect(screen.getByText(String(bijan.age))).toBeTruthy();
    expect(screen.getByText(`ADP ${bijan.adp}`)).toBeTruthy();
    expect(screen.queryByText("ESPN room")).toBeNull();
  });

  it("does not show scouting tags or Outlook on the compact row", () => {
    renderRow(bijan, {
      recommendation: {
        player: bijan,
        dynamicScore: 1,
        reasons: ["ANCHOR", "Take now"],
        breakdown: emptyBreakdown(),
      },
    });
    expect(screen.queryByRole("button", { name: "ANCHOR" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Outlook" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quick Draft note" })).toBeNull();
    expect(screen.getByRole("button", { name: "Take now" })).toBeTruthy();
  });

  it("shows consensus ranks and notes in the expanded row", () => {
    renderRow(bijan, { expanded: true });
    expect(screen.getByText("Superflex consensus")).toBeTruthy();
    expect(screen.getByText("Superflex ranks")).toBeTruthy();
    expect(screen.getByText("ESPN room")).toBeTruthy();
    expect(screen.getByText("ESPN consensus")).toBeTruthy();
    expect(screen.getByText("Yahoo PPR")).toBeTruthy();
    const note = screen.getByText("Draft note");
    const ranks = screen.getByText("Superflex consensus");
    expect(screen.getByText(bijan.note)).toBeTruthy();
    expect(
      note.compareDocumentPosition(ranks) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("DraftSharks outlook")).toBeTruthy();
    expect(screen.getByText(bijan.outlook!.bottomLineExcerpt!)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Full DraftSharks verdict" });
    expect(link.getAttribute("href")).toBe(bijan.outlook?.sourceUrl);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("hides model internals and engine breakdown in the expanded row", () => {
    renderRow(bijan, {
      expanded: true,
      recommendation: {
        player: bijan,
        dynamicScore: 1,
        reasons: ["Take now"],
        breakdown: {
          ...emptyBreakdown(),
          candidateSecuredNow: "Bijan Robinson",
          preSelectionStateHash: "deadbeef",
        },
      },
    });
    expect(screen.queryByText("Candidate secured now")).toBeNull();
    expect(screen.queryByText("Pre-selection state hash")).toBeNull();
    expect(screen.queryByText("Completed-team utility")).toBeNull();
    expect(screen.queryByText("Model points")).toBeNull();
    expect(screen.queryByText("Superflex ADP")).toBeNull();
    expect(screen.queryByText("Source projections")).toBeNull();
  });

  it("colors remaining-in-tier pills with the same scarcity classes as the top strip", () => {
    renderRow(bijan, {
      recommendation: {
        player: bijan,
        dynamicScore: 1,
        reasons: ["RB T1: 3 left", "WR T2: 2 left", "Last in TE T1", "Take now"],
        breakdown: emptyBreakdown(),
      },
    });
    expect(screen.getByRole("button", { name: "RB T1: 3 left" }).className).toContain(
      "scarcity-mid",
    );
    expect(screen.getByRole("button", { name: "WR T2: 2 left" }).className).toContain(
      "scarcity-low",
    );
    expect(screen.getByRole("button", { name: "Last in TE T1" }).className).toContain(
      "scarcity-low",
    );
    expect(screen.getByRole("button", { name: "Take now" }).className).not.toMatch(
      /scarcity-/,
    );
  });

  it("shows a data-quality chip only in the expanded row for single-source projections", () => {
    renderRow(treHarris);
    expect(screen.queryByText("1 projection source")).toBeNull();
    cleanup();
    renderRow(treHarris, { expanded: true });
    expect(screen.getByText("1 projection source")).toBeTruthy();
  });
});

function emptyBreakdown(): Recommendation["breakdown"] {
  return {
    starterProjection: 0,
    benchValue: 0,
    riskAdjustment: 0,
    slotPenalty: 0,
    teamUtility: 0,
    alternativeUtility: 0,
    expectedGain: 0,
    returnProbability: 0,
    lookahead: true,
    preSelectionStateHash: "hash",
    candidateSecuredNow: "n/a",
    directProjection: 0,
    continuationEffect: 0,
    expectedPassLoss: 0,
    positionalPassLoss: 0,
    rawUtility: 0,
    waitPick: null,
  };
}
