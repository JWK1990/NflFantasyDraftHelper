import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadPlayers } from "../data/loadPlayers.ts";
import type { DraftedBy, DraftState } from "../domain/types.ts";
import { matchesFilters, recommend } from "../engine/recommend.ts";
import { draftedIds, myRosterPlayers, playersById, rosterCoverageFromPlayers } from "../engine/roster.ts";
import { remainingByPosTier, currentEdgeTiers } from "../engine/tierScarcity.ts";
import { isUserPick } from "../engine/snake.ts";
import { teamSlotForOverallPick } from "../engine/teams.ts";
import { managerFirstName, teamNamesBySlot } from "../config/leagueTeams.ts";
import { deriveQbCard } from "../engine/qbCard.ts";
import { QbCardView } from "../components/QbCard.tsx";
import { DraftHeader } from "../components/DraftHeader.tsx";
import { DraftLogDrawer } from "../components/DraftLogDrawer.tsx";
import { ImportPicksModal } from "../components/ImportPicksModal.tsx";
import { ChipExplainProvider } from "../components/ChipExplainContext.tsx";
import { RecommendationList, type PickTeamContext } from "../components/RecommendationList.tsx";
import { RosterStrip } from "../components/RosterStrip.tsx";
import { TierPressureStrip, type ListFocus } from "../components/TierPressureStrip.tsx";
import { Toast } from "../components/Toast.tsx";
import { importEspnPicks } from "../engine/espnPaste.ts";
import { draftReducer } from "../state/draftReducer.ts";
import { loadState, saveState, serializeDraftState } from "../state/persistence.ts";

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
  const [listFocus, setListFocus] = useState<ListFocus | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentOverallPick = state.picks.length + 1;
  const pickTeam = useMemo<PickTeamContext>(() => {
    const slot = teamSlotForOverallPick(currentOverallPick);
    const teamName = teamNamesBySlot().get(slot) ?? `Team ${slot}`;
    return {
      isUserPick: isUserPick(currentOverallPick),
      label: managerFirstName(slot),
      teamName,
    };
  }, [currentOverallPick]);
  const roster = useMemo(() => myRosterPlayers(state.picks, byId), [state.picks]);
  const coverage = useMemo(() => rosterCoverageFromPlayers(roster), [roster]);
  const rankingState = useMemo<DraftState>(
    () => ({
      schemaVersion: 2,
      picks: state.picks,
      search: "",
      positionFilter: "ALL",
      tierFilter: "ALL",
      tagFilter: "ALL",
    }),
    [state.picks],
  );
  // The ranking recompute is heavy (~1-2s) and synchronous. To keep a visible
  // "working" signal, we defer it one tick: the busy state paints first, the
  // previous ranking stays on screen, then results replace atomically. Stale
  // computes are discarded if a newer pick arrives mid-flight.
  const computeRanking = (draftState: DraftState) => {
    const recs = recommend(players, draftState);
    return { recs, qbCard: deriveQbCard(recs, players, draftState) };
  };
  const [ranking, setRanking] = useState(() => computeRanking(rankingState));
  const [busy, setBusy] = useState(false);
  const firstRankingRun = useRef(true);
  useEffect(() => {
    if (firstRankingRun.current) {
      firstRankingRun.current = false;
      return;
    }
    setBusy(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const next = computeRanking(rankingState);
      if (cancelled) return;
      setRanking(next);
      setBusy(false);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingState]);
  const recs = ranking.recs;
  const qbCard = ranking.qbCard;
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
    if (!listFocus || listFocus.kind !== "tier") return;
    const stillExists = endingTiers.some(
      (tier) => tier.pos === listFocus.pos && tier.posTier === listFocus.posTier,
    );
    if (!stillExists) setListFocus(null);
  }, [endingTiers, listFocus]);

  const filtering =
    state.search.trim() !== "" ||
    state.positionFilter !== "ALL" ||
    state.tierFilter !== "ALL" ||
    state.tagFilter !== "ALL";

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

  function handleImportPicks(paste: string, teamName: string) {
    const result = importEspnPicks(paste, players, teamName);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    dispatch({ type: "REPLACE_PICKS", picks: result.picks });
    setImportOpen(false);
    setImportError(null);
    setExpandedId(null);
    const skipped = result.unmatched.length
      ? ` Skipped ${result.unmatched.length} unmatched: ${result.unmatched
          .slice(0, 8)
          .map((row) => `${row.overallPick} ${row.player}`)
          .join(", ")}${result.unmatched.length > 8 ? "…" : ""}.`
      : "";
    setToast({
      message: `Imported ${result.picks.length} pick${result.picks.length === 1 ? "" : "s"} (${result.mineCount} yours).${skipped}`,
      warning: result.unmatched.length > 0,
    });
  }

  return (
    <ChipExplainProvider>
    <div className={`app-shell${drawerOpen ? " drawer-open" : ""}`}>
      <DraftHeader
        currentOverallPick={currentOverallPick}
        canUndo={state.picks.length > 0}
        onUndo={() => dispatch({ type: "UNDO_LAST_PICK" })}
        onReset={() => {
          dispatch({ type: "RESET_DRAFT" });
          setToast({ message: "Draft reset.", warning: true });
        }}
        onExport={() => {
          const blob = new Blob([serializeDraftState(state)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `draft-helper-pick-${currentOverallPick}.json`;
          link.click();
          URL.revokeObjectURL(url);
        }}
        onImport={() => {
          setImportError(null);
          setImportOpen(true);
        }}
      />
      {resetBanner ? <div className="banner">{resetBanner}</div> : null}
      <RosterStrip
        coverage={coverage}
        focusPos={listFocus?.kind === "pos" ? listFocus.pos : null}
        onFocus={(position) => {
          setListFocus((current) =>
            current?.kind === "pos" && current.pos === position
              ? null
              : { kind: "pos", pos: position },
          );
        }}
      />
      {qbCard ? <QbCardView card={qbCard} /> : null}
      <TierPressureStrip
        tiers={endingTiers}
        focus={listFocus?.kind === "tier" ? listFocus : null}
        onSelect={(tier) =>
          setListFocus((current) =>
            current?.kind === "tier" &&
            current.pos === tier.pos &&
            current.posTier === tier.posTier
              ? null
              : { kind: "tier", pos: tier.pos, posTier: tier.posTier },
          )
        }
      />
      <RecommendationList
        rows={rows}
        expandedId={expandedId}
        ranks={rankById}
        focus={listFocus}
        topVorp={recs[0]?.player.vorp ?? null}
        pickTeam={pickTeam}
        busy={busy}
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
        tagFilter={state.tagFilter}
        picks={state.picks}
        playersById={byId}
        onClose={() => setDrawerOpen(false)}
        onTab={setDrawerTab}
        onSearch={(search) => dispatch({ type: "SET_SEARCH", search })}
        onPosition={(position) => dispatch({ type: "SET_POSITION_FILTER", position })}
        onTier={(tier) => dispatch({ type: "SET_TIER_FILTER", tier })}
        onTag={(tag) => dispatch({ type: "SET_TAG_FILTER", tag })}
        onUndo={() => dispatch({ type: "UNDO_LAST_PICK" })}
      />
      <ImportPicksModal
        open={importOpen}
        error={importError}
        onClose={() => {
          setImportOpen(false);
          setImportError(null);
        }}
        onImport={handleImportPicks}
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
    </ChipExplainProvider>
  );
}
