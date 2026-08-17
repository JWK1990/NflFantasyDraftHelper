import type { QbBranchComparison } from "../engine/qbBranch.ts";

interface QbBranchCardProps {
  comparison: QbBranchComparison;
  listLeaderName?: string;
}

function formatPts(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function QbBranchCard({ comparison, listLeaderName }: QbBranchCardProps) {
  const waitLeads = comparison.ppwDifference >= 0;
  const leadPts = Math.abs(comparison.difference);
  const leadPpw = Math.abs(comparison.ppwDifference);
  const even = leadPpw < 0.05;
  const verdictLabel =
    comparison.verdict === "qb-now"
      ? "Take a QB with your next pick"
      : comparison.verdict === "double-late"
        ? "You can still wait on QBs"
        : "Too close — follow the list below";
  const deltaLabel = even
    ? "About even"
    : waitLeads
      ? `Wait +${leadPts.toFixed(0)} pts (~${leadPpw.toFixed(1)}/wk)`
      : `QB now +${leadPts.toFixed(0)} pts (~${leadPpw.toFixed(1)}/wk)`;

  return (
    <details className={`qb-card verdict-${comparison.verdict}`}>
      <summary>
        <span className="qb-card-title">{verdictLabel}</span>
        <span className="qb-card-delta">{deltaLabel}</span>
      </summary>
      <div className="qb-card-body">
        <p className="qb-card-hint">
          Advice for your next pick. Numbers update as other teams pick.
        </p>
        <div className="qb-card-row">
          <span>Take a QB next</span>
          <span>
            {formatPts(comparison.qbNow.adjustedPoints)} pts ({comparison.qbNow.ppw.toFixed(1)}/wk)
          </span>
        </div>
        <div className="qb-card-row">
          <span>
            {comparison.doubleLateViable ? "Wait, take QBs late" : "Wait on the next QB"}
          </span>
          <span>
            {formatPts(comparison.wait.adjustedPoints)} pts ({comparison.wait.ppw.toFixed(1)}/wk)
          </span>
        </div>
        <p className="qb-card-reason">{comparison.reason}</p>
        {comparison.verdict === "qb-now" &&
        listLeaderName &&
        comparison.qbNow.firstPick &&
        listLeaderName !== comparison.qbNow.firstPick.player ? (
          <p className="qb-card-risk">
            The list ranks {listLeaderName} first because that pick projects a
            stronger completed team than taking {comparison.qbNow.firstPick.player}.
          </p>
        ) : null}
        <p className="qb-card-risk">{comparison.riskLabel}</p>
      </div>
    </details>
  );
}
