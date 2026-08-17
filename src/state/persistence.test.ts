import { describe, expect, it } from "vitest";
import { initialDraftState } from "./draftReducer.ts";
import {
  loadState,
  memoryStorage,
  saveState,
  STORAGE_KEY,
} from "./persistence.ts";

describe("persistence", () => {
  it("restores a saved draft from storage", () => {
    const storage = memoryStorage();
    const state = {
      ...initialDraftState,
      picks: [
        {
          playerId: "bijan-robinson-atl-rb",
          draftedBy: "mine" as const,
          overallPick: 1,
          round: 1,
          timestamp: "2026-08-17T00:00:00.000Z",
        },
      ],
      search: "bijan",
    };
    saveState(state, storage);
    const loaded = loadState(storage);
    expect(loaded.resetReason).toBeUndefined();
    expect(loaded.state).toEqual(state);
  });

  it("falls back safely when stored state is invalid", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{not-json" });
    const loaded = loadState(storage);
    expect(loaded.state).toEqual(initialDraftState);
    expect(loaded.resetReason).toMatch(/corrupt/i);
  });

  it("falls back when the schema version changes", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({ ...initialDraftState, schemaVersion: 2 }),
    });
    const loaded = loadState(storage);
    expect(loaded.state).toEqual(initialDraftState);
    expect(loaded.resetReason).toMatch(/older format|reset/i);
  });
});
