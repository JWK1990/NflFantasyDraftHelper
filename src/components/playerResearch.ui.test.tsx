/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { PlayerRow } from "./PlayerRow.tsx";
import { ChipExplainProvider } from "./ChipExplainContext.tsx";
import type { DraftedBy, Player } from "../domain/types.ts";

const players = loadPlayers();
const bijan = players.find((player) => player.player === "Bijan Robinson");
const treHarris = players.find((player) => player.player === "Tre Harris");
if (!bijan) throw new Error("Expected Bijan Robinson");
if (!treHarris) throw new Error("Expected Tre Harris");

const USER_PICK = { isUserPick: true, label: "Josh", teamName: "The Dan Marinehos" };

function renderRow(player: Player, expanded = false) {
  const onToggle = () => undefined;
  const onDraft = (_draftedBy: DraftedBy) => undefined;
  return render(
    <ChipExplainProvider>
      <PlayerRow
        player={player}
        rank={1}
        expanded={expanded}
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
    expect(screen.getByText(new RegExp(`${bijan.team} · RB · ${bijan.age}`))).toBeTruthy();
    expect(screen.getByText(`ADP ${bijan.adp}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quick Draft note" })).toBeTruthy();
    expect(screen.queryByText("ESPN room")).toBeNull();
  });

  it("keeps ESPN room ADP and outlook text in the expanded row", () => {
    renderRow(bijan, true);
    expect(screen.getByText("ESPN room")).toBeTruthy();
    expect(screen.getByText("Superflex ADP")).toBeTruthy();
    expect(screen.getByText("DraftSharks outlook")).toBeTruthy();
    expect(screen.getByText(bijan.note)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Full DraftSharks verdict" });
    expect(link.getAttribute("href")).toBe(bijan.outlook?.sourceUrl);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("opens the Quick Draft note from Outlook without expanding the row", () => {
    let expanded = false;
    render(
      <ChipExplainProvider>
        <PlayerRow
          player={bijan}
          rank={1}
          expanded={false}
          pickTeam={USER_PICK}
          onToggle={() => {
            expanded = true;
          }}
          onDraft={() => undefined}
        />
      </ChipExplainProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quick Draft note" }));
    expect(expanded).toBe(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Quick Draft note")).toBeTruthy();
    expect(screen.getByText(bijan.note)).toBeTruthy();
    expect(screen.queryByText("ESPN room")).toBeNull();
    expect(screen.queryByText("Full DraftSharks verdict")).toBeNull();
  });

  it("shows a data-quality chip only in the expanded row for single-source projections", () => {
    renderRow(treHarris);
    expect(screen.queryByText("1 projection source")).toBeNull();
    cleanup();
    renderRow(treHarris, true);
    expect(screen.getByText("1 projection source")).toBeTruthy();
  });
});
