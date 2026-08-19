import type { DraftedBy, Player, Recommendation } from "../domain/types.ts";
import type { PickTeamContext } from "./RecommendationList.tsx";
import { formatAdp, formatVorp, formatVorpDiff, posLabel, positionColor } from "./format.ts";
import { scoutingTag } from "../engine/tags.ts";
import { useChipExplain } from "./ChipExplainContext.tsx";
import { LeagueWinnerDetail } from "./LeagueWinnerDetail.tsx";

interface PlayerRowProps {
  player: Player;
  rank?: number;
  recommendation?: Recommendation;
  draftedBy?: DraftedBy;
  expanded: boolean;
  dimmed?: boolean;
  topVorp?: number | null;
  pickTeam: PickTeamContext;
  busy?: boolean;
  onToggle: () => void;
  onDraft: (draftedBy: DraftedBy) => void;
}

function ReasonText({ reason }: { reason: string }) {
  const match = reason.match(/^(Unlikely|likely)( to be available at pick \d+)$/);
  if (!match) return reason;
  const kind = match[1] === "Unlikely" ? "reason-unlikely" : "reason-likely";
  return (
    <>
      <strong className={kind}>{match[1]}</strong>
      {match[2]}
    </>
  );
}

function formatPts(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function laterLine(
  label: string,
  row: Recommendation["breakdown"]["laterQb"],
) {
  if (!row) return null;
  return (
    <div className="breakdown-row">
      <span>{label}</span>
      <span>
        {row.player}, pick {row.overallPick} ({Math.round(row.returnProbability * 100)}%)
      </span>
    </div>
  );
}

export function PlayerRow({
  player,
  rank,
  recommendation,
  draftedBy,
  expanded,
  dimmed = false,
  topVorp = null,
  pickTeam,
  busy = false,
  onToggle,
  onDraft,
}: PlayerRowProps) {
  const explain = useChipExplain();
  const colors = positionColor(player.pos);
  const vorpVsTop =
    topVorp != null && rank != null && rank !== 1 && !draftedBy
      ? player.vorp - topVorp
      : null;
  const tag = scoutingTag(player);
  const reasons = recommendation?.reasons ?? (tag ? [tag] : []);
  return (
    <article className={`player-row${dimmed ? " dimmed" : ""}`}>
      <div className="player-main">
        <div className="player-top">
          {rank != null ? <span className="rank">{rank}</span> : null}
          <button
            className="pos-chip"
            type="button"
            style={{ background: colors.bg, color: colors.text }}
            onClick={() => explain(`${posLabel(player.pos)} T${player.posTier}`)}
          >
            {posLabel(player.pos)} T{player.posTier}
          </button>
          <button className="player-ident" type="button" onClick={onToggle}>
            <span className="name">{player.player}</span>
            <span className="meta">
              {player.team} · {posLabel(player.pos)}
            </span>
          </button>
        </div>
        <button className="stats" type="button" onClick={onToggle}>
          <strong>VORP {formatVorp(player.vorp)}</strong>
          {vorpVsTop != null ? (
            <span className={Math.abs(vorpVsTop) < 4 ? "quiet" : undefined}>
              {` (${formatVorpDiff(vorpVsTop)})`}
            </span>
          ) : null}
          {", "}
          <strong>ADP {formatAdp(player.adp)}</strong>
        </button>
        {reasons.length > 0 || player.leagueWinner ? (
          <div className="reasons">
            {player.leagueWinner ? (
              <button
                className="reason lw-chip"
                type="button"
                aria-label={`League Winner candidate, ${player.leagueWinner.confidence} confidence`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!expanded) onToggle();
                }}
              >
                LW
              </button>
            ) : null}
            {reasons.map((reason) => (
              <button
                key={reason}
                type="button"
                className="reason"
                onClick={() => explain(reason)}
              >
                <ReasonText reason={reason} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {draftedBy ? (
        <div className="taken-label">{draftedBy === "mine" ? "MINE" : "TAKEN"}</div>
      ) : pickTeam.isUserPick ? (
        <div className="row-actions">
          <button
            className={`btn-mine${busy ? " is-busy" : ""}`}
            type="button"
            disabled={busy}
            onClick={() => onDraft("mine")}
          >
            {busy ? <span className="btn-spinner" aria-label="Updating" /> : "Mine"}
          </button>
        </div>
      ) : (
        <div className="row-actions">
          <button
            className={`btn-other${busy ? " is-busy" : ""}`}
            type="button"
            disabled={busy}
            title={`Drafted by ${pickTeam.teamName}`}
            onClick={() => onDraft("other")}
          >
            {busy ? <span className="btn-spinner" aria-label="Updating" /> : pickTeam.initials}
          </button>
        </div>
      )}
      {expanded ? (
        <div className="breakdown">
          {recommendation ? (
            <>
              <div className="breakdown-row">
                <span>Candidate secured now</span>
                <span>{recommendation.breakdown.candidateSecuredNow}</span>
              </div>
              <div className="breakdown-row">
                <span>Pre-selection state hash</span>
                <span className="breakdown-hash">
                  {recommendation.breakdown.preSelectionStateHash}
                </span>
              </div>
              <div className="breakdown-row">
                <span>Expected completed starters</span>
                <span>{formatPts(recommendation.breakdown.starterProjection)}</span>
              </div>
              <div className="breakdown-row">
                <span>Best same-board alternative</span>
                <span>
                  {recommendation.breakdown.alternativePlayer
                    ? `${recommendation.breakdown.alternativePlayer}, `
                    : ""}
                  {formatPts(recommendation.breakdown.alternativeUtility)}
                </span>
              </div>
              <div className="breakdown-row">
                <span>Recommendation edge</span>
                <span>{formatSigned(recommendation.breakdown.expectedGain)}</span>
              </div>
              {recommendation.breakdown.verdict ? (
                <div className="breakdown-row">
                  <span>Verdict</span>
                  <span>
                    {recommendation.breakdown.verdict === "clear-edge"
                      ? "Clear edge"
                      : recommendation.breakdown.verdict === "lean"
                        ? "Lean"
                        : "Too close"}
                  </span>
                </div>
              ) : null}
              {recommendation.breakdown.winsVsAlternative != null ? (
                <div className="breakdown-row">
                  <span>Wins matched simulations</span>
                  <span>
                    {Math.round(recommendation.breakdown.winsVsAlternative * 100)}%
                  </span>
                </div>
              ) : null}
              {recommendation.breakdown.utilityP25 != null &&
              recommendation.breakdown.utilityP75 != null ? (
                <div className="breakdown-row">
                  <span>Outcome range (P25–P75)</span>
                  <span>
                    {formatPts(recommendation.breakdown.utilityP25)} to{" "}
                    {formatPts(recommendation.breakdown.utilityP75)}
                  </span>
                </div>
              ) : null}
              <div className="breakdown-row">
                <span>Candidate direct projection</span>
                <span>{recommendation.breakdown.directProjection.toFixed(1)}</span>
              </div>
              <div className="breakdown-row">
                <span>
                  Continuation / timing versus{" "}
                  {recommendation.breakdown.alternativePlayer ?? "the alternative"}
                </span>
                <span>{formatSigned(recommendation.breakdown.continuationEffect)}</span>
              </div>
              <div className="breakdown-row">
                <span>Return rate across matched streams</span>
                <span>
                  {Math.round(recommendation.breakdown.returnProbability * 100)}%
                  {recommendation.breakdown.waitPick != null
                    ? ` at pick ${recommendation.breakdown.waitPick}`
                    : ""}
                </span>
              </div>
              <div className="breakdown-row">
                <span>
                  Availability-adjusted edge vs{" "}
                  {recommendation.breakdown.alternativePlayer ?? "the alternative"}
                </span>
                <span>{formatSigned(recommendation.breakdown.expectedPassLoss)}</span>
              </div>
              <div className="breakdown-row">
                <span>Drop to next likely {recommendation.player.pos}</span>
                <span>{formatSigned(recommendation.breakdown.positionalPassLoss)}</span>
              </div>
              {laterLine("Later QB", recommendation.breakdown.laterQb)}
              {laterLine("Later WR", recommendation.breakdown.laterWr)}
              {laterLine("Later TE", recommendation.breakdown.laterTe)}
              {recommendation.breakdown.samePositionComparison ? (
                <p className="breakdown-note">
                  Versus {recommendation.breakdown.samePositionComparison.otherPlayer}:
                  direct{" "}
                  {formatSigned(
                    recommendation.breakdown.samePositionComparison.directEdge,
                  )}
                  , continuation{" "}
                  {formatSigned(
                    recommendation.breakdown.samePositionComparison.continuationEdge,
                  )}
                  , net completed-team{" "}
                  {formatSigned(
                    recommendation.breakdown.samePositionComparison.netEdge,
                  )}
                  . Wins paired scenarios:{" "}
                  {Math.round(
                    recommendation.breakdown.samePositionComparison.winRate * 100,
                  )}
                  %.
                </p>
              ) : null}
              {recommendation.breakdown.samePositionInversion ? (
                <p className="breakdown-note">
                  Ranked above {recommendation.breakdown.samePositionInversion.otherPlayer}{" "}
                  because continuation overcame a{" "}
                  {formatSigned(
                    recommendation.breakdown.samePositionInversion.directEdge,
                  )}{" "}
                  direct-projection gap. Net completed-team edge:{" "}
                  {formatSigned(
                    recommendation.breakdown.samePositionInversion.netEdge,
                  )}
                  . Wins paired scenarios:{" "}
                  {Math.round(
                    recommendation.breakdown.samePositionInversion.winRate * 100,
                  )}
                  %. Verdict:{" "}
                  {recommendation.breakdown.samePositionInversion.verdict ===
                  "too-close"
                    ? "Unstable — keep direct-value order unless the edge is robust"
                    : recommendation.breakdown.samePositionInversion.verdict === "lean"
                      ? "Lean"
                      : "Clear edge"}
                  .
                </p>
              ) : null}
              {recommendation.breakdown.riskAdjustment > 0 ? (
                <div className="breakdown-row">
                  <span>Risk adjustment</span>
                  <span>−{Math.round(recommendation.breakdown.riskAdjustment)}</span>
                </div>
              ) : null}
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
          {player.leagueWinner ? (
            <LeagueWinnerDetail profile={player.leagueWinner} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
