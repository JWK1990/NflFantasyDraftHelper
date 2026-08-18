export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface GlossarySection {
  title: string;
  entries: GlossaryEntry[];
}

export const GLOSSARY_SECTIONS: GlossarySection[] = [
  {
    title: "On a player row",
    entries: [
      {
        term: "List rank (1, 2, 3…)",
        definition:
          "If you secure this currently available player at your upcoming pick, how strong is the completed team you can build from there. Not Superflex ADP order, and not whether ADP thinks they will still be there.",
      },
      {
        term: "RB T1 (position + tier)",
        definition:
          "That player’s position and model tier. T1 is the top group at the position. This is a label, not the list rank.",
      },
      {
        term: "VORP",
        definition:
          "Value over replacement player: projected points above a typical starter at that position. Higher is better.",
      },
      {
        term: "(+ 10.0) after VORP",
        definition:
          "How this player’s VORP compares with the current #1 on your list.",
      },
      {
        term: "ADP",
        definition:
          "Average draft position: where the market usually takes this player. Used for timing, not for how good they are on your team.",
      },
    ],
  },
  {
    title: "Timing chips",
    entries: [
      {
        term: "Unlikely to be available at pick 19",
        definition:
          "ADP says this player will probably be gone before your next pick. That is a timing warning, not a rank penalty — this named player is still scored as if you get them. Other players the sim hopes to add later are weighted by that same chance.",
      },
      {
        term: "likely to be available at pick 19",
        definition:
          "This player is high on your list, and ADP says they should still be there at your next pick. You can often take someone more urgent first. Availability never swaps in a different player under this name.",
      },
      {
        term: "big drop if you pass (VONA)",
        definition:
          "Value over next available: if you skip them, the next similar player at that position is a much worse projection.",
      },
    ],
  },
  {
    title: "Roster and tier chips",
    entries: [
      {
        term: "Need RB / WR / TE / QB",
        definition:
          "You still have an empty starting slot at that position (QB 1, RB 2, WR 2, TE 1).",
      },
      {
        term: "Last in RB T1",
        definition:
          "This is the last remaining player in that position-tier. The next names drop a tier.",
      },
      {
        term: "WR T1: 2 left",
        definition:
          "Two or three players remain in that tier. The group is about to end.",
      },
      {
        term: "Bench only",
        definition:
          "This pick would not start in your current lineup. Fine later; weaker if you still have holes.",
      },
      {
        term: "QB T2: 5 left (green / orange / red)",
        definition:
          "How many names remain in the current tier at that position. Tap to highlight them. Green is plenty, orange is thinning, red is scarce.",
      },
    ],
  },
  {
    title: "QB chips",
    entries: [
      {
        term: "QB2 can wait",
        definition:
          "You already have one QB. Adaptive punt says similar starters remain, so you can delay QB2 until pick 174.",
      },
      {
        term: "Starter pool shrinking",
        definition:
          "Fewer acceptable starting QBs are left. Consider QB2 sooner even in punt mode.",
      },
      {
        term: "Late QB pool no longer safe",
        definition:
          "Waiting until 14.03 / 15.06 is no longer viable. Take a QB sooner.",
      },
      {
        term: "Force QB2 at 15.06",
        definition:
          "Last pick. If you have only one QB, take the best remaining QB now.",
      },
      {
        term: "Backup / insecure job",
        definition:
          "This QB is outside the usual starter ranks, so the job may not be a full-season start.",
      },
    ],
  },
  {
    title: "Scouting tags",
    entries: [
      {
        term: "ANCHOR",
        definition: "Cornerstone pick. Do not overthink if they are the best player on your board.",
      },
      {
        term: "VALUE",
        definition: "The model likes them more than ADP. Often a buy if the rank lines up.",
      },
      {
        term: "UPSIDE",
        definition: "Higher ceiling than the raw projection. More volatile.",
      },
      {
        term: "SLEEPER / DEEP SLEEPER",
        definition:
          "Late-round or deep stash. Deep sleeper is even later. Discretionary — tags do not change the ranking.",
      },
      {
        term: "RISK / ELITE/RISK / VALUE/RISK",
        definition:
          "Injury, age, role, or volatility concern. Shown so you can fade them; not used in the score.",
      },
      {
        term: "INJURY WATCH / RED WATCH",
        definition:
          "Health situation to check before you pick. Also not used in the score.",
      },
      {
        term: "QB1 / QB2 / RB1 / WR1 / TE1",
        definition: "Rough role label from the model (starter vs committee / second option).",
      },
    ],
  },
  {
    title: "League Winner",
    entries: [
      {
        term: "League Winner Candidate",
        definition:
          "A player with a credible path to producing a championship-shifting advantage over positional replacement. This may be an established early-round player with a power-law ceiling or a later selection with breakout or contingent upside. The label is informational. It does not affect the recommendation score or ranking and is not a guarantee. Consider it alongside projections, VORP, tiers, roster construction, draft cost and the separate risk/injury chips.",
      },
      {
        term: "LW pill",
        definition:
          "Gold tag in the same row as the other chips. League-winning players are frequently found early because early picks have the highest hit rates. Upside becomes more decisive later because safe but replaceable bench production has little value and failed late picks can usually be replaced through waivers. Tap LW to open the research on that player. Filter by Potential League Winner in Search / filter.",
      },
    ],
  },
  {
    title: "Roster strip and settings",
    entries: [
      {
        term: "QB / RB / WR / TE / K / D/ST chips",
        definition:
          "Tap to highlight that position on the list. They do not hide players. Use Search / filter to actually filter.",
      },
      {
        term: "FLEX",
        definition: "Third starting RB/WR/TE after your two RBs, two WRs, and TE are filled.",
      },
      {
        term: "OP",
        definition:
          "Superflex / offensive player. Filled by a second QB if you have one, otherwise leftover skill. You can draft at most two QBs.",
      },
      {
        term: "BN",
        definition: "Bench. Five spots after starters, kicker, and D/ST.",
      },
      {
        term: "Punt vs Normal (QB2 mode)",
        definition:
          "Punt delays QB2 until 15.06 if the late pool is safe. Normal treats QB2 more like a normal Superflex board.",
      },
    ],
  },
  {
    title: "QB card and rankings",
    entries: [
      {
        term: "Take a QB with your next pick",
        definition: "The wait-vs-now sim prefers a QB now.",
      },
      {
        term: "You can still wait on QBs",
        definition:
          "Double-late is still open: K/D/ST around 139/150, QBs at 163 and 174.",
      },
      {
        term: "Completed-team utility",
        definition:
          "The ranking number: your projected starters after a simulated rest of draft if you secure this row’s player, plus a little bench, minus empty-slot pain. The named player is always on that simulated roster. Other later additions are chance-weighted by ADP, and a non-QB row can choose take-QB-next versus waiting until pick 174.",
      },
      {
        term: "Likely to return at next pick %",
        definition:
          "Chance this named player is still there at your next turn, from ADP among remaining players.",
      },
      {
        term: "Expected WR later / Expected QB later",
        definition:
          "The most important other player this row’s rest-of-draft plan hopes to add, the pick where that would happen, and the ADP chance they last that long. If the chance is low, that player is not counted at full value.",
      },
    ],
  },
];
