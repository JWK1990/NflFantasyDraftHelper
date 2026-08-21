import type { AgeSource, Player, PlayerOutlook, Position } from "../domain/types.ts";
import { normalizeName, normalizeTeam } from "../engine/espnPaste.ts";
import draftModel from "./draft_model_data.json";
import specialTeams from "./specialTeams.json";
import { parseLeagueWinner } from "./leagueWinner.ts";
import { parseValue } from "./value.ts";

const POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DST"]);
const AGE_SOURCES = new Set<AgeSource>(["DraftSharks", "Sleeper", "ESPN"]);

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
  watchlist?: unknown;
  value?: unknown;
  espnId?: unknown;
  birthDate?: unknown;
  age?: unknown;
  ageAsOf?: unknown;
  ageSource?: unknown;
  cbsPprProjection?: unknown;
  fantasyProsPprProjection?: unknown;
  draftSharksConsensusProjection?: unknown;
  projectionSourceCount?: unknown;
  sfConsensusAdp?: unknown;
  sleeperSfAdp?: unknown;
  espnRoomAdp?: unknown;
  draftSharksSfRank?: unknown;
  fantasyProsSfRank?: unknown;
  fantasyProsSfTier?: unknown;
  espnConsensusPosRank?: unknown;
  espnConsensusAvgRank?: unknown;
  yahooConsensusPprRank?: unknown;
  yahooConsensusPosRank?: unknown;
  superflexConsensusRank?: unknown;
  superflexConsensusSourceCount?: unknown;
  outlook?: unknown;
}

interface RawCoverage {
  player: unknown;
  team: unknown;
  pos: unknown;
  espnId?: unknown;
  birthDate?: unknown;
  age?: unknown;
  ageAsOf?: unknown;
  ageSource?: unknown;
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseAgeSource(value: unknown): AgeSource | undefined {
  return typeof value === "string" && AGE_SOURCES.has(value as AgeSource)
    ? (value as AgeSource)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseOutlook(raw: unknown, player: string): PlayerOutlook | undefined {
  if (raw == null) return undefined;
  if (!isRecord(raw)) {
    throw new Error(`Invalid outlook for ${player}`);
  }
  if (raw.source !== "DraftSharks") {
    throw new Error(`Invalid outlook source for ${player}`);
  }
  if (typeof raw.sourceUrl !== "string" || !raw.sourceUrl.trim()) {
    throw new Error(`Invalid outlook sourceUrl for ${player}`);
  }
  if (typeof raw.asOf !== "string" || !raw.asOf.trim()) {
    throw new Error(`Invalid outlook asOf for ${player}`);
  }
  const summary =
    raw.summary == null
      ? null
      : typeof raw.summary === "string"
        ? raw.summary
        : (() => {
            throw new Error(`Invalid outlook summary for ${player}`);
          })();
  const bottomLineExcerpt =
    raw.bottomLineExcerpt == null
      ? null
      : typeof raw.bottomLineExcerpt === "string"
        ? raw.bottomLineExcerpt
        : (() => {
            throw new Error(`Invalid outlook excerpt for ${player}`);
          })();
  return {
    summary,
    bottomLineExcerpt,
    source: "DraftSharks",
    sourceUrl: raw.sourceUrl,
    asOf: raw.asOf,
  };
}

function ageFields(raw: {
  espnId?: unknown;
  birthDate?: unknown;
  age?: unknown;
  ageAsOf?: unknown;
  ageSource?: unknown;
}): Pick<Player, "espnId" | "birthDate" | "age" | "ageAsOf" | "ageSource"> {
  return {
    espnId: optionalNumber(raw.espnId),
    birthDate: optionalString(raw.birthDate),
    age: optionalNumber(raw.age),
    ageAsOf: optionalString(raw.ageAsOf),
    ageSource: parseAgeSource(raw.ageSource),
  };
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
  const sfConsensusAdp = optionalNumber(raw.sfConsensusAdp);
  const adpValue = optionalNumber(raw.adp) ?? sfConsensusAdp;
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
    adp: adpValue ?? null,
    tag,
    note: typeof raw.note === "string" ? raw.note : "",
    leagueWinner: parseLeagueWinner(raw.leagueWinner, raw.player),
    watchlist: raw.watchlist === true ? true : undefined,
    value: parseValue(raw.value, raw.player),
    ...ageFields(raw),
    cbsPprProjection: optionalNumber(raw.cbsPprProjection),
    fantasyProsPprProjection: optionalNumber(raw.fantasyProsPprProjection),
    draftSharksConsensusProjection: optionalNumber(raw.draftSharksConsensusProjection),
    projectionSourceCount: optionalNumber(raw.projectionSourceCount),
    sfConsensusAdp,
    sleeperSfAdp: optionalNumber(raw.sleeperSfAdp),
    espnRoomAdp: optionalNumber(raw.espnRoomAdp),
    draftSharksSfRank: optionalNumber(raw.draftSharksSfRank),
    fantasyProsSfRank: optionalNumber(raw.fantasyProsSfRank),
    fantasyProsSfTier: optionalNumber(raw.fantasyProsSfTier),
    espnConsensusPosRank: optionalNumber(raw.espnConsensusPosRank),
    espnConsensusAvgRank: optionalNumber(raw.espnConsensusAvgRank),
    yahooConsensusPprRank: optionalNumber(raw.yahooConsensusPprRank),
    yahooConsensusPosRank: optionalNumber(raw.yahooConsensusPosRank),
    superflexConsensusRank: optionalNumber(raw.superflexConsensusRank),
    superflexConsensusSourceCount: optionalNumber(raw.superflexConsensusSourceCount),
    outlook: parseOutlook(raw.outlook, raw.player),
  };
}

function specialToPlayer(
  raw: RawSpecial,
  pos: "K" | "DST",
  rankOffset: number,
  coverage?: RawCoverage,
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
    ...ageFields(coverage ?? {}),
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
    ...ageFields(raw),
  };
}

export function loadPlayers(): Player[] {
  const offensive = (draftModel as { players: RawPlayer[] }).players.map(toPlayer);
  const kickerOffset = 200;
  const dstOffset = 240;
  const coverageRaw = (draftModel as { coverage?: RawCoverage[] }).coverage ?? [];
  const coverageByIdentity = new Map<string, RawCoverage>();
  for (const raw of coverageRaw) {
    if (typeof raw.player !== "string" || typeof raw.team !== "string" || !isPosition(raw.pos)) {
      continue;
    }
    coverageByIdentity.set(playerIdentityKey(raw.player, raw.team, raw.pos), raw);
  }
  const kickers = (specialTeams as { kickers: RawSpecial[] }).kickers.map((row) =>
    specialToPlayer(
      row,
      "K",
      kickerOffset,
      coverageByIdentity.get(playerIdentityKey(row.player, row.team, "K")),
    ),
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

  const coverage = coverageRaw.map(coverageToPlayer);
  for (const player of coverage) {
    add(player);
  }

  return merged;
}

export const DATASET_GENERATED = (draftModel as { generated?: string }).generated ?? "";

export const REPLACEMENT = (
  draftModel as { replacement?: { QB: number; RB: number; WR: number; TE: number } }
).replacement ?? { QB: 0, RB: 0, WR: 0, TE: 0 };

export const LEAGUE_WINNER_METHODOLOGY = (
  draftModel as { leagueWinnerMethodology?: Record<string, unknown> }
).leagueWinnerMethodology;
