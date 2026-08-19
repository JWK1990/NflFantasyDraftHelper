import { describe, expect, it } from "vitest";
import { explainChip } from "./chipExplain.ts";

describe("chip explanations", () => {
  it("explains Too close as a low-confidence completed-team gap", () => {
    const chip = explainChip("Too close");
    expect(chip.definition.toLowerCase()).toMatch(/close-call|unstable/);
    expect(chip.detail?.toLowerCase()).toMatch(/discretion|tiers|vorp/);
  });

  it("explains Take now and Can wait timing chips", () => {
    const take = explainChip("Take now");
    expect(take.definition.toLowerCase()).toMatch(/passing|return/);
    expect(take.detail?.toLowerCase()).toMatch(/timing/);

    const wait = explainChip("Can wait");
    expect(wait.definition.toLowerCase()).toMatch(/return/);
    expect(wait.detail?.toLowerCase()).toMatch(/planning|drop/);
  });

  it("adds pick-number detail to availability chips", () => {
    const unlikely = explainChip("Unlikely to be available at pick 47");
    expect(unlikely.definition.toLowerCase()).toMatch(/gone|fallen|stream/);
    expect(unlikely.detail).toContain("47");

    const likely = explainChip("likely to be available at pick 30");
    expect(likely.detail).toContain("30");
  });

  it("explains need, last-in-tier, and remaining-in-tier chips", () => {
    expect(explainChip("Need TE").detail).toMatch(/starting TE/i);
    expect(explainChip("Last in RB T1").detail).toMatch(/drop a tier/i);
    expect(explainChip("WR T2: 2 left").detail).toMatch(/scarce/i);
    expect(explainChip("RB T1").definition).toMatch(/tier/i);
  });

  it("adds punt-mode detail to QB2 can wait", () => {
    const chip = explainChip("QB2 can wait; 8 similar options remain");
    expect(chip.detail).toMatch(/punt/i);
    expect(chip.detail).toContain("174");
  });

  it("explains the LW pill as display-only", () => {
    const chip = explainChip("LW");
    expect(chip.title).toBe("League Winner Candidate");
    expect(chip.definition.toLowerCase()).toMatch(/championship-shifting/);
    expect(chip.detail).toMatch(/does not affect recommendation score/i);
  });

  it("marks scouting tags as non-ranking", () => {
    const elite = explainChip("ELITE/RISK");
    expect(elite.definition.toLowerCase()).toMatch(/elite|risk/);
    expect(elite.detail).toMatch(/does not change the ranking/i);
    expect(explainChip("QB1 VALUE").definition.toLowerCase()).toMatch(/qb1|starting qb/i);
    const deep = explainChip("DEEP SLEEPER");
    expect(deep.definition.toLowerCase()).toContain("deep");
    expect(deep.definition.toLowerCase()).not.toContain("late-round or stash");
  });
});
