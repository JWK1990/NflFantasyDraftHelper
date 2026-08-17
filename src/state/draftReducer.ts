import type { DraftAction, DraftState } from "../domain/types.ts";
import { roundForPick } from "../engine/snake.ts";

export const initialDraftState: DraftState = {
  schemaVersion: 1,
  picks: [],
  search: "",
  positionFilter: "ALL",
  tierFilter: "ALL",
  qb2Mode: "adaptive-punt",
};

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "DRAFT_PLAYER": {
      if (state.picks.some((pick) => pick.playerId === action.playerId)) {
        return state;
      }
      const overallPick = state.picks.length + 1;
      return {
        ...state,
        picks: [
          ...state.picks,
          {
            playerId: action.playerId,
            draftedBy: action.draftedBy,
            overallPick,
            round: roundForPick(overallPick),
            timestamp: new Date().toISOString(),
          },
        ],
        search: "",
      };
    }
    case "UNDO_LAST_PICK": {
      if (state.picks.length === 0) return state;
      return { ...state, picks: state.picks.slice(0, -1) };
    }
    case "RESET_DRAFT": {
      return {
        ...initialDraftState,
        qb2Mode: state.qb2Mode,
      };
    }
    case "SET_SEARCH":
      return { ...state, search: action.search };
    case "SET_POSITION_FILTER":
      return { ...state, positionFilter: action.position };
    case "SET_TIER_FILTER":
      return { ...state, tierFilter: action.tier };
    case "SET_QB2_MODE":
      return { ...state, qb2Mode: action.mode };
    default:
      return state;
  }
}
