import type { Player, Position } from "../domain/types.ts";
import { normalizeName, normalizeTeam } from "../engine/espnPaste.ts";
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
  espnId?: unknown;
  espnSfRank?: unknown;
}

interface RawCoverage {
  player: unknown;
  team: unknown;
  pos: unknown;
  espnId?: unknown;
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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

export function playerIdentityKey(player: string, team: string, pos: Position): string {
  return `${normalizeName(player)}|${normalizeTeam(team)}|${pos}`;
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
    leagueWinner: parseLeagueWinner(raw.leagueWinner, raw.player),
    espnId: optionalNumber(raw.espnId),
    espnSfRank: optionalNumber(raw.espnSfRank),
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

function coverageToPlayer(raw: RawCoverage, index: number): Player {
  if (typeof raw.player !== "string" || !raw.player.trim()) {
    throw new Error("Coverage player is missing a name");
  }
  if (typeof raw.team !== "string" || !raw.team.trim()) {
    throw new Error(`Coverage player ${raw.player} is missing a team`);
  }
  if (!isPosition(raw.pos) || raw.pos === "DST") {
    throw new Error(`Coverage player ${raw.player} has an invalid position`);
  }
  return {
    id: slug(raw.player, raw.team, raw.pos),
    player: raw.player,
    team: raw.team,
    pos: raw.pos,
    modelRank: 900 + index + 1,
    posRank: index + 1,
    posTier: 9,
    tier: 9,
    modelPts: 0,
    vorp: 0,
    adp: 900,
    tag: "",
    note: "ESPN depth; import and search only.",
    coverageOnly: true,
    espnId: optionalNumber(raw.espnId),
  };
}

export function loadPlayers(): Player[] {
  const offensive = (draftModel as { players: RawPlayer[] }).players.map(toPlayer);
  const kickerOffset = 200;
  const dstOffset = 240;
  const kickers = (specialTeams as { kickers: RawSpecial[] }).kickers.map((row) =>
    specialToPlayer(row, "K", kickerOffset),
  );
  const defenses = (specialTeams as { defenses: RawSpecial[] }).defenses.map((row) =>
    specialToPlayer(row, "DST", dstOffset),
  );

  const merged: Player[] = [];
  const seenIdentity = new Set<string>();
  const seenId = new Set<string>();

  function add(player: Player): void {
    const identity = playerIdentityKey(player.player, player.team, player.pos);
    if (seenIdentity.has(identity) || seenId.has(player.id)) return;
    seenIdentity.add(identity);
    seenId.add(player.id);
    merged.push(player);
  }

  for (const player of [...offensive, ...kickers, ...defenses]) {
    add(player);
  }

  const coverage = ((draftModel as { coverage?: RawCoverage[] }).coverage ?? []).map(
    coverageToPlayer,
  );
  for (const player of coverage) {
    add(player);
  }

  return merged;
}

export const DATASET_GENERATED = (draftModel as { generated?: string }).generated ?? "";

export const LEAGUE_WINNER_METHODOLOGY = (
  draftModel as { leagueWinnerMethodology?: Record<string, unknown> }
).leagueWinnerMethodology;
