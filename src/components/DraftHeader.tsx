import { LEAGUE } from "../config/leagueSettings.ts";
import {
  formatPickLabel,
  isUserPick,
  picksUntilTurn,
  roundForPick,
  upcomingUserPick,
} from "../engine/snake.ts";

interface DraftHeaderProps {
  currentOverallPick: number;
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
  qb2Mode: "adaptive-punt" | "normal";
  onQb2Mode: (mode: "adaptive-punt" | "normal") => void;
}

export function DraftHeader({
  currentOverallPick,
  canUndo,
  onUndo,
  onReset,
  qb2Mode,
  onQb2Mode,
}: DraftHeaderProps) {
  const round = roundForPick(currentOverallPick);
  const until = picksUntilTurn(currentOverallPick);
  const next = upcomingUserPick(currentOverallPick);
  const yourTurn = isUserPick(currentOverallPick);
  const done = currentOverallPick > LEAGUE.teams * LEAGUE.rounds;

  return (
    <header className="sticky-header">
      <div className="header-row">
        <div className="header-meta">
          <div className="pick-line">
            {done
              ? "Draft complete"
              : `Pick ${currentOverallPick} · R${round}`}
          </div>
          <div className="until-line">
            {done
              ? `${LEAGUE.rounds} rounds · slot ${LEAGUE.userSlot}`
              : yourTurn
                ? `Your turn · ${formatPickLabel(currentOverallPick)}`
                : `${until} pick${until === 1 ? "" : "s"} until ${next ? formatPickLabel(next) : "done"}`}
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" disabled={!canUndo} onClick={onUndo}>
            Undo
          </button>
          <ResetMenu
            qb2Mode={qb2Mode}
            onQb2Mode={onQb2Mode}
            onReset={onReset}
          />
        </div>
      </div>
    </header>
  );
}

function ResetMenu({
  qb2Mode,
  onQb2Mode,
  onReset,
}: {
  qb2Mode: "adaptive-punt" | "normal";
  onQb2Mode: (mode: "adaptive-punt" | "normal") => void;
  onReset: () => void;
}) {
  return (
    <details className="menu">
      <summary className="icon-btn" style={{ listStyle: "none", display: "grid", placeItems: "center" }}>
        Menu
      </summary>
      <div className="menu-panel">
        <p>QB2 mode</p>
        <div className="mode-toggle">
          <button
            className={`filter-chip ${qb2Mode === "adaptive-punt" ? "active" : ""}`}
            onClick={() => onQb2Mode("adaptive-punt")}
          >
            Punt
          </button>
          <button
            className={`filter-chip ${qb2Mode === "normal" ? "active" : ""}`}
            onClick={() => onQb2Mode("normal")}
          >
            Normal
          </button>
        </div>
        <p style={{ marginTop: 12 }}>
          Reset clears picks stored on this phone. Private/incognito windows may
          not keep the draft.
        </p>
        <ResetConfirm onReset={onReset} />
      </div>
    </details>
  );
}

function ResetConfirm({ onReset }: { onReset: () => void }) {
  return (
    <details>
      <summary className="action-btn" style={{ listStyle: "none", textAlign: "center", marginTop: 8 }}>
        Reset draft
      </summary>
      <div className="confirm-box">
        <p>This cannot be undone. Clear the whole board?</p>
        <button className="action-btn confirm-danger" onClick={onReset}>
          Yes, reset
        </button>
      </div>
    </details>
  );
}
