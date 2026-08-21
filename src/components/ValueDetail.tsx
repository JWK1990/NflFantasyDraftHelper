import type { ValueProfile } from "../domain/types.ts";

export type ValueAvailability = "likely" | "unlikely" | null;

interface ValueDetailProps {
  profile: ValueProfile;
  /** Derived from the same stream-survival signal the row already shows. */
  availability?: ValueAvailability;
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="breakdown-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ValueDetail({ profile, availability = null }: ValueDetailProps) {
  const dynamicLine =
    availability === "likely"
      ? "Likely available at your next pick — you can wait."
      : availability === "unlikely"
        ? "May not survive to your next pick — consider now."
        : null;
  return (
    <section className="value-detail">
      <h3>Value Target</h3>
      <DetailRow label="Fair value" value={`Rank ${profile.fairValue}`} />
      <DetailRow label="Value from" value={`Pick ${profile.valueFrom}+`} />
      {profile.strongValueFrom != null ? (
        <DetailRow label="Strong value from" value={`Pick ${profile.strongValueFrom}+`} />
      ) : null}
      <p className="value-note">{profile.note}</p>
      {dynamicLine ? <p className="value-dynamic">{dynamicLine}</p> : null}
      <p className="breakdown-note">
        Value From is our valuation and stays fixed. Draft-day timing depends on
        ADP and who is still on the board — it does not change this player’s
        ranking.
      </p>
    </section>
  );
}
