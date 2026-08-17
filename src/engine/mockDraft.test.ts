import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftState } from "../domain/types.ts";
import { recommend } from "./recommend.ts";
import { playersById, rosterCounts } from "./roster.ts";
import { userPickSchedule } from "./snake.ts";
import { draftReducer, initialDraftState } from "../state/draftReducer.ts";

const players = loadPlayers();
const byId = playersById(players);
const schedule = userPickSchedule();

function adpValue(id: string): number {
  const player = byId.get(id);
  if (!player) return 9999;
  return player.adp ?? 900 + player.modelRank;
}

describe("scripted mock draft", () => {
  it("walks 180 picks on the slot-6 schedule and preserves the QB2 branch", () => {
    let state: DraftState = initialDraftState;
    const userPickNumbers: number[] = [];

    for (let overall = 1; overall <= 180; overall += 1) {
      const available = players.filter(
        (player) => !state.picks.some((pick) => pick.playerId === player.id),
      );
      const isMine = schedule.includes(overall);
      let playerId: string | undefined;

      if (isMine) {
        const recs = recommend(players, state);
        playerId = recs[0]?.player.id;
        userPickNumbers.push(overall);
      } else {
        playerId = [...available].sort((a, b) => adpValue(a.id) - adpValue(b.id))[0]?.id;
      }

      if (!playerId) throw new Error(`No player available at pick ${overall}`);
      state = draftReducer(state, {
        type: "DRAFT_PLAYER",
        playerId,
        draftedBy: isMine ? "mine" : "other",
      });
    }

    expect(state.picks).toHaveLength(180);
    expect(userPickNumbers).toEqual(schedule);

    const mine = state.picks.filter((pick) => pick.draftedBy === "mine");
    expect(mine).toHaveLength(15);
    expect(mine.map((pick) => pick.overallPick)).toEqual(schedule);

    const counts = rosterCounts(state.picks, byId);
    expect(counts.QB).toBeLessThanOrEqual(2);
    expect(counts.total).toBe(15);

    const pick174 = mine.find((pick) => pick.overallPick === 174);
    if (counts.QB === 1) {
      expect(byId.get(pick174?.playerId ?? "")?.pos).toBe("QB");
    }
  });
});
