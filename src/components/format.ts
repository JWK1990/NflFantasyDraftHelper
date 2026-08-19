import { POSITION_COLORS } from "../config/leagueSettings.ts";
import type { Position } from "../domain/types.ts";

export function positionColor(pos: Position): { bg: string; text: string } {
  return POSITION_COLORS[pos];
}

export function formatAdp(adp: number | null | undefined): string {
  if (adp == null) return "—";
  return Number.isInteger(adp) ? String(adp) : adp.toFixed(1);
}

export function formatStat(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function formatVorp(vorp: number): string {
  return vorp.toFixed(1);
}

export function formatVorpDiff(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "0.0";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign} ${Math.abs(rounded).toFixed(1)}`;
}

export function posLabel(pos: string): string {
  return pos === "DST" ? "D/ST" : pos;
}

export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}
