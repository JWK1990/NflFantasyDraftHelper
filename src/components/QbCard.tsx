import type { QbCard, QbSummary } from "../engine/qbCard.ts";
import {
  lastNameFromPlayer,
  type WatchlistTip,
} from "../engine/watchlistTips.ts";
import { formatPickLabel } from "../engine/snake.ts";

interface QbCardProps {
  card: QbCard | null;
  watchlistTips?: WatchlistTip[];
  qbSummary?: QbSummary;
}

function formatPts(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function QbCardView({ card, watchlistTips = [], qbSummary }: QbCardProps) {
  const tips = [...watchlistTips].sort(
    (a, b) =>
      a.expectedPick - b.expectedPick ||
      a.rank - b.rank ||
      a.player.player.localeCompare(b.player.player),
  );
  const primaryTip = tips[0];
  if (!card && !primaryTip && !qbSummary) return null;

  const edgePts = card ? Math.abs(card.edge) : 0;
  const verdictLabel = !card
    ? null
    : card.tooClose || card.leader === "even"
      ? "QB vs skill is close — follow the list"
      : card.leader === "qb"
        ? "A QB is your strongest next pick"
        : "A skill player is your strongest next pick";

  const deltaLabel = !card
    ? primaryTip
      ? "Watchlist"
      : null
    : card.leader === "even"
      ? "About even"
      : card.leader === "qb"
        ? `QB +${formatPts(edgePts)} pts`
        : `Skill +${formatPts(edgePts)} pts`;

  const guaranteed = card?.guaranteedFloor;
  const capacityLine =
    card == null
      ? null
      : card.capacityToEnd === 0 && card.bestAvailableQb
        ? `Opponent QB capacity: 0 — ${card.bestAvailableQb.player} is guaranteed through ${formatPickLabel(card.lastUserPick)}. No rush.`
        : card.nextUserPick != null
          ? `Opponent QB capacity before ${formatPickLabel(card.nextUserPick)}: ${card.capacityToNext}. ${card.remainingQbCount} QBs remain${
              guaranteed ? `; guaranteed floor ${guaranteed.player}` : ""
            }.`
          : `${card.remainingQbCount} QBs remain${
              guaranteed ? `; guaranteed floor ${guaranteed.player}` : ""
            }.`;

  const verdictClass = primaryTip
    ? "lw"
    : card?.tooClose
      ? "close"
      : card?.leader === "qb"
        ? "qb-now"
        : "skill";
  const title = primaryTip
    ? "Upcoming watchlist players"
    : (verdictLabel ?? "QB tracker");

  return (
    <details className={`qb-card verdict-${verdictClass}${primaryTip ? " has-lw-tip" : ""}`}>
      <summary>
        <div className="qb-card-summary-row">
          <span className="qb-card-title">{title}</span>
          {deltaLabel ? <span className="qb-card-delta">{deltaLabel}</span> : null}
        </div>
        {qbSummary ? (
          <div className="qb-card-qbcounts">
            QBs drafted = {qbSummary.qbsTaken}, Teams Needing QB ={" "}
            {qbSummary.teamsNeedingQb}
          </div>
        ) : null}
        {tips.length > 0 ? (
          <ul className="qb-card-lw-list">
            {tips.map((tip) => (
              <li key={tip.player.id}>
                <span className="qb-card-lw-name">{lastNameFromPlayer(tip.player.player)}</span>
                <span className="qb-card-lw-meta">
                  {` (ADP ${tip.expectedPick}, Rank ${tip.rank}, Picks Before ${tip.picksBefore})`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </summary>
      <div className="qb-card-body">
        <p className="qb-card-hint">
          Draft tips from the ranking below. They never change the order — the
          list already decides.
        </p>
        {card?.bestQb ? (
          <div className="qb-card-row">
            <span>Best QB now: {card.bestQb.player.player}</span>
            <span>{formatPts(card.bestQb.utility)} pts</span>
          </div>
        ) : null}
        {card?.bestSkill ? (
          <div className="qb-card-row">
            <span>Best skill now: {card.bestSkill.player.player}</span>
            <span>{formatPts(card.bestSkill.utility)} pts</span>
          </div>
        ) : null}
        {capacityLine ? <p className="qb-card-reason">{capacityLine}</p> : null}
        {card ? (
          <p className="qb-card-demand">
            <strong>{card.qbsTaken}</strong> QBs drafted so far.{" "}
            {card.teamsNeedingQb.length === 0
              ? "No other team can add a QB — the rest are yours to time."
              : `Still able to draft a QB: ${card.teamsNeedingQb
                  .map((team) => `${team.name} (${team.needs})`)
                  .join(", ")}.`}
          </p>
        ) : null}
      </div>
    </details>
  );
}
