import {
  RECOMMENDATION_CONFIG,
  type RecommendationConfig,
} from "../config/recommendationConfig.ts";
import type { DraftState, Player, Recommendation } from "../domain/types.ts";
import { buildTeamStates, opponentTeams } from "./teams.ts";
import {
  guaranteedQbFloor,
  opponentQbCapacityBefore,
  remainingQbCapacity,
  sortQbsByValue,
} from "./qbCapacity.ts";
import { draftedIds, playersById, rosterCounts } from "./roster.ts";
import { nextUserPickAfter, userPickSchedule } from "./snake.ts";
import { teamNamesBySlot } from "../config/leagueTeams.ts";

export type QbCardLeader = "qb" | "skill" | "even";

export interface QbCardSide {
  player: Player;
  utility: number;
}

/**
 * A purely explanatory QB card derived from the main ranking rows — it never
 * pins or reorders anything. It answers "should my next pick be a QB?" using the
 * same completed-team utilities the list shows, plus the hard opponent QB
 * capacity that bounds whether a good QB is guaranteed to come back later.
 */
export interface QbCard {
  bestQb: QbCardSide | null;
  bestSkill: QbCardSide | null;
  /** bestQb.utility − bestSkill.utility (positive means the QB leads). */
  edge: number;
  leader: QbCardLeader;
  tooClose: boolean;
  userQbCount: number;
  /** Hard opponent QB capacity before the user's next pick. */
  capacityToNext: number;
  /** Hard opponent QB capacity before the user's final pick. */
  capacityToEnd: number;
  /** QB guaranteed to survive to the final pick (null if all could go). */
  guaranteedFloor: Player | null;
  bestAvailableQb: Player | null;
  remainingQbCount: number;
  /** Total QBs already drafted across all 12 teams. */
  qbsTaken: number;
  /** Opponents that can still draft a QB, with how many more they can take. */
  teamsNeedingQb: { name: string; needs: number }[];
  nextUserPick: number | null;
  lastUserPick: number;
}

function bestRowUtility(row: Recommendation | undefined): QbCardSide | null {
  if (!row) return null;
  return { player: row.player, utility: row.breakdown.teamUtility };
}

export function deriveQbCard(
  recs: Recommendation[],
  players: Player[],
  state: DraftState,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): QbCard | null {
  const teams = buildTeamStates(state.picks, players, teamNamesBySlot());
  // User QB count uses the same draftedBy="mine" tally as the rest of the engine
  // (robust to any off-schedule logging); opponent capacity uses the slot model.
  const userQbCount = rosterCounts(state.picks, playersById(players)).QB;
  // Both QB slots (QB + a likely OP QB) already covered — the card adds nothing.
  if (userQbCount >= 2) return null;

  const currentPick = state.picks.length + 1;
  const schedule = userPickSchedule();
  const lastUserPick = schedule.at(-1) ?? currentPick;
  if (currentPick > lastUserPick) return null;
  const nextUserPick = nextUserPickAfter(currentPick);

  const taken = draftedIds(state.picks);
  const availableQbs = sortQbsByValue(
    players.filter((player) => player.pos === "QB" && !taken.has(player.id)),
  );
  if (availableQbs.length === 0) return null;

  const evaluated = recs.filter((row) => row.breakdown.lookahead);
  const bestQb = bestRowUtility(
    evaluated.find((row) => row.player.pos === "QB"),
  );
  const bestSkill = bestRowUtility(
    evaluated.find(
      (row) =>
        row.player.pos === "RB" ||
        row.player.pos === "WR" ||
        row.player.pos === "TE",
    ),
  );

  const edge = (bestQb?.utility ?? 0) - (bestSkill?.utility ?? 0);
  const closeThreshold = config.robustness.closeCallPpw * config.branch.weeks;
  const tooClose =
    bestQb != null && bestSkill != null && Math.abs(edge) < closeThreshold;
  const leader: QbCardLeader =
    bestQb == null
      ? "skill"
      : bestSkill == null
        ? "qb"
        : Math.abs(edge) < 0.5
          ? "even"
          : edge > 0
            ? "qb"
            : "skill";

  const capacityToNext =
    nextUserPick != null
      ? opponentQbCapacityBefore(teams, currentPick, nextUserPick)
      : 0;
  const capacityToEnd = opponentQbCapacityBefore(teams, currentPick, lastUserPick + 1);
  const floor = guaranteedQbFloor(availableQbs, capacityToEnd);

  const qbsTaken = teams.reduce((sum, team) => sum + team.counts.QB, 0);
  const teamsNeedingQb = opponentTeams(teams)
    .map((team) => ({ name: team.displayName, needs: remainingQbCapacity(team) }))
    .filter((team) => team.needs > 0)
    .sort((a, b) => b.needs - a.needs);

  return {
    bestQb,
    bestSkill,
    edge,
    leader,
    tooClose,
    userQbCount,
    capacityToNext,
    capacityToEnd,
    guaranteedFloor: floor.guaranteedFloor,
    bestAvailableQb: availableQbs[0] ?? null,
    remainingQbCount: availableQbs.length,
    qbsTaken,
    teamsNeedingQb,
    nextUserPick,
    lastUserPick,
  };
}
