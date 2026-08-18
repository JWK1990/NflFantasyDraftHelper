import { LEAGUE } from "../config/leagueSettings.ts";
import type { DraftPick, Player, Position } from "../domain/types.ts";
import { roundForPick } from "./snake.ts";

export interface EspnPasteRow {
  overallPick: number;
  player: string;
  team: string;
  pos: string;
  fantasyTeam: string;
}

export interface EspnPasteSuccess {
  ok: true;
  rows: EspnPasteRow[];
  picks: DraftPick[];
  mineCount: number;
}

export interface EspnPasteFailure {
  ok: false;
  error: string;
  unmatched: EspnPasteRow[];
}

export type EspnPasteResult = EspnPasteSuccess | EspnPasteFailure;

const HEADER = /^(pick|player|team|rk|proj\s*pts|\d{4}\s*pts)$/i;
const ROUND = /^round\s+\d+$/i;
const PICK_NUMBER = /^\d{1,3}$/;
const NUMERIC = /^-?\d[\d,]*\.?\d*$/;
const TEAM_CODE = /^[A-Z]{2,4}$/;
const INJURY_STATUS = /^(Q|O|D|P|S|IR|IR-R|PUP|NFI|SUSP|OUT)$/i;

const TEAM_ALIASES: Record<string, string> = {
  WSH: "WAS",
  WAS: "WAS",
  JAX: "JAX",
  JAC: "JAX",
  ARI: "ARI",
  ARZ: "ARI",
  LA: "LAR",
  STL: "LAR",
  OAK: "LV",
  SD: "LAC",
};

export function tokenizeEspnPaste(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split("\t"))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export function parseEspnPosition(token: string): Position | null {
  const compact = token.toUpperCase().replace(/\s+/g, "");
  if (compact === "QB" || compact === "RB" || compact === "WR" || compact === "TE" || compact === "K") {
    return compact;
  }
  if (compact.startsWith("WR")) return "WR";
  if (compact.startsWith("RB")) return "RB";
  if (compact.startsWith("TE")) return "TE";
  if (compact === "D/ST" || compact === "DST" || compact === "DEF") {
    return "DST";
  }
  return null;
}

function isTeamToken(token: string): boolean {
  return TEAM_CODE.test(token.toUpperCase());
}

function isStatToken(token: string): boolean {
  return token === "-" || NUMERIC.test(token);
}

function isInjuryStatus(token: string, team: string | undefined, pos: string | undefined): boolean {
  if (!INJURY_STATUS.test(token) || team == null || pos == null) return false;
  return isTeamToken(team) && parseEspnPosition(pos) != null;
}

export function parseEspnPasteRows(text: string): EspnPasteRow[] {
  const tokens = tokenizeEspnPaste(text);
  const rows: EspnPasteRow[] = [];

  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index];
    if (!token || HEADER.test(token) || ROUND.test(token)) {
      index += 1;
      continue;
    }
    if (!PICK_NUMBER.test(token)) {
      index += 1;
      continue;
    }

    const overallPick = Number(token);
    const player = tokens[index + 1];
    if (
      !player ||
      HEADER.test(player) ||
      ROUND.test(player) ||
      PICK_NUMBER.test(player)
    ) {
      index += 1;
      continue;
    }

    let cursor = index + 2;
    if (isInjuryStatus(tokens[cursor] ?? "", tokens[cursor + 1], tokens[cursor + 2])) {
      cursor += 1;
    }
    const team = tokens[cursor];
    const pos = tokens[cursor + 1];
    const fantasyTeam = tokens[cursor + 2];
    if (
      !team ||
      !pos ||
      fantasyTeam == null ||
      parseEspnPosition(pos) == null ||
      !isTeamToken(team) ||
      HEADER.test(fantasyTeam) ||
      ROUND.test(fantasyTeam)
    ) {
      index += 1;
      continue;
    }

    rows.push({
      overallPick,
      player,
      team: team.toUpperCase(),
      pos,
      fantasyTeam,
    });

    cursor += 3;
    let consumed = 0;
    while (consumed < 3 && tokens[cursor] != null && isStatToken(tokens[cursor]!)) {
      cursor += 1;
      consumed += 1;
    }
    index = cursor;
  }

  return rows;
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’`]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\b(d\s*\/?\s*st|dst|defense)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTeam(team: string): string {
  const upper = team.toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
}

export function fantasyTeamsMatch(left: string, right: string): boolean {
  return normalizeName(left) === normalizeName(right);
}

const FIRST_NAME_ALIASES: Record<string, string[]> = {
  kenny: ["kenneth"],
  kenneth: ["kenny"],
};

function nameVariants(playerName: string): string[] {
  const normalized = normalizeName(playerName);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 2) return [normalized];
  const first = parts[0]!;
  const rest = parts.slice(1).join(" ");
  const aliases = FIRST_NAME_ALIASES[first] ?? [];
  return [normalized, ...aliases.map((alias) => `${alias} ${rest}`)];
}

export function matchEspnPlayer(
  players: Player[],
  row: EspnPasteRow,
): Player | null {
  const pos = parseEspnPosition(row.pos);
  if (!pos) return null;
  const variants = nameVariants(row.player);
  const team = normalizeTeam(row.team);
  const pool = players.filter((player) => player.pos === pos);

  if (pos === "DST") {
    const byTeam = pool.filter((player) => normalizeTeam(player.team) === team);
    if (byTeam.length === 1) return byTeam[0]!;
    const byName = pool.filter((player) => {
      const playerName = normalizeName(player.player);
      return variants.some(
        (name) =>
          name === playerName ||
          name.includes(playerName) ||
          playerName.includes(name),
      );
    });
    if (byName.length === 1) return byName[0]!;
    return null;
  }

  const named = pool.filter((player) => variants.includes(normalizeName(player.player)));
  if (named.length === 1) return named[0]!;
  const withTeam = named.filter((player) => normalizeTeam(player.team) === team);
  if (withTeam.length === 1) return withTeam[0]!;
  return null;
}

function validateSequence(rows: EspnPasteRow[]): string | null {
  if (rows.length === 0) {
    return "No picks found. Copy the ESPN pick list and paste it here.";
  }
  const sorted = [...rows].sort((a, b) => a.overallPick - b.overallPick);
  if (sorted[0]?.overallPick !== 1) {
    return "Picks must start at 1 so the board stays in order.";
  }
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index]?.overallPick !== index + 1) {
      return `Pick ${index + 1} is missing. Paste from the start of the draft.`;
    }
  }
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.overallPick)) {
      return `Pick ${row.overallPick} appears more than once.`;
    }
    seen.add(row.overallPick);
  }
  return null;
}

export function importEspnPicks(
  text: string,
  players: Player[],
  userTeamName: string = LEAGUE.userTeamName,
  now: string = new Date().toISOString(),
): EspnPasteResult {
  const rows = parseEspnPasteRows(text).sort(
    (a, b) => a.overallPick - b.overallPick,
  );
  const sequenceError = validateSequence(rows);
  if (sequenceError) {
    return { ok: false, error: sequenceError, unmatched: [] };
  }

  const unmatched: EspnPasteRow[] = [];
  const used = new Set<string>();
  const picks: DraftPick[] = [];
  let mineCount = 0;

  for (const row of rows) {
    const player = matchEspnPlayer(players, row);
    if (!player || used.has(player.id)) {
      unmatched.push(row);
      continue;
    }
    used.add(player.id);
    const mine = fantasyTeamsMatch(row.fantasyTeam, userTeamName);
    if (mine) mineCount += 1;
    picks.push({
      playerId: player.id,
      draftedBy: mine ? "mine" : "other",
      overallPick: row.overallPick,
      round: roundForPick(row.overallPick),
      timestamp: now,
    });
  }

  if (unmatched.length > 0) {
    const names = unmatched
      .map((row) => `${row.overallPick} ${row.player}`)
      .join(", ");
    return {
      ok: false,
      error: `Could not match ${unmatched.length} player${unmatched.length === 1 ? "" : "s"}: ${names}. Nothing was imported.`,
      unmatched,
    };
  }

  return { ok: true, rows, picks, mineCount };
}
