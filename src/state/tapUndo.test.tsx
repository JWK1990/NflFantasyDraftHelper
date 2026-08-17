/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useReducer } from "react";
import { loadPlayers } from "../data/loadPlayers.ts";
import { PlayerRow } from "../components/PlayerRow.tsx";
import { draftReducer, initialDraftState } from "./draftReducer.ts";
import type { DraftedBy } from "../domain/types.ts";

const players = loadPlayers();
const bijan = players.find((player) => player.player === "Bijan Robinson");
if (!bijan) throw new Error("Expected Bijan Robinson in the dataset");

function TapUndoHarness() {
  const [state, dispatch] = useReducer(draftReducer, initialDraftState);
  const drafted = state.picks.find((pick) => pick.playerId === bijan.id);

  return (
    <div>
      <PlayerRow
        player={bijan}
        rank={1}
        expanded={false}
        draftedBy={drafted?.draftedBy}
        onToggle={() => undefined}
        onDraft={(draftedBy: DraftedBy) =>
          dispatch({ type: "DRAFT_PLAYER", playerId: bijan.id, draftedBy })
        }
      />
      <button type="button" onClick={() => dispatch({ type: "UNDO_LAST_PICK" })}>
        Undo last
      </button>
      <div>picks:{state.picks.length}</div>
    </div>
  );
}

describe("critical tap and undo flow", () => {
  afterEach(() => cleanup());

  it("records Mine in one tap and restores the player on undo", () => {
    render(<TapUndoHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.getByText("picks:1")).toBeTruthy();
    expect(screen.getByText("MINE")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo last" }));
    expect(screen.getByText("picks:0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mine" })).toBeTruthy();
  });
});
