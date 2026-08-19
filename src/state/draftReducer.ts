import type { DraftAction, DraftState } from "../domain/types.ts";
import { roundForPick } from "../engine/snake.ts";

export const initialDraftState: DraftState = {
  schemaVersion: 2,
  picks: [],
  search: "",
  positionFilter: "ALL",
  tierFilter: "ALL",
  tagFilter: "ALL",
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
      return { ...initialDraftState };
    }
    case "LOAD_STATE":
      return action.state;
    case "REPLACE_PICKS":
      return {
        ...state,
        picks: action.picks,
        search: "",
      };
    case "SET_SEARCH":
      return { ...state, search: action.search };
    case "SET_POSITION_FILTER":
      return { ...state, positionFilter: action.position };
    case "SET_TIER_FILTER":
      return { ...state, tierFilter: action.tier };
    case "SET_TAG_FILTER":
      return { ...state, tagFilter: action.tag };
    default:
      return state;
  }
}
