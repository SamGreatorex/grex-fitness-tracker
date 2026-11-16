import { describe, expect, it } from "vitest";
import { recommendationsFor } from "../../src/lib/recommendations";

const curl = { exerciseId: "e1", name: "Curl", type: "strength" };
const sets = (...efforts) => efforts.map((effort) => ({ weight: 10, reps: 10, effort }));

describe("recommending a heavier weight", () => {
  it("recommends it when any set last time was rated under 5", () => {
    const [tip] = recommendationsFor(curl, sets(6, 4, 7));

    expect(tip).toMatchObject({ id: "increase-weight", title: "Increase the weight" });
    expect(tip.reason).toBe("Last time you rated set 2 at 4/10 — under 5 means it felt easy.");
  });

  it("lists every easy set", () => {
    const [tip] = recommendationsFor(curl, sets(3, 6, 4));
    expect(tip.reason).toContain("set 1 at 3/10 and set 3 at 4/10");
  });

  it("doesn't recommend it when every set was rated 5 or more", () => {
    expect(recommendationsFor(curl, sets(5, 6, 8))).toEqual([]);
  });

  it("ignores unrated sets", () => {
    expect(recommendationsFor(curl, sets(null, 6, null))).toEqual([]);
  });

  it("ignores easy drop sets", () => {
    const lastSets = [{ weight: 10, reps: 6, effort: 7, drops: [{ weight: 5, reps: 6, effort: 2 }] }];
    expect(recommendationsFor(curl, lastSets)).toEqual([]);
  });

  it("has nothing for a first attempt or for cardio", () => {
    expect(recommendationsFor(curl, null)).toEqual([]);
    expect(recommendationsFor({ ...curl, type: "cardio" }, sets(2))).toEqual([]);
  });
});
