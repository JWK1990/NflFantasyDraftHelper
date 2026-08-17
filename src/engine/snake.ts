import { LEAGUE } from "../config/leagueSettings.ts";

export function pickForRound(round: number, teams: number, slot: number): number {
  return round % 2 === 1
    ? (round - 1) * teams + slot
    : round * teams - slot + 1;
}

export function userPickSchedule(
  teams: number = LEAGUE.teams,
  rounds: number = LEAGUE.rounds,
  slot: number = LEAGUE.userSlot,
): number[] {
  return Array.from({ length: rounds }, (_, index) =>
    pickForRound(index + 1, teams, slot),
  );
}

export function roundForPick(overallPick: number, teams: number = LEAGUE.teams): number {
  return Math.ceil(overallPick / teams);
}

export function isUserPick(
  overallPick: number,
  schedule: number[] = userPickSchedule(),
): boolean {
  return schedule.includes(overallPick);
}

export function nextUserPickAfter(
  overallPick: number,
  schedule: number[] = userPickSchedule(),
): number | null {
  return schedule.find((pick) => pick > overallPick) ?? null;
}

export function upcomingUserPick(
  currentOverallPick: number,
  schedule: number[] = userPickSchedule(),
): number | null {
  return schedule.find((pick) => pick >= currentOverallPick) ?? null;
}

export function interveningPicksUntilNextTurn(
  currentOverallPick: number,
  schedule: number[] = userPickSchedule(),
): number {
  const next = nextUserPickAfter(currentOverallPick, schedule);
  if (next == null) return 0;
  return Math.max(0, next - currentOverallPick - 1);
}

export function formatPickLabel(
  overallPick: number,
  teams: number = LEAGUE.teams,
  slot: number = LEAGUE.userSlot,
): string {
  const round = roundForPick(overallPick, teams);
  return `${round}.${String(slot).padStart(2, "0")}`;
}

export function picksUntilTurn(
  currentOverallPick: number,
  schedule: number[] = userPickSchedule(),
): number {
  const next = upcomingUserPick(currentOverallPick, schedule);
  if (next == null) return 0;
  return next - currentOverallPick;
}
