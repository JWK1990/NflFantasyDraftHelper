import type { DraftedBy, Player, Recommendation } from "../domain/types.ts";
import { formatAdp, formatVorp, formatVorpDiff, posLabel, positionColor, signed } from "./format.ts";

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

const BREAKDOWN_LABELS: { key: keyof Recommendation["breakdown"]; label: string }[] = [
  { key: "baseValue", label: "Base value" },
  { key: "lineupDelta", label: "Lineup upgrade" },
  { key: "coveragePressure", label: "Fixed-slot coverage" },
  { key: "tierScarcity", label: "Tier cliff" },
  { key: "vonaUrgency", label: "VONA" },
  { key: "marketUrgency", label: "Won't return" },
  { key: "qbTiming", label: "QB timing" },
  { key: "benchPenalty", label: "Bench penalty" },
  { key: "reachPenalty", label: "Reach penalty" },
];

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
              {BREAKDOWN_LABELS.map((row) => {
                const value = recommendation.breakdown[row.key];
                const negative = row.key === "reachPenalty" || row.key === "benchPenalty";
                const display = negative
                  ? `−${Math.abs(value).toFixed(1)}`
                  : signed(value);
                return (
                  <div className="breakdown-row" key={row.key}>
                    <span>{row.label}</span>
                    <span>{display}</span>
                  </div>
                );
              })}
              <div className="breakdown-row">
                <strong>Dynamic score</strong>
                <strong>{recommendation.dynamicScore.toFixed(1)}</strong>
              </div>
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
