import type { QbCard } from "../engine/qbCard.ts";
import { formatPickLabel } from "../engine/snake.ts";

interface QbCardProps {
  card: QbCard;
}

function formatPts(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function QbCardView({ card }: QbCardProps) {
  const edgePts = Math.abs(card.edge);
  const verdictLabel =
    card.tooClose || card.leader === "even"
      ? "QB vs skill is close — follow the list"
      : card.leader === "qb"
        ? "A QB is your strongest next pick"
        : "A skill player is your strongest next pick";

  const deltaLabel =
    card.leader === "even"
      ? "About even"
      : card.leader === "qb"
        ? `QB +${formatPts(edgePts)} pts`
        : `Skill +${formatPts(edgePts)} pts`;

  const guaranteed = card.guaranteedFloor;
  const capacityLine =
    card.capacityToEnd === 0 && card.bestAvailableQb
      ? `Opponent QB capacity: 0 — ${card.bestAvailableQb.player} is guaranteed through ${formatPickLabel(card.lastUserPick)}. No rush.`
      : card.nextUserPick != null
        ? `Opponent QB capacity before ${formatPickLabel(card.nextUserPick)}: ${card.capacityToNext}. ${card.remainingQbCount} QBs remain${
            guaranteed ? `; guaranteed floor ${guaranteed.player}` : ""
          }.`
        : `${card.remainingQbCount} QBs remain${
            guaranteed ? `; guaranteed floor ${guaranteed.player}` : ""
          }.`;

  const verdictClass = card.tooClose
    ? "close"
    : card.leader === "qb"
      ? "qb-now"
      : "skill";

  return (
    <details className={`qb-card verdict-${verdictClass}`}>
      <summary>
        <span className="qb-card-title">{verdictLabel}</span>
        <span className="qb-card-delta">{deltaLabel}</span>
      </summary>
      <div className="qb-card-body">
        <p className="qb-card-hint">
          Explains your next pick from the ranking below. It never changes the
          order — the list already decides.
        </p>
        {card.bestQb ? (
          <div className="qb-card-row">
            <span>Best QB now: {card.bestQb.player.player}</span>
            <span>{formatPts(card.bestQb.utility)} pts</span>
          </div>
        ) : null}
        {card.bestSkill ? (
          <div className="qb-card-row">
            <span>Best skill now: {card.bestSkill.player.player}</span>
            <span>{formatPts(card.bestSkill.utility)} pts</span>
          </div>
        ) : null}
        <p className="qb-card-reason">{capacityLine}</p>
      </div>
    </details>
  );
}
