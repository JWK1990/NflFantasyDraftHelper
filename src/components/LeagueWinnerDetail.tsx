import type { LeagueWinnerProfile } from "../domain/types.ts";
import {
  formatLeagueWinnerConfidence,
  LEAGUE_WINNER_ARCHETYPE_LABELS,
} from "../data/leagueWinner.ts";

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

interface LeagueWinnerDetailProps {
  profile: LeagueWinnerProfile;
}

export function LeagueWinnerDetail({ profile }: LeagueWinnerDetailProps) {
  return (
    <section className="lw-detail">
      <h3>League Winner Candidate</h3>
      <p className="lw-confidence">
        Confidence: {formatLeagueWinnerConfidence(profile.confidence)}
      </p>
      {profile.archetypes.length > 0 ? (
        <>
          <p className="lw-heading">Profile</p>
          <ul>
            {profile.archetypes.map((archetype) => (
              <li key={archetype}>{LEAGUE_WINNER_ARCHETYPE_LABELS[archetype]}</li>
            ))}
          </ul>
        </>
      ) : null}
      {profile.reasons.length > 0 ? (
        <>
          <p className="lw-heading">Why</p>
          <ul>
            {profile.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      ) : null}
      {profile.sources.length > 0 ? (
        <>
          <p className="lw-heading">Sources</p>
          <ul>
            {profile.sources.map((source) => (
              <li key={`${source.label}-${source.url ?? ""}`}>
                {source.url && isSafeHttpUrl(source.url) ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.label}
                  </a>
                ) : (
                  source.label
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="breakdown-note">
        This is an upside indicator, not a projection or guarantee. It does not
        affect this player’s recommendation score.
      </p>
    </section>
  );
}
