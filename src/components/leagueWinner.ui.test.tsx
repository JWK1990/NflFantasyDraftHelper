/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { PlayerRow } from "./PlayerRow.tsx";
import { ChipExplainProvider } from "./ChipExplainContext.tsx";
import type { DraftedBy, Player } from "../domain/types.ts";

const players = loadPlayers();
const allen = players.find((player) => player.player === "Josh Allen");
const taylor = players.find((player) => player.player === "Jonathan Taylor");
if (!allen?.leagueWinner) throw new Error("Expected Josh Allen leagueWinner");
if (!taylor) throw new Error("Expected Jonathan Taylor");

function renderRow(
  player: Player,
  extras: Partial<{
    expanded: boolean;
    onToggle: () => void;
    onDraft: (draftedBy: DraftedBy) => void;
  }> = {},
) {
  const onToggle = extras.onToggle ?? (() => undefined);
  const onDraft = extras.onDraft ?? (() => undefined);
  return render(
    <ChipExplainProvider>
      <PlayerRow
        player={player}
        rank={1}
        expanded={extras.expanded ?? false}
        onToggle={onToggle}
        onDraft={onDraft}
      />
    </ChipExplainProvider>,
  );
}

describe("league winner UI", () => {
  afterEach(() => cleanup());

  it("renders exactly one LW pill on configured players and none otherwise", () => {
    const winners = players.filter((player) => player.leagueWinner);
    expect(winners).toHaveLength(31);
    for (const player of winners) {
      const view = renderRow(player);
      expect(screen.getAllByRole("button", { name: /League Winner candidate/i })).toHaveLength(1);
      view.rerender(
        <ChipExplainProvider>
          <PlayerRow
            player={player}
            rank={1}
            expanded={false}
            onToggle={() => undefined}
            onDraft={() => undefined}
          />
        </ChipExplainProvider>,
      );
      expect(screen.getAllByRole("button", { name: /League Winner candidate/i })).toHaveLength(1);
      cleanup();
    }
    renderRow(taylor);
    expect(screen.queryByRole("button", { name: /League Winner candidate/i })).toBeNull();
  });

  it("keeps risk chips alongside the LW pill", () => {
    const risky = winnersWithRisk();
    renderRow(risky);
    const lw = screen.getByRole("button", { name: /League Winner candidate/i });
    expect(lw).toBeTruthy();
    expect(lw.className).toContain("reason");
    expect(screen.getByRole("button", { name: risky.tag })).toBeTruthy();
  });

  it("opens the breakdown from LW without drafting", () => {
    const drafted: DraftedBy[] = [];
    let expanded = false;
    renderRow(allen, {
      onDraft: (draftedBy) => drafted.push(draftedBy),
      onToggle: () => {
        expanded = true;
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /League Winner candidate/i }));
    expect(drafted).toEqual([]);
    expect(expanded).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(drafted).toEqual(["mine"]);
  });

  it("renders confidence, archetypes, reasons and sources from JSON", () => {
    renderRow(allen, { expanded: true });
    expect(screen.getByText("League Winner Candidate")).toBeTruthy();
    expect(screen.getByText("Confidence: High")).toBeTruthy();
    expect(screen.getByText("Power-law ceiling")).toBeTruthy();
    expect(screen.getByText("Rushing QB")).toBeTruthy();
    expect(screen.getByText("Elite positional edge")).toBeTruthy();
    expect(
      screen.getByText(/Has repeatedly separated from the normal QB1 baseline/),
    ).toBeTruthy();
    const source = screen.getByRole("link", { name: "NFL.com 2026 Top 10 League-Winners" });
    expect(source.getAttribute("href")).toContain("nfl.com");
    expect(source.getAttribute("rel")).toContain("noopener");
    expect(
      screen.getByText(/does not affect this player’s recommendation score/),
    ).toBeTruthy();
  });

  it("renders sources without URLs as plain text", () => {
    renderRow(
      {
        ...taylor,
        leagueWinner: {
          confidence: "low",
          archetypes: ["contingent-upside"],
          reasons: ["Optional metadata should not break rendering."],
          sources: [{ label: "Source without URL" }],
        },
      },
      { expanded: true },
    );
    expect(screen.getByText("Confidence: Low")).toBeTruthy();
    expect(screen.getByText("Contingent upside")).toBeTruthy();
    expect(screen.getByText("Source without URL")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Source without URL" })).toBeNull();
  });
});

function winnersWithRisk(): Player {
  const match = players.find(
    (player) => player.leagueWinner && /RISK|INJURY|WATCH/i.test(player.tag),
  );
  if (!match) throw new Error("Expected an LW candidate with a risk or injury tag");
  return match;
}
