import { describe, expect, it } from "vitest";
import { loadPlayers } from "../data/loadPlayers.ts";
import { importEspnPicks, matchEspnPlayer, parseEspnPasteRows } from "./espnPaste.ts";

const players = loadPlayers();

const SAMPLE = `Pick
Player
Team
2025 PTS
PROJ PTS
RK
1

Josh Allen
BUF
QB
!!! Fire Sale
364.6
369.7
1
2

Lamar Jackson
BAL
QB
Silence of the Lamb
214.9
322.9
3
3

Jayden Daniels
WSH
QB
KC and the Burrow Band
114.3
318.3
2
4

Jahmyr Gibbs
DET
RB
Hurts So Good
366.9
364.9
4
5

Bijan Robinson
ATL
RB
The Situation
370.8
352.8
5
6

Ja'Marr Chase
CIN
WR
The Dan Marinehos
313.6
337.5
6
7

Puka Nacua
LAR
WR
Darwin Dishlickers
375
356.3
7
8

Jaxon Smith-Njigba
SEA
WR
Fentasy Football
359.9
326.7
8
9

Christian McCaffrey
SF
RB
Its gonna be Maye!
416.6
343.3
9
10

Jalen Hurts
PHI
QB
Mahomes Magic
299.1
320.3
11
11

Drake Maye
NE
QB
Mile High Club
352
319.4
10
12

Joe Burrow
CIN
QB
Lamb On The Skip
134.5
304.7
16
Round 2
Pick
Player
Team
2025 PTS
PROJ PTS
RK
13

Jaxson Dart
NYG
QB
Lamb On The Skip
241.6
300.6
17
14

Jonathan Taylor
IND
RB
Mile High Club
362.3
316.1
12
15

CeeDee Lamb
DAL
WR
Mahomes Magic
200.9
293.5
14
16

Amon-Ra St. Brown
DET
WR
Its gonna be Maye!
324
324
13
17

De'Von Achane
MIA
RB
Fentasy Football
322.8
293.5
15
18

James Cook III
BUF
RB
Darwin Dishlickers
302.2
279.6
18
`;

describe("ESPN pick paste", () => {
  it("parses pick number, player, NFL team, position, and fantasy team", () => {
    const rows = parseEspnPasteRows(SAMPLE);
    expect(rows).toHaveLength(18);
    expect(rows[0]).toMatchObject({
      overallPick: 1,
      player: "Josh Allen",
      team: "BUF",
      pos: "QB",
      fantasyTeam: "!!! Fire Sale",
    });
    expect(rows[5]).toMatchObject({
      overallPick: 6,
      player: "Ja'Marr Chase",
      fantasyTeam: "The Dan Marinehos",
    });
    expect(rows[17]).toMatchObject({
      overallPick: 18,
      player: "James Cook III",
    });
  });

  it("matches suffix names, WSH, and apostrophes onto the player pool", () => {
    expect(matchEspnPlayer(players, {
      overallPick: 18,
      player: "James Cook III",
      team: "BUF",
      pos: "RB",
      fantasyTeam: "Darwin Dishlickers",
    })?.player).toBe("James Cook");
    expect(matchEspnPlayer(players, {
      overallPick: 3,
      player: "Jayden Daniels",
      team: "WSH",
      pos: "QB",
      fantasyTeam: "KC and the Burrow Band",
    })?.team).toBe("WAS");
    expect(matchEspnPlayer(players, {
      overallPick: 17,
      player: "De'Von Achane",
      team: "MIA",
      pos: "RB",
      fantasyTeam: "Fentasy Football",
    })?.player).toBe("De'Von Achane");
  });

  it("imports the sample as an overwrite, marking The Dan Marinehos as Mine", () => {
    const result = importEspnPicks(SAMPLE, players);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picks).toHaveLength(18);
    expect(result.mineCount).toBe(1);
    const chase = result.picks.find((pick) => pick.overallPick === 6);
    expect(chase?.draftedBy).toBe("mine");
    expect(result.picks.filter((pick) => pick.draftedBy === "other")).toHaveLength(17);
  });

  it("matches D/ST by team when ESPN uses a nickname", () => {
    const row = {
      overallPick: 139,
      player: "Texans D/ST",
      team: "HOU",
      pos: "D/ST",
      fantasyTeam: "The Dan Marinehos",
    };
    expect(matchEspnPlayer(players, row)?.player).toBe("Texans");
  });

  it("imports matched picks and reports unmatched names instead of aborting", () => {
    const result = importEspnPicks(
      `1
Josh Allen
BUF
QB
The Dan Marinehos
1
1
1
2
Nobody McFake
BUF
QB
The Dan Marinehos
1
1
1
`,
      players,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picks).toHaveLength(1);
    expect(result.unmatched[0]?.player).toBe("Nobody McFake");
  });

  it("refuses a paste with a name that is not in the pool", () => {
    const result = importEspnPicks(
      `1
Nobody McFake
BUF
QB
The Dan Marinehos
1
1
1
`,
      players,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.unmatched[0]?.player).toBe("Nobody McFake");
  });

  it("refuses a paste that does not start at pick 1", () => {
    const result = importEspnPicks(
      `13
Jaxson Dart
NYG
QB
Lamb On The Skip
1
1
1
`,
      players,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/start at 1/);
  });

  it("skips ESPN injury status letters and dash stats so later picks stay in order", () => {
    const rows = parseEspnPasteRows(`43
Josh Jacobs
GB
RB
The Dan Marinehos
237.1
259.1
43
44
Patrick Mahomes
Q
KC
QB
The Situation
285.7
291.3
44
45
Travis Etienne Jr.
NO
RB
Hurts So Good
253.9
243.7
46
48
Malik Nabers
Q
NYG
WR
!!! Fire Sale
57.1
245.9
47
28
Jeremiyah Love
ARI
RB
Hurts So Good
-
278.5
28
82
Alec Pierce
O
IND
WR
Mahomes Magic
183.3
203.9
84
90
Travis Hunter
JAX
WRCB
Darwin Dishlickers
63.8
113.1
91
`);
    expect(rows.find((row) => row.overallPick === 44)).toMatchObject({
      player: "Patrick Mahomes",
      team: "KC",
      pos: "QB",
      fantasyTeam: "The Situation",
    });
    expect(rows.find((row) => row.overallPick === 48)).toMatchObject({
      player: "Malik Nabers",
      team: "NYG",
      pos: "WR",
    });
    expect(rows.find((row) => row.overallPick === 28)).toMatchObject({
      player: "Jeremiyah Love",
      team: "ARI",
      pos: "RB",
    });
    expect(rows.find((row) => row.overallPick === 82)).toMatchObject({
      player: "Alec Pierce",
      team: "IND",
      pos: "WR",
    });
    expect(rows.find((row) => row.overallPick === 90)).toMatchObject({
      player: "Travis Hunter",
      team: "JAX",
      pos: "WRCB",
    });
  });

  it("imports a status-marked pick onto the player pool", () => {
    const result = importEspnPicks(
      `1
Patrick Mahomes
Q
KC
QB
The Situation
285.7
291.3
1
`,
      players,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picks[0]?.draftedBy).toBe("other");
    expect(players.find((player) => player.id === result.picks[0]?.playerId)?.player).toBe(
      "Patrick Mahomes",
    );
  });

  it("matches Kenny Gainwell in the ESPN pool", () => {
    expect(
      matchEspnPlayer(players, {
        overallPick: 104,
        player: "Kenny Gainwell",
        team: "TB",
        pos: "RB",
        fantasyTeam: "Fentasy Football",
      })?.player,
    ).toBe("Kenny Gainwell");
  });

  it("matches the previously failing ESPN names including coverage and D/ST", () => {
    const cases = [
      { player: "Baker Mayfield", team: "TB", pos: "QB" },
      { player: "Travis Hunter", team: "JAX", pos: "WRCB" },
      { player: "Deebo Samuel Sr.", team: "SF", pos: "WR" },
      { player: "Kenyon Sadiq", team: "NYJ", pos: "TE" },
      { player: "De'Zhaun Stribling", team: "SF", pos: "WR" },
      { player: "Lions D/ST", team: "DET", pos: "D/ST" },
      { player: "Will Reichard", team: "MIN", pos: "K" },
      { player: "Brian Robinson Jr.", team: "ATL", pos: "RB" },
      { player: "Caleb Douglas", team: "MIA", pos: "WR" },
      { player: "Jerry Jeudy", team: "CLE", pos: "WR" },
      { player: "Zane Gonzalez", team: "MIA", pos: "K" },
      { player: "Philip Rivers", team: "IND", pos: "QB" },
    ] as const;
    for (const row of cases) {
      expect(
        matchEspnPlayer(players, {
          overallPick: 1,
          ...row,
          fantasyTeam: "The Dan Marinehos",
        })?.player,
      ).toBeTruthy();
    }
    expect(
      matchEspnPlayer(players, {
        overallPick: 90,
        player: "Travis Hunter",
        team: "JAX",
        pos: "WRCB",
        fantasyTeam: "Darwin Dishlickers",
      })?.player,
    ).toBe("Travis Hunter");
    expect(
      matchEspnPlayer(players, {
        overallPick: 154,
        player: "Lions D/ST",
        team: "DET",
        pos: "D/ST",
        fantasyTeam: "Mahomes Magic",
      })?.player,
    ).toBe("Lions");
  });
});
