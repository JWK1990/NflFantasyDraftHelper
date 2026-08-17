import type { DraftState } from "../domain/types.ts";
import { initialDraftState } from "./draftReducer.ts";

export const STORAGE_KEY = "nfl-draft-assistant:v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface LoadResult {
  state: DraftState;
  resetReason?: string;
}

const POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DST", "ALL"]);

function isDraftState(value: unknown): value is DraftState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return false;
  if (!Array.isArray(record.picks)) return false;
  if (typeof record.search !== "string") return false;
  if (typeof record.positionFilter !== "string") return false;
  if (!POSITIONS.has(record.positionFilter)) return false;
  if (record.tierFilter !== "ALL" && typeof record.tierFilter !== "number") {
    return false;
  }
  if (record.qb2Mode !== "adaptive-punt" && record.qb2Mode !== "normal") {
    return false;
  }
  return record.picks.every((pick) => {
    if (!pick || typeof pick !== "object") return false;
    const row = pick as Record<string, unknown>;
    return (
      typeof row.playerId === "string" &&
      (row.draftedBy === "mine" || row.draftedBy === "other") &&
      typeof row.overallPick === "number" &&
      typeof row.round === "number" &&
      typeof row.timestamp === "string"
    );
  });
}

export function saveState(
  state: DraftState,
  storage: StorageLike | null = typeof localStorage === "undefined" ? null : localStorage,
): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadState(
  storage: StorageLike | null = typeof localStorage === "undefined" ? null : localStorage,
): LoadResult {
  if (!storage) return { state: initialDraftState };
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { state: initialDraftState };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {
        state: initialDraftState,
        resetReason: "Saved draft data was corrupt, so the board was reset.",
      };
    }
    const version = (parsed as { schemaVersion?: unknown }).schemaVersion;
    if (version !== 1) {
      return {
        state: initialDraftState,
        resetReason: "Saved draft used an older format, so the board was reset.",
      };
    }
    if (!isDraftState(parsed)) {
      return {
        state: initialDraftState,
        resetReason: "Saved draft data was corrupt, so the board was reset.",
      };
    }
    return { state: parsed };
  } catch {
    return {
      state: initialDraftState,
      resetReason: "Saved draft data was corrupt, so the board was reset.",
    };
  }
}

export function clearState(
  storage: StorageLike | null = typeof localStorage === "undefined" ? null : localStorage,
): void {
  storage?.removeItem(STORAGE_KEY);
}

export function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}
