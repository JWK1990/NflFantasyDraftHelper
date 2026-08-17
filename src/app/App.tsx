import { useEffect, useMemo, useReducer, useState } from "react";
import { LEAGUE } from "../config/leagueSettings.ts";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftedBy } from "../domain/types.ts";
import { matchesFilters, recommend } from "../engine/recommend.ts";
import { draftedIds, playersById, rosterCounts, rosterCoverage } from "../engine/roster.ts";
import { remainingByPosTier, currentEdgeTiers } from "../engine/tierScarcity.ts";
import { isUserPick } from "../engine/snake.ts";
import { compareQbBranches } from "../engine/qbBranch.ts";
import { QbBranchCard } from "../components/QbBranchCard.tsx";
import { DraftHeader } from "../components/DraftHeader.tsx";
import { DraftLogDrawer } from "../components/DraftLogDrawer.tsx";
import { RecommendationList } from "../components/RecommendationList.tsx";
import { RosterStrip } from "../components/RosterStrip.tsx";
import { TierPressureStrip, type TierFocus } from "../components/TierPressureStrip.tsx";
import { Toast } from "../components/Toast.tsx";
import { draftReducer } from "../state/draftReducer.ts";
import { loadState, saveState } from "../state/persistence.ts";

const players = loadPlayers();
const byId = playersById(players);
const hydrated = loadState();

interface ToastState {
  message: string;
  warning?: boolean;
  showUndo?: boolean;
}

export default function App() {
  const [state, dispatch] = useReducer(draftReducer, hydrated.state);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"search" | "log">("search");
  const [toast, setToast] = useState<ToastState | null>(
    hydrated.resetReason ? { message: hydrated.resetReason, warning: true } : null,
  );
  const [resetBanner] = useState(hydrated.resetReason);
  const [tierFocus, setTierFocus] = useState<TierFocus | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentOverallPick = state.picks.length + 1;
  const counts = useMemo(() => rosterCounts(state.picks, byId), [state.picks]);
  const coverage = useMemo(() => rosterCoverage(counts), [counts]);
  const recs = useMemo(() => recommend(players, state), [state]);
  const qbBranch = useMemo(() => compareQbBranches(players, state), [state]);
  const recById = useMemo(
    () => new Map(recs.map((row) => [row.player.id, row])),
    [recs],
  );
  const rankById = useMemo(() => {
    const ranks = new Map<string, number>();
    recs.forEach((row, index) => ranks.set(row.player.id, index + 1));
    return ranks;
  }, [recs]);
  const taken = useMemo(() => draftedIds(state.picks), [state.picks]);
  const available = useMemo(
    () => players.filter((player) => !taken.has(player.id)),
    [taken],
  );
  const endingTiers = useMemo(
    () => currentEdgeTiers(remainingByPosTier(available)),
    [available],
  );

  useEffect(() => {
    if (!tierFocus) return;
    const stillExists = endingTiers.some(
      (tier) => tier.pos === tierFocus.pos && tier.posTier === tierFocus.posTier,
    );
    if (!stillExists) setTierFocus(null);
  }, [endingTiers, tierFocus]);

  const filtering =
    state.search.trim() !== "" ||
    state.positionFilter !== "ALL" ||
    state.tierFilter !== "ALL";

  const rows = useMemo(() => {
    if (state.search.trim()) {
      return players.filter((player) => matchesFilters(player, state)).map((player) => ({
        player,
        recommendation: recById.get(player.id),
        draftedBy: state.picks.find((pick) => pick.playerId === player.id)?.draftedBy,
      }));
    }
    const source = filtering
      ? recs.filter((row) => matchesFilters(row.player, state))
      : recs;
    return source.map((row) => ({
      player: row.player,
      recommendation: row,
    }));
  }, [filtering, recById, recs, state]);

  function handleDraft(playerId: string, draftedBy: DraftedBy) {
    const player = byId.get(playerId);
    const offSchedule = draftedBy === "mine" && !isUserPick(currentOverallPick);
    dispatch({ type: "DRAFT_PLAYER", playerId, draftedBy });
    setExpandedId(null);
    setToast({
      message: offSchedule
        ? `Recorded ${player?.player ?? "pick"} off-schedule. You can undo if that was a miss.`
        : `${draftedBy === "mine" ? "You drafted" : "Off the board:"} ${player?.player ?? "player"}`,
      warning: offSchedule,
      showUndo: true,
    });
  }

  return (
    <div className={`app-shell${drawerOpen ? " drawer-open" : ""}`}>
      <DraftHeader
        currentOverallPick={currentOverallPick}
        canUndo={state.picks.length > 0}
        onUndo={() => dispatch({ type: "UNDO_LAST_PICK" })}
        onReset={() => {
          dispatch({ type: "RESET_DRAFT" });
          setToast({ message: "Draft reset.", warning: true });
        }}
        qb2Mode={state.qb2Mode}
        onQb2Mode={(mode) => dispatch({ type: "SET_QB2_MODE", mode })}
      />
      {resetBanner ? <div className="banner">{resetBanner}</div> : null}
      <RosterStrip
        coverage={coverage}
        qbCount={counts.QB}
        qbCap={LEAGUE.hardCaps.QB}
        positionFilter={state.positionFilter}
        onPosition={(position) => {
          setTierFocus(null);
          dispatch({ type: "SET_POSITION_FILTER", position });
        }}
      />
      {qbBranch ? (
        <QbBranchCard
          comparison={qbBranch}
          listLeaderName={recs[0]?.player.player}
        />
      ) : null}
      <TierPressureStrip
        tiers={endingTiers}
        focus={tierFocus}
        onSelect={(tier) =>
          setTierFocus((current) =>
            current?.pos === tier.pos && current.posTier === tier.posTier ? null : tier,
          )
        }
      />
      <RecommendationList
        rows={rows}
        expandedId={expandedId}
        ranks={rankById}
        focus={tierFocus}
        topVorp={recs[0]?.player.vorp ?? null}
        onToggle={(playerId) =>
          setExpandedId((current) => (current === playerId ? null : playerId))
        }
        onDraft={handleDraft}
      />
      <div className="bottom-bar">
        <button
          type="button"
          onClick={() => {
            setDrawerTab("search");
            setDrawerOpen(true);
          }}
        >
          Search / filter
        </button>
        <button
          type="button"
          onClick={() => {
            setDrawerTab("log");
            setDrawerOpen(true);
          }}
        >
          Log
        </button>
      </div>
      <DraftLogDrawer
        open={drawerOpen}
        tab={drawerTab}
        search={state.search}
        positionFilter={state.positionFilter}
        tierFilter={state.tierFilter}
        picks={state.picks}
        playersById={byId}
        onClose={() => setDrawerOpen(false)}
        onTab={setDrawerTab}
        onSearch={(search) => dispatch({ type: "SET_SEARCH", search })}
        onPosition={(position) => dispatch({ type: "SET_POSITION_FILTER", position })}
        onTier={(tier) => dispatch({ type: "SET_TIER_FILTER", tier })}
        onUndo={() => dispatch({ type: "UNDO_LAST_PICK" })}
      />
      {toast ? (
        <Toast
          message={toast.message}
          warning={toast.warning}
          onUndo={
            toast.showUndo
              ? () => {
                  dispatch({ type: "UNDO_LAST_PICK" });
                  setToast(null);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
