export interface ChipExplanation {
  title: string;
  definition: string;
  detail?: string;
}

const SCOUTING_NOTE =
  "Scouting only — this tag does not change the ranking. Use it as a reminder, not a score bump.";

const TAG_PARTS: Array<{ match: RegExp; definition: string }> = [
  { match: /DEEP SLEEPER/, definition: "Deep stash. Even later than a normal sleeper." },
  { match: /SLEEPER/, definition: "Late-round or stash name. Discretionary." },
  { match: /ELITE TE/, definition: "Elite tight-end projection. Difference-maker at the position." },
  { match: /INJURY WATCH/, definition: "Health situation to check before you pick." },
  { match: /RED WATCH/, definition: "Serious health flag. Check status before you pick." },
  { match: /ANCHOR/, definition: "Cornerstone pick. Do not overthink if they are the best player on your board." },
  { match: /VALUE/, definition: "The model likes them more than ADP." },
  { match: /UPSIDE/, definition: "Higher ceiling than the raw projection. More volatile." },
  { match: /RISK/, definition: "Injury, age, role, or volatility concern. Fade if you want a safer name." },
  { match: /ELITE/, definition: "Elite projection at the position." },
  { match: /LATE QB2/, definition: "Fine as a second Superflex QB later, not as your first starter." },
  { match: /LATE TE/, definition: "Streaming or late-round tight end, not TE1 quality." },
  { match: /QB1/, definition: "Projected as a starting QB1." },
  { match: /QB2/, definition: "Second QB / committee or lesser starter." },
  { match: /RB1/, definition: "Workhorse / lead back." },
  { match: /RB2/, definition: "Committee or lesser back." },
  { match: /WR1/, definition: "Lead receiver." },
  { match: /WR2/, definition: "Second option in the passing game." },
  { match: /TE1/, definition: "Starting tight end with a real target role." },
];

function explainTag(label: string): ChipExplanation {
  let rest = label.toUpperCase();
  const definitions: string[] = [];
  for (const part of TAG_PARTS) {
    if (!part.match.test(rest)) continue;
    definitions.push(part.definition);
    rest = rest.replace(part.match, " ");
  }
  if (definitions.length === 0) {
    return {
      title: label,
      definition: "Scouting label from the model.",
      detail: SCOUTING_NOTE,
    };
  }
  return {
    title: label,
    definition: definitions.join(" "),
    detail: SCOUTING_NOTE,
  };
}

export function explainChip(label: string): ChipExplanation {
  const unlikely = label.match(/^Unlikely at pick (\d+)$/i);
  if (unlikely) {
    return {
      title: label,
      definition:
        "They were gone before that pick in more than half of the matched opponent streams. Players who have fallen past ADP are treated as more likely to be taken, not less.",
      detail: `Your next relevant pick is ${unlikely[1]}. This named player is still ranked as if you would get them. The chip uses the same stream-survival rate as the breakdown, not a precise market probability.`,
    };
  }

  const likely = label.match(/^Likely at pick (\d+)$/i);
  if (likely) {
    return {
      title: label,
      definition:
        "This player is high on your list, and they were still on the board at that pick in most matched opponent streams.",
        detail: `Pick ${likely[1]} is the availability target. You can often take someone more urgent first. The chip uses the same stream-survival rate as the breakdown, not a precise market probability.`,
    };
  }

  if (label === "Take now") {
    return {
      title: label,
      definition:
        "Passing is likely to cost completed-team value because they may not return.",
      detail:
        "This is a timing warning. The row is still scored from taking them now, not from a forecasted later board.",
    };
  }

  if (label === "Can wait") {
    return {
      title: label,
      definition: "They are likely to return, and the cost of passing looks small.",
      detail:
        "Useful planning information. It does not drop them below a worse take-now team.",
    };
  }

  if (label === "Too close") {
    return {
      title: label,
      definition:
        "The completed-team gap is smaller than the close-call threshold, or the timing edge is unstable across matched draft streams.",
      detail:
        "Projections and ADP are not precise enough to treat this as a lock. Use tiers, VORP, and League Winner chips to choose. Too close is a label only — it does not change the sort order.",
    };
  }

  if (label === "Lean") {
    return {
      title: label,
      definition: "A modest completed-team advantage that holds across matched scenarios.",
      detail: "Not a huge gap. Timing chips still matter.",
    };
  }

  if (label === "Clear edge") {
    return {
      title: label,
      definition: "The take-now completed-team advantage is large enough to trust over ADP noise.",
      detail: "Still not a championship probability — just a robust projected-team gap.",
    };
  }

  const need = label.match(/^Need (QB|RB|WR|TE)$/i);
  if (need) {
    const pos = need[1]!.toUpperCase();
    const slots =
      pos === "QB"
        ? "your starting QB"
        : pos === "RB"
          ? "one of two starting RBs"
          : pos === "WR"
            ? "one of two starting WRs"
            : "your starting TE";
    return {
      title: label,
      definition: `You still have an empty starting slot at ${pos}.`,
      detail: `Taking them would fill ${slots}. Superflex OP is separate: a second QB can wait if punt mode is still safe.`,
    };
  }

  const lastIn = label.match(/^Last in (QB|RB|WR|TE|K|DST) T(\d+)$/i);
  if (lastIn) {
    return {
      title: label,
      definition: "This is the last remaining player in that position-tier.",
      detail: `After ${lastIn[1]} T${lastIn[2]}, the next names at this position drop a tier. That cliff is shown so you can decide, not baked into the score as a tag.`,
    };
  }

  const remaining = label.match(/^(QB|RB|WR|TE|K|DST|D\/ST) T(\d+): (\d+) left$/i);
  if (remaining) {
    const left = Number(remaining[3]);
    const scarcity =
      left <= 2 ? "Scarce — the group is about to end." : left <= 4 ? "Thinning." : "Still a decent group.";
    return {
      title: label,
      definition: `${remaining[3]} players remain in ${remaining[1]} tier ${remaining[2]}.`,
      detail: `${scarcity} On the roster strip, tap a matching chip to highlight those names. It does not hide the rest of the board.`,
    };
  }

  const posTier = label.match(/^(QB|RB|WR|TE|K|DST|D\/ST) T(\d+)$/i);
  if (posTier) {
    return {
      title: label,
      definition: "Position and model tier. T1 is the top group at that position.",
      detail: "This is a label, not the list rank (the number on the left). List rank is completed-team value if you secure this player.",
    };
  }

  if (label.startsWith("QB2 can wait")) {
    return {
      title: label,
      definition:
        "You already have one QB. Adaptive punt says similar starters remain, so you can delay QB2 until pick 174.",
      detail:
        "Punt mode only. Switch to Normal in the menu if you want QB2 treated like a normal Superflex board. The late path still needs K/D/ST around 139/150 and QBs at 163 and 174.",
    };
  }

  const shrinking = label.match(/^Starter pool shrinking \((\d+) left\)$/i);
  if (shrinking) {
    return {
      title: label,
      definition: "Fewer acceptable starting QBs are left.",
      detail: `${shrinking[1]} acceptable starters remain. Consider QB2 sooner even in punt mode.`,
    };
  }

  if (label === "Late QB pool no longer safe") {
    return {
      title: label,
      definition: "Waiting until 14.03 / 15.06 is no longer viable.",
      detail:
        "The wait-branch sim can no longer land two acceptable QBs plus K and D/ST. Take a QB sooner.",
    };
  }

  if (label.startsWith("Force QB2")) {
    return {
      title: label,
      definition: "Last pick. If you have only one QB, take the best remaining QB now.",
      detail: "Pick 174 is reserved for QB2 when you still have a Superflex hole.",
    };
  }

  if (label === "Backup / insecure job") {
    return {
      title: label,
      definition: "This QB is outside the usual starter ranks.",
      detail: "The job may not be a full-season start. Fragile QBs are not treated as acceptable late-round QB2s.",
    };
  }

  if (label === "Bench only") {
    return {
      title: label,
      definition: "This pick would not start in your current lineup.",
      detail: "Fine later; weaker while you still have empty starter slots. Bench points are scaled down in completed-team utility.",
    };
  }

  if (label === "big drop if you pass (VONA)") {
    return {
      title: label,
      definition:
        "Value over next available: if you skip them, the next similar player at that position is a much worse projection.",
      detail: "A timing warning. It does not replace this player with a fallback in their own ranking row.",
    };
  }

  const roster = label.match(/^(QB|RB|WR|TE|FLEX|OP|K|D\/ST|BN) (\d+)\/(\d+)$/i);
  if (roster) {
    const slot = roster[1]!.toUpperCase();
    const have = roster[2];
    const need = roster[3];
    const definitions: Record<string, string> = {
      QB: "Starting QB, plus a second QB can fill OP / Superflex. Hard cap is two.",
      RB: "Two starting running backs.",
      WR: "Two starting wide receivers.",
      TE: "One starting tight end.",
      FLEX: "Third starting RB/WR/TE after your two RBs, two WRs, and TE are filled.",
      OP: "Superflex / offensive player. Filled by a second QB if you have one, otherwise leftover skill.",
      K: "Kicker. Usually reserved for the late rounds.",
      "D/ST": "Team defense. Usually reserved for the late rounds.",
      BN: "Bench. Five spots after starters, kicker, and D/ST.",
    };
    const highlight =
      slot === "FLEX" || slot === "OP" || slot === "BN"
        ? "This chip is coverage only."
        : "Tap it on the roster strip to highlight that position on the list. It does not hide other players.";
    return {
      title: label,
      definition: definitions[slot] ?? "Roster slot coverage.",
      detail: `Filled ${have} of ${need}. ${highlight}`,
    };
  }

  const valueChip = label.match(/^Value (\d+)\+$/);
  if (valueChip) {
    return {
      title: "Value Target",
      definition:
        "The market is letting them slide past our ranking, so they are good value once the board reaches this pick.",
      detail: `Fine to take around pick ${valueChip[1]} or later — don't reach up for them. Expand the row for the full value note and draft-day timing. Display only; it does not change the ranking.`,
    };
  }

  if (label === "LW" || label.toLowerCase().startsWith("league winner")) {
    return {
      title: "League Winner Candidate",
      definition:
        "A player with a credible path to a championship-shifting ceiling over positional replacement.",
      detail:
        "Informational only. It does not affect recommendation score or ranking, and it is not a guarantee. Tap LW to open the research in the player breakdown.",
    };
  }

  if (label === "Outlook") {
    return {
      title: "Quick Draft note",
      definition:
        "A short draft-day reminder for this player. It is not the full DraftSharks write-up.",
      detail:
        "Expand the player row to read the note alongside the DraftSharks outlook. Display only — it does not change ranking.",
    };
  }

  if (label === "1 projection source") {
    return {
      title: "1 projection source",
      definition: "Only one independent projection was available for this player.",
      detail:
        "A data-quality note, not a risk tag and not a rank penalty. The model still uses that single projection rather than inventing another.",
    };
  }

  return explainTag(label);
}
