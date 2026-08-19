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
          <GlossaryMenu>
            <ResetMenu onReset={onReset} onExport={onExport} />
          </GlossaryMenu>
          <button className="icon-btn" type="button" onClick={onImport}>
            Import
          </button>
        </div>
      </div>
    </header>
  );
}

function ResetMenu({
  onReset,
  onExport,
}: {
  onReset: () => void;
  onExport: () => void;
}) {
  return (
    <section className="glossary-section glossary-draft">
      <h3>Draft</h3>
      <button className="action-btn" type="button" onClick={onExport}>
        Export draft
      </button>
      <p style={{ marginTop: 12 }}>
        Reset clears picks stored on this phone. Private/incognito windows may
        not keep the draft. Paste ESPN picks from Import to catch up, or export
        a JSON backup if you want a second copy.
      </p>
      <ResetConfirm onReset={onReset} />
    </section>
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
