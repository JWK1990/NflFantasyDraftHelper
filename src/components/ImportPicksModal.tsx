import { useState } from "react";
import { LEAGUE } from "../config/leagueSettings.ts";

interface ImportPicksModalProps {
  open: boolean;
  error: string | null;
  onClose: () => void;
  onImport: (paste: string, teamName: string) => void;
}

export function ImportPicksModal({
  open,
  error,
  onClose,
  onImport,
}: ImportPicksModalProps) {
  const [paste, setPaste] = useState("");
  const [teamName, setTeamName] = useState(LEAGUE.userTeamName);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="import-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onImport(paste, teamName);
        }}
      >
        <h2>Import picks</h2>
        <p>
          Paste the ESPN pick list. This replaces every pick currently on the
          board. Your team is marked Mine.
        </p>
        <label className="import-label" htmlFor="import-team">
          Your ESPN team name
        </label>
        <input
          id="import-team"
          className="search-input"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <label className="import-label" htmlFor="import-paste">
          ESPN picks
        </label>
        <textarea
          id="import-paste"
          className="import-paste"
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          placeholder="Pick, Player, Team…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {error ? <p className="import-error">{error}</p> : null}
        <div className="import-actions">
          <button type="button" className="action-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="action-btn confirm-import"
            disabled={paste.trim().length === 0}
          >
            Import picks
          </button>
        </div>
      </form>
    </div>
  );
}
