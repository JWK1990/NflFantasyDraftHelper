import { POSITION_COLORS } from "../config/leagueSettings.ts";
import type { Position, RosterCoverage } from "../domain/types.ts";
import { useChipExplain } from "./ChipExplainContext.tsx";

interface RosterStripProps {
  coverage: RosterCoverage;
  qbCount: number;
  qbCap: number;
  focusPos: Position | null;
  onFocus: (position: Position) => void;
}

export function RosterStrip({
  coverage,
  qbCount,
  qbCap,
  focusPos,
  onFocus,
}: RosterStripProps) {
  const explain = useChipExplain();
  const chips: {
    key: string;
    label: string;
    filled: boolean;
    prominent?: boolean;
    pos?: Position;
  }[] = [
    { key: "qb", label: `QB ${qbCount}/${qbCap}`, filled: qbCount > 0, prominent: true, pos: "QB" },
    { key: "rb", label: `RB ${coverage.rb}/2`, filled: coverage.rb >= 2, pos: "RB" },
    { key: "wr", label: `WR ${coverage.wr}/2`, filled: coverage.wr >= 2, pos: "WR" },
    { key: "te", label: `TE ${coverage.te}/1`, filled: coverage.te >= 1, pos: "TE" },
    { key: "flex", label: `FLEX ${coverage.flex}/1`, filled: coverage.flex >= 1 },
    { key: "op", label: `OP ${coverage.op}/1`, filled: coverage.op >= 1 },
    { key: "k", label: `K ${coverage.k}/1`, filled: coverage.k >= 1, pos: "K" },
    { key: "dst", label: `D/ST ${coverage.dst}/1`, filled: coverage.dst >= 1, pos: "DST" },
    { key: "bn", label: `BN ${coverage.bench}/5`, filled: coverage.bench > 0 },
  ];

  return (
    <div className="roster-strip" aria-label="Roster coverage">
      {chips.map((chip) => {
        const colors = chip.pos ? POSITION_COLORS[chip.pos] : null;
        const selected = Boolean(chip.pos && focusPos === chip.pos);
        const style = colors
          ? {
              background: colors.bg,
              color: colors.text,
              opacity: chip.filled || selected ? 1 : 0.42,
            }
          : undefined;

        if (!chip.pos) {
          return (
            <button
              key={chip.key}
              type="button"
              className={`roster-chip${chip.filled ? " filled" : ""}`}
              onClick={() => explain(chip.label)}
            >
              {chip.label}
            </button>
          );
        }

        const pos = chip.pos;
        return (
          <button
            key={chip.key}
            type="button"
            className={`roster-chip${chip.filled ? " filled" : ""}${chip.prominent ? " qb" : ""}${selected ? " selected" : ""}`}
            style={style}
            aria-pressed={selected}
            onClick={() => onFocus(pos)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
