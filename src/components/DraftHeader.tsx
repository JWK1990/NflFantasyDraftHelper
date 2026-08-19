import { LEAGUE } from "../config/leagueSettings.ts";
import { GlossaryMenu } from "./Glossary.tsx";
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
  onExport: () => void;
  onImport: () => void;
}

export function DraftHeader({
  currentOverallPick,
  canUndo,
  onUndo,
  onReset,
  onExport,
  onImport,
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
          <div className={`pick-line${yourTurn && !done ? " your-turn" : ""}`}>
            {done
              ? "Draft complete"
              : `Pick ${currentOverallPick} · R${round}`}
          </div>
          <div className={`until-line${yourTurn && !done ? " your-turn" : ""}`}>
            {done
              ? `${LEAGUE.rounds} rounds · slot ${LEAGUE.userSlot}`
              : yourTurn
                ? `Your turn · pick ${currentOverallPick} (${formatPickLabel(currentOverallPick)})`
                : next
                  ? `${until} pick${until === 1 ? "" : "s"} until pick ${next} (${formatPickLabel(next)})`
                  : "Draft wrapping up"}
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" disabled={!canUndo} onClick={onUndo}>
            Undo
          </button>
          <GlossaryMenu />
          <ResetMenu
            onReset={onReset}
            onExport={onExport}
            onImport={onImport}
          />
        </div>
      </div>
    </header>
  );
}

function ResetMenu({
  onReset,
  onExport,
  onImport,
}: {
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <details className="menu">
      <summary className="icon-btn" style={{ listStyle: "none", display: "grid", placeItems: "center" }}>
        Menu
      </summary>
      <div className="menu-panel">
        <button className="action-btn" type="button" onClick={onExport}>
          Export draft
        </button>
        <button
          className="action-btn"
          type="button"
          onClick={(event) => {
            const menu = event.currentTarget.closest("details");
            if (menu) menu.removeAttribute("open");
            onImport();
          }}
        >
          Import picks
        </button>
        <p style={{ marginTop: 12 }}>
          Reset clears picks stored on this phone. Private/incognito windows may
          not keep the draft. Paste ESPN picks to catch up, or export a JSON
          backup if you want a second copy.
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
