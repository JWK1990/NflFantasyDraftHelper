import type {
  LeagueWinnerArchetype,
  LeagueWinnerConfidence,
  LeagueWinnerProfile,
  LeagueWinnerSource,
} from "../domain/types.ts";

const ARCHETYPES = new Set<LeagueWinnerArchetype>([
  "power-law-ceiling",
  "breakout-role",
  "contingent-upside",
  "rushing-qb",
  "elite-positional-edge",
  "ascending-offense",
]);

const CONFIDENCE = new Set<LeagueWinnerConfidence>(["high", "medium", "low"]);

export const LEAGUE_WINNER_ARCHETYPE_LABELS: Record<LeagueWinnerArchetype, string> = {
  "power-law-ceiling": "Power-law ceiling",
  "breakout-role": "Breakout role",
  "contingent-upside": "Contingent upside",
  "rushing-qb": "Rushing QB",
  "elite-positional-edge": "Elite positional edge",
  "ascending-offense": "Ascending offense",
};

export function formatLeagueWinnerConfidence(value: LeagueWinnerConfidence): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSources(value: unknown, player: string): LeagueWinnerSource[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid leagueWinner sources for ${player}`);
  }
  return value.map((row) => {
    if (!isRecord(row) || typeof row.label !== "string" || !row.label.trim()) {
      throw new Error(`Invalid leagueWinner source for ${player}`);
    }
    const source: LeagueWinnerSource = { label: row.label };
    if (typeof row.url === "string" && row.url.trim()) {
      source.url = row.url;
    }
    return source;
  });
}

export function parseLeagueWinner(
  raw: unknown,
  player: string,
): LeagueWinnerProfile | undefined {
  if (raw == null) return undefined;
  if (!isRecord(raw)) {
    throw new Error(`Invalid leagueWinner for ${player}`);
  }
  if (!CONFIDENCE.has(raw.confidence as LeagueWinnerConfidence)) {
    throw new Error(`Invalid leagueWinner confidence for ${player}`);
  }
  if (!Array.isArray(raw.archetypes) || raw.archetypes.length === 0) {
    throw new Error(`Invalid leagueWinner archetypes for ${player}`);
  }
  const archetypes = raw.archetypes.map((item) => {
    if (!ARCHETYPES.has(item as LeagueWinnerArchetype)) {
      throw new Error(`Invalid leagueWinner archetype for ${player}`);
    }
    return item as LeagueWinnerArchetype;
  });
  if (!Array.isArray(raw.reasons) || !raw.reasons.every((item) => typeof item === "string")) {
    throw new Error(`Invalid leagueWinner reasons for ${player}`);
  }
  const profile: LeagueWinnerProfile = {
    confidence: raw.confidence as LeagueWinnerConfidence,
    archetypes,
    reasons: [...raw.reasons],
    sources: parseSources(raw.sources, player),
  };
  if (typeof raw.reviewedAt === "string" && raw.reviewedAt.trim()) {
    profile.reviewedAt = raw.reviewedAt;
  }
  return profile;
}
