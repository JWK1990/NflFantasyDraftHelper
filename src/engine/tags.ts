import type { Player, TagFilter } from "../domain/types.ts";

export const TAG_FILTERS = [
  { id: "sleeper", label: "Sleeper" },
  { id: "deep-sleeper", label: "Deep sleeper" },
  { id: "value", label: "Value" },
  { id: "upside", label: "Upside" },
  { id: "risk", label: "Risk" },
  { id: "injury", label: "Injury watch" },
  { id: "anchor", label: "Anchor" },
  { id: "league-winner", label: "Potential League Winner" },
] as const;

export type TagFilterId = Exclude<TagFilter, "ALL">;

export const TAG_FILTER_IDS = new Set<string>([
  "ALL",
  ...TAG_FILTERS.map((filter) => filter.id),
]);

function normalizedTag(player: Player): string {
  return player.tag.trim().toUpperCase();
}

export function scoutingTag(player: Player): string | null {
  const tag = player.tag.trim();
  if (!tag || tag === "K" || tag === "DST") return null;
  return tag;
}

export function playerMatchesTagFilter(
  player: Player,
  filter: TagFilter,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "league-winner") return Boolean(player.leagueWinner);
  const tag = normalizedTag(player);
  if (!tag) return false;
  switch (filter) {
    case "deep-sleeper":
      return tag.includes("DEEP SLEEPER");
    case "sleeper":
      return tag.includes("SLEEPER") && !tag.includes("DEEP SLEEPER");
    case "value":
      return tag.includes("VALUE");
    case "upside":
      return tag.includes("UPSIDE");
    case "risk":
      return tag.includes("RISK");
    case "injury":
      return (
        tag.includes("INJURY WATCH") ||
        tag.includes("INJURY/") ||
        tag.includes("RED WATCH")
      );
    case "anchor":
      return tag.includes("ANCHOR");
    default:
      return false;
  }
}
