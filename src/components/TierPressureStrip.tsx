import { scarcityLevel } from "../config/leagueSettings.ts";
import type { Position } from "../domain/types.ts";

export interface TierFocus {
  pos: Position;
  posTier: number;
}

export type ListFocus =
  | { kind: "tier"; pos: Position; posTier: number }
  | { kind: "pos"; pos: Position };

interface TierPressureStripProps {
  tiers: { pos: Position; posTier: number; left: number }[];
  focus: TierFocus | null;
  onSelect: (tier: TierFocus) => void;
}

export function TierPressureStrip({ tiers, focus, onSelect }: TierPressureStripProps) {
  if (tiers.length === 0) {
    return (
      <div className="tier-strip">
        <span className="roster-chip">No tiers left</span>
      </div>
    );
  }

  return (
    <div className="tier-strip" aria-label="Tier pressure">
      {tiers.map((tier) => {
        const selected =
          focus?.pos === tier.pos && focus.posTier === tier.posTier;
        return (
          <button
            key={`${tier.pos}-${tier.posTier}`}
            type="button"
            className={`tier-chip scarcity-${scarcityLevel(tier.left)}${selected ? " selected" : ""}`}
            aria-pressed={selected}
            onClick={() => onSelect({ pos: tier.pos, posTier: tier.posTier })}
          >
            {tier.pos} T{tier.posTier}: {tier.left} left
          </button>
        );
      })}
    </div>
  );
}
