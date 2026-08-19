import { useEffect, useRef } from "react";
import type { DraftedBy, Player, Recommendation } from "../domain/types.ts";
import type { ListFocus } from "./TierPressureStrip.tsx";
import { PlayerRow } from "./PlayerRow.tsx";

interface ListRow {
  player: Player;
  recommendation?: Recommendation;
  draftedBy?: DraftedBy;
}

export interface PickTeamContext {
  isUserPick: boolean;
  /** Initials shown on the grey button during an opponent's pick. */
  initials: string;
  /** Full team name, used for the button title/tooltip. */
  teamName: string;
}

interface RecommendationListProps {
  rows: ListRow[];
  expandedId: string | null;
  ranks: Map<string, number>;
  focus: ListFocus | null;
  topVorp?: number | null;
  pickTeam: PickTeamContext;
  onToggle: (playerId: string) => void;
  onDraft: (playerId: string, draftedBy: DraftedBy) => void;
}

export function RecommendationList({
  rows,
  expandedId,
  ranks,
  focus,
  topVorp = null,
  pickTeam,
  onToggle,
  onDraft,
}: RecommendationListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const match = listRef.current?.querySelector(".player-row:not(.dimmed)");
    match?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus, rows]);

  if (rows.length === 0) {
    return <div className="empty">No matching players.</div>;
  }

  return (
    <div className="list" ref={listRef}>
      {rows.map((row) => {
        const dimmed = Boolean(
          focus &&
            (focus.kind === "pos"
              ? row.player.pos !== focus.pos
              : row.player.pos !== focus.pos || row.player.posTier !== focus.posTier),
        );
        return (
          <PlayerRow
            key={row.player.id}
            player={row.player}
            rank={row.draftedBy ? undefined : ranks.get(row.player.id)}
            recommendation={row.recommendation}
            draftedBy={row.draftedBy}
            expanded={expandedId === row.player.id}
            dimmed={dimmed}
            topVorp={topVorp}
            pickTeam={pickTeam}
            onToggle={() => onToggle(row.player.id)}
            onDraft={(draftedBy) => onDraft(row.player.id, draftedBy)}
          />
        );
      })}
    </div>
  );
}
