import type { Player, Position, QbStarterSecurity } from "../domain/types.ts";
import draftModel from "./draft_model_data.json";
import specialTeams from "./specialTeams.json";
import { parseLeagueWinner } from "./leagueWinner.ts";

const POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DST"]);

interface RawPlayer {
  player: unknown;
  team: unknown;
  pos: unknown;
  modelRank: unknown;
  posRank: unknown;
  posTier: unknown;
  tier: unknown;
  modelPts: unknown;
  vorp: unknown;
  adp?: unknown;
  tag?: unknown;
  note?: unknown;
  leagueWinner?: unknown;
}

interface RawSpecial {
  player: string;
  team: string;
  rank: number;
  posTier: number;
}

function slug(player: string, team: string, pos: string): string {
  return `${player}-${team}-${pos}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPosition(value: unknown): value is Position {
  return typeof value === "string" && POSITIONS.has(value as Position);
}

function requireNumber(value: unknown, field: string, player: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${field} for ${player}`);
  }
  return value;
}

function inferQbSecurity(pos: Position, posRank: number): QbStarterSecurity | undefined {
  if (pos !== "QB") return undefined;
  if (posRank <= 12) return "secure";
  if (posRank <= 24) return "probable";
  return "fragile";
}

function toPlayer(raw: RawPlayer): Player {
  if (typeof raw.player !== "string" || !raw.player.trim()) {
    throw new Error("Player is missing a name");
  }
  if (typeof raw.team !== "string" || !raw.team.trim()) {
    throw new Error(`Player ${raw.player} is missing a team`);
  }
  if (!isPosition(raw.pos)) {
    throw new Error(`Player ${raw.player} has an invalid position`);
  }
  const tag = typeof raw.tag === "string" ? raw.tag : "";
  const posRank = requireNumber(raw.posRank, "posRank", raw.player);
  return {
    id: slug(raw.player, raw.team, raw.pos),
    player: raw.player,
    team: raw.team,
    pos: raw.pos,
    modelRank: requireNumber(raw.modelRank, "modelRank", raw.player),
    posRank,
    posTier: requireNumber(raw.posTier, "posTier", raw.player),
    tier: requireNumber(raw.tier, "tier", raw.player),
    modelPts: requireNumber(raw.modelPts, "modelPts", raw.player),
    vorp: requireNumber(raw.vorp, "vorp", raw.player),
    adp: raw.adp == null ? null : requireNumber(raw.adp, "adp", raw.player),
    tag,
    note: typeof raw.note === "string" ? raw.note : "",
    qbStarterSecurity: inferQbSecurity(raw.pos, posRank),
    leagueWinner: parseLeagueWinner(raw.leagueWinner, raw.player),
  };
}

function specialToPlayer(
  raw: RawSpecial,
  pos: "K" | "DST",
  rankOffset: number,
): Player {
  const modelRank = rankOffset + raw.rank;
  return {
    id: slug(raw.player, raw.team, pos),
    player: raw.player,
    team: raw.team,
    pos,
    modelRank,
    posRank: raw.rank,
    posTier: raw.posTier,
    tier: 9,
    modelPts: 0,
    vorp: 0,
    adp: null,
    tag: pos,
    note: "Late-round special teams ranking; stream if needed.",
  };
}

export function loadPlayers(): Player[] {
  const offensive = (draftModel as { players: RawPlayer[] }).players.map(toPlayer);
  const kickerOffset = 200;
  const dstOffset = 220;
  const kickers = (specialTeams as { kickers: RawSpecial[] }).kickers.map((row) =>
    specialToPlayer(row, "K", kickerOffset),
  );
  const defenses = (specialTeams as { defenses: RawSpecial[] }).defenses.map((row) =>
    specialToPlayer(row, "DST", dstOffset),
  );

  const merged = [...offensive, ...kickers, ...defenses];
  const seen = new Set<string>();
  for (const player of merged) {
    if (seen.has(player.id)) {
      throw new Error(`Duplicate player id: ${player.id}`);
    }
    seen.add(player.id);
  }
  return merged;
}

export const DATASET_GENERATED = (draftModel as { generated?: string }).generated ?? "";

export const LEAGUE_WINNER_METHODOLOGY = (
  draftModel as { leagueWinnerMethodology?: Record<string, unknown> }
).leagueWinnerMethodology;
