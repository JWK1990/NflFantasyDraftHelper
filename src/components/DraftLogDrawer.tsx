import { POSITION_COLORS, POSITIONS } from "../config/leagueSettings.ts";
import type {
  DraftPick,
  Player,
  Position,
  PositionFilter,
  TagFilter,
  TierFilter,
} from "../domain/types.ts";
import { TAG_FILTERS } from "../engine/tags.ts";
import { posLabel } from "./format.ts";

interface DraftLogDrawerProps {
  open: boolean;
  tab: "search" | "log";
  search: string;
  positionFilter: PositionFilter;
  tierFilter: TierFilter;
  tagFilter: TagFilter;
  picks: DraftPick[];
  playersById: Map<string, Player>;
  onClose: () => void;
  onTab: (tab: "search" | "log") => void;
  onSearch: (search: string) => void;
  onPosition: (position: PositionFilter) => void;
  onTier: (tier: TierFilter) => void;
  onTag: (tag: TagFilter) => void;
  onUndo: () => void;
}

const TIERS: TierFilter[] = ["ALL", 1, 2, 3, 4, 5, 6];

export function DraftLogDrawer({
  open,
  tab,
  search,
  positionFilter,
  tierFilter,
  tagFilter,
  picks,
  playersById,
  onClose,
  onTab,
  onSearch,
  onPosition,
  onTier,
  onTag,
  onUndo,
}: DraftLogDrawerProps) {
  if (!open) return null;

  return (
    <>
      <aside className="drawer" role="dialog" aria-label="Search and draft log">
        <div className="drawer-handle" />
        <div className="drawer-tabs">
          <button
            className={`filter-chip ${tab === "search" ? "active" : ""}`}
            onClick={() => onTab("search")}
          >
            Search
          </button>
          <button
            className={`filter-chip ${tab === "log" ? "active" : ""}`}
            onClick={() => onTab("log")}
          >
            Log ({picks.length})
          </button>
          <button className="filter-chip" onClick={onClose}>
            Close
          </button>
        </div>
        {tab === "search" ? (
          <>
            <input
              className="search-input"
              value={search}
              placeholder="Search player or team"
              onChange={(event) => onSearch(event.target.value)}
              autoFocus
            />
            <div className="filters">
              {(["ALL", ...POSITIONS] as PositionFilter[]).map((position) => {
                const colors =
                  position === "ALL" ? null : POSITION_COLORS[position as Position];
                const active = positionFilter === position;
                return (
                  <button
                    key={position}
                    className={`filter-chip ${active ? "active" : ""}`}
                    style={
                      colors
                        ? {
                            border: `1px solid ${colors.bg}`,
                            background: active ? colors.bg : "transparent",
                            color: active ? colors.text : colors.bg,
                          }
                        : undefined
                    }
                    onClick={() => onPosition(position)}
                  >
                    {position === "ALL" ? "All" : posLabel(position)}
                  </button>
                );
              })}
            </div>
            <div className="filters">
              {TIERS.map((tier) => (
                <button
                  key={String(tier)}
                  className={`filter-chip ${tierFilter === tier ? "active" : ""}`}
                  onClick={() => onTier(tier)}
                >
                  {tier === "ALL" ? "All tiers" : `T${tier}`}
                </button>
              ))}
            </div>
            <div className="filters">
              <button
                className={`filter-chip ${tagFilter === "ALL" ? "active" : ""}`}
                onClick={() => onTag("ALL")}
              >
                All tags
              </button>
              {TAG_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  className={`filter-chip ${tagFilter === filter.id ? "active" : ""}`}
                  onClick={() => onTag(tagFilter === filter.id ? "ALL" : filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="drawer-scroll">
            {picks.length === 0 ? (
              <div className="empty">No picks yet.</div>
            ) : (
              [...picks].reverse().map((pick, index) => {
                const player = playersById.get(pick.playerId);
                const isLast = index === 0;
                return (
                  <div className="log-item" key={`${pick.playerId}-${pick.overallPick}`}>
                    <div>
                      <div>
                        #{pick.overallPick} {player?.player ?? pick.playerId}
                      </div>
                      <div className={pick.draftedBy === "mine" ? "log-mine" : "log-other"}>
                        {pick.draftedBy === "mine" ? "Mine" : "Other"}
                        {player ? ` · ${posLabel(player.pos)} ${player.team}` : ""}
                      </div>
                    </div>
                    {isLast ? (
                      <button className="icon-btn" onClick={onUndo}>
                        Undo
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}
        <p className="incognito-note">
          Draft progress is saved on this device. Private/incognito storage may
          not persist after you close the browser.
        </p>
      </aside>
    </>
  );
}
