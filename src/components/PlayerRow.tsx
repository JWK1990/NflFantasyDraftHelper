import type { DraftedBy, Player, PlayerOutlook, Recommendation } from "../domain/types.ts";
import type { PickTeamContext } from "./RecommendationList.tsx";
import {
  formatAdp,
  formatStat,
  formatVorp,
  formatVorpDiff,
  isSafeHttpUrl,
  posLabel,
  positionColor,
} from "./format.ts";
import { scoutingTag } from "../engine/tags.ts";
import { scarcityLevel } from "../config/leagueSettings.ts";
import { useChipExplain } from "./ChipExplainContext.tsx";
import { LeagueWinnerDetail } from "./LeagueWinnerDetail.tsx";
import { ValueDetail, type ValueAvailability } from "./ValueDetail.tsx";

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
  const match = reason.match(/^(Unlikely|Likely)( at pick \d+)$/);
  if (!match) return reason;
  const kind = match[1] === "Unlikely" ? "reason-unlikely" : "reason-likely";
  return (
    <>
      <strong className={kind}>{match[1]}</strong>
      {match[2]}
    </>
  );
}

function ResearchRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="breakdown-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function remainingInTierCount(reason: string): number | null {
  const remaining = reason.match(/^(?:QB|RB|WR|TE|K|DST|D\/ST) T\d+: (\d+) left$/i);
  if (remaining) return Number(remaining[1]);
  if (/^Last in (?:QB|RB|WR|TE|K|DST|D\/ST) T\d+$/i.test(reason)) return 1;
  return null;
}

function reasonClassName(reason: string): string {
  const left = remainingInTierCount(reason);
  if (left == null) return "reason";
  return `reason scarcity-${scarcityLevel(left)}`;
}

function isScoutingChip(reason: string, player: Player): boolean {
  const tag = scoutingTag(player);
  return (tag != null && reason === tag) || /^Model #\d+$/.test(reason);
}

/** Reuse the row's own stream-survival chips to time a value pick. */
function valueAvailability(reasons: string[]): ValueAvailability {
  for (const reason of reasons) {
    if (/^Likely at pick \d+$/.test(reason)) return "likely";
    if (/^Unlikely at pick \d+$/.test(reason)) return "unlikely";
  }
  return null;
}

function OutlookDetail({ outlook }: { outlook: PlayerOutlook }) {
  const link = isSafeHttpUrl(outlook.sourceUrl) ? outlook.sourceUrl : null;
  return (
    <section className="outlook-detail">
      <h3>DraftSharks outlook</h3>
      {outlook.bottomLineExcerpt ? <p>{outlook.bottomLineExcerpt}</p> : null}
      {outlook.summary ? <p className="breakdown-note">{outlook.summary}</p> : null}
      {link ? (
        <p>
          <a href={link} target="_blank" rel="noopener noreferrer">
            Full DraftSharks verdict
          </a>
          <span className="breakdown-note"> · as of {outlook.asOf}</span>
        </p>
      ) : (
        <p className="breakdown-note">As of {outlook.asOf}</p>
      )}
    </section>
  );
}

function PlayerResearch({
  player,
  onExplain,
}: {
  player: Player;
  onExplain: (label: string) => void;
}) {
  if (player.coverageOnly || player.pos === "K" || player.pos === "DST") {
    return null;
  }
  const fpRank =
    player.fantasyProsSfRank != null
      ? `FP ${player.fantasyProsSfRank}${
          player.fantasyProsSfTier != null ? ` T${player.fantasyProsSfTier}` : ""
        }`
      : null;
  const espnPos =
    player.espnConsensusPosRank != null
      ? `${player.pos}${player.espnConsensusPosRank}${
          player.espnConsensusAvgRank != null
            ? ` (avg ${formatStat(player.espnConsensusAvgRank)})`
            : ""
        }`
      : null;
  const yahooPos =
    player.yahooConsensusPprRank != null
      ? `${formatStat(player.yahooConsensusPprRank, 0)}${
          player.yahooConsensusPosRank != null
            ? ` (${player.pos}${player.yahooConsensusPosRank})`
            : ""
        }`
      : null;
  const superflexRanks = [fpRank, player.draftSharksSfRank != null ? `DS ${player.draftSharksSfRank}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="player-research">
      {player.projectionSourceCount === 1 ? (
        <div className="research-chips">
          <button
            className="reason source-chip"
            type="button"
            onClick={() => onExplain("1 projection source")}
          >
            1 projection source
          </button>
        </div>
      ) : null}
      <ResearchRow
        label="Superflex consensus"
        value={
          player.superflexConsensusRank != null
            ? `${formatStat(player.superflexConsensusRank, 0)}${
                player.superflexConsensusSourceCount != null
                  ? ` (${player.superflexConsensusSourceCount} sources)`
                  : ""
              }`
            : null
        }
      />
      <ResearchRow label="Superflex ranks" value={superflexRanks || null} />
      <ResearchRow
        label="ESPN room"
        value={player.espnRoomAdp != null ? formatAdp(player.espnRoomAdp) : null}
      />
      <ResearchRow label="ESPN consensus" value={espnPos} />
      <ResearchRow label="Yahoo PPR" value={yahooPos} />
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
  const reasons = (recommendation?.reasons ?? []).filter(
    (reason) => !isScoutingChip(reason, player),
  );
  return (
    <article
      className={`player-row${dimmed ? " dimmed" : ""}${
        player.watchlist ? " watchlist" : ""
      }`}
    >
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
              {player.age != null ? (
                <>
                  {" · "}
                  <strong className="age">{player.age}</strong>
                </>
              ) : null}
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
          <strong>ADP {formatAdp(player.sfConsensusAdp ?? player.adp)}</strong>
        </button>
        {reasons.length > 0 || player.leagueWinner || player.value ? (
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
            {player.value ? (
              <button
                className="reason value-chip"
                type="button"
                aria-label={`Value target from pick ${player.value.valueFrom}`}
                onClick={() => explain(`Value ${player.value!.valueFrom}+`)}
              >
                Value {player.value.valueFrom}+
              </button>
            ) : null}
            {reasons.map((reason) => (
              <button
                key={reason}
                type="button"
                className={reasonClassName(reason)}
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
            {busy ? <span className="btn-spinner" aria-label="Updating" /> : pickTeam.label}
          </button>
        </div>
      )}
      {expanded ? (
        <div className="breakdown">
          {player.note ? (
            <section className="outlook-detail">
              <h3>Draft note</h3>
              <p>{player.note}</p>
            </section>
          ) : null}
          {player.outlook ? <OutlookDetail outlook={player.outlook} /> : null}
          <PlayerResearch player={player} onExplain={explain} />
          {player.value ? (
            <ValueDetail
              profile={player.value}
              availability={valueAvailability(recommendation?.reasons ?? [])}
            />
          ) : null}
          {player.leagueWinner ? (
            <LeagueWinnerDetail profile={player.leagueWinner} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
