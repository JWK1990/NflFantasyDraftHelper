import type { Player } from "../domain/types.ts";

/**
 * Best remaining QB by projected points. No job-security or "acceptable QB"
 * adjustment — role security is deliberately kept out of all ranking math and
 * will return later only as a display-only chip.
 */
export function bestQb(available: Player[]): Player | null {
  return (
    available
      .filter((player) => player.pos === "QB")
      .sort((a, b) => b.modelPts - a.modelPts || a.modelRank - b.modelRank)[0] ?? null
  );
}
