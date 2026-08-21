import type { ValueProfile } from "../domain/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNumber(value: unknown, field: string, player: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid value ${field} for ${player}`);
  }
  return value;
}

export function parseValue(raw: unknown, player: string): ValueProfile | undefined {
  if (raw == null) return undefined;
  if (!isRecord(raw)) {
    throw new Error(`Invalid value profile for ${player}`);
  }
  if (typeof raw.note !== "string" || !raw.note.trim()) {
    throw new Error(`Invalid value note for ${player}`);
  }
  const profile: ValueProfile = {
    fairValue: requireNumber(raw.fairValue, "fairValue", player),
    valueFrom: requireNumber(raw.valueFrom, "valueFrom", player),
    note: raw.note,
  };
  if (raw.strongValueFrom != null) {
    profile.strongValueFrom = requireNumber(raw.strongValueFrom, "strongValueFrom", player);
  }
  return profile;
}
