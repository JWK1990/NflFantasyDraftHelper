import type { DraftedBy, Player, Recommendation } from "../domain/types.ts";
import { formatAdp, formatVorp, formatVorpDiff, posLabel, positionColor } from "./format.ts";

interface PlayerRowProps {
  player: Player;
  rank?: number;
  recommendation?: Recommendation;
  draftedBy?: DraftedBy;
  expanded: boolean;
  dimmed?: boolean;
  topVorp?: number | null;
  onToggle: () => void;
  onDraft: (draftedBy: DraftedBy) => void;
}

function formatPts(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function PlayerRow({
  player,
  rank,
  recommendation,
  draftedBy,
  expanded,
  dimmed = false,
  topVorp = null,
  onToggle,
  onDraft,
}: PlayerRowProps) {
  const colors = positionColor(player.pos);
  const vorpVsTop =
    topVorp != null && rank != null && rank !== 1 && !draftedBy
      ? player.vorp - topVorp
      : null;
  return (
    <article className={`player-row${dimmed ? " dimmed" : ""}`}>
      <button className="player-main" onClick={onToggle} type="button">
        <div className="player-top">
          {rank != null ? <span className="rank">{rank}</span> : null}
          <span
            className="pos-chip"
            style={{ background: colors.bg, color: colors.text }}
          >
            {posLabel(player.pos)} T{player.posTier}
          </span>
          <span className="name">{player.player}</span>
          <span className="meta">
            {player.team} · {posLabel(player.pos)}
          </span>
        </div>
        <div className="stats">
          <strong>VORP {formatVorp(player.vorp)}</strong>
          {vorpVsTop != null ? (
            <span className={Math.abs(vorpVsTop) < 4 ? "quiet" : undefined}>
              {` (${formatVorpDiff(vorpVsTop)})`}
            </span>
          ) : null}
          {", "}
          <strong>ADP {formatAdp(player.adp)}</strong>
          {player.tag ? `, ${player.tag}` : null}
        </div>
        {recommendation && recommendation.reasons.length > 0 ? (
          <div className="reasons">
            {recommendation.reasons.map((reason) => (
              <span key={reason} className="reason">
                {reason}
              </span>
            ))}
          </div>
        ) : null}
      </button>
      {draftedBy ? (
        <div className="taken-label">{draftedBy === "mine" ? "MINE" : "TAKEN"}</div>
      ) : (
        <div className="row-actions">
          <button className="btn-mine" type="button" onClick={() => onDraft("mine")}>
            Mine
          </button>
          <button className="btn-other" type="button" onClick={() => onDraft("other")}>
            Other
          </button>
        </div>
      )}
      {expanded ? (
        <div className="breakdown">
          {recommendation ? (
            <>
              <div className="breakdown-row">
                <span>Projected final starters</span>
                <span>{formatPts(recommendation.breakdown.starterProjection)}</span>
              </div>
              <div className="breakdown-row">
                <span>Alternative final team</span>
                <span>{formatPts(recommendation.breakdown.alternativeUtility)}</span>
              </div>
              <div className="breakdown-row">
                <span>Expected gain</span>
                <span>
                  {recommendation.breakdown.expectedGain >= 0 ? "+" : ""}
                  {Math.round(recommendation.breakdown.expectedGain)}
                </span>
              </div>
              <div className="breakdown-row">
                <span>Likely to return at next pick</span>
                <span>
                  {Math.round(recommendation.breakdown.returnProbability * 100)}%
                </span>
              </div>
              <div className="breakdown-row">
                <span>Risk adjustment</span>
                <span>−{Math.round(recommendation.breakdown.riskAdjustment)}</span>
              </div>
              <div className="breakdown-row">
                <span>Bench value</span>
                <span>{recommendation.breakdown.benchValue.toFixed(1)}</span>
              </div>
              <div className="breakdown-row">
                <strong>Completed-team utility</strong>
                <strong>{formatPts(recommendation.breakdown.teamUtility)}</strong>
              </div>
              {recommendation.breakdown.lookahead ? null : (
                <p className="breakdown-note">
                  Approximate — not a full rest-of-draft simulation.
                </p>
              )}
            </>
          ) : (
            <div className="breakdown-row">
              <span>Not in the current recommendation pool.</span>
            </div>
          )}
          {player.note ? <p className="breakdown-note">{player.note}</p> : null}
        </div>
      ) : null}
    </article>
  );
}
