import { describe, expect, it } from "vitest";
import { recommendationsFor } from "../../src/lib/recommendations";

const curl = { exerciseId: "e1", name: "Curl", type: "strength" };
const sets = (...efforts) => efforts.map((effort) => ({ weight: 10, reps: 10, effort }));
const bodyweight = (...efforts) => efforts.map((effort) => ({ weight: 0, reps: 12, effort }));

describe("recommending a heavier weight when a set felt easy", () => {
  it("recommends it when any set last time was rated under 6", () => {
    const [tip] = recommendationsFor(curl, sets(6, 4, 7));

    expect(tip).toEqual({
      id: "increase-weight",
      title: "Increase the weight",
      reasons: ["Last time you rated set 2 at 4/10 — under 6 means it felt easy."],
    });
  });

  it("lists every easy set", () => {
    const [tip] = recommendationsFor(curl, sets(3, 6, 4));
    expect(tip.reasons[0]).toContain("set 1 at 3/10 and set 3 at 4/10");
  });

  it("doesn't recommend it when every set was rated 6 or more", () => {
    expect(recommendationsFor(curl, sets(6, 7, 8))).toEqual([]);
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

describe("recommending a heavier weight when it's getting easier", () => {
  it("recommends it when average effort went down since the time before", () => {
    const [tip] = recommendationsFor(curl, sets(7, 7, 8), sets(8, 8, 9));

    expect(tip).toEqual({
      id: "increase-weight",
      title: "Increase the weight",
      reasons: ["It felt easier last time than the time before (average effort 8.3 → 7.3)."],
    });
  });

  it("doesn't for the same or a harder effort, or a tiny drop", () => {
    expect(recommendationsFor(curl, sets(8, 8), sets(8, 8))).toEqual([]);
    expect(recommendationsFor(curl, sets(9, 9), sets(8, 8))).toEqual([]);
    expect(recommendationsFor(curl, sets(8, 8), sets(8, 8.4))).toEqual([]);
  });

  it("needs both times rated", () => {
    expect(recommendationsFor(curl, sets(7, 7), null)).toEqual([]);
    expect(recommendationsFor(curl, sets(7, 7), sets(null, null))).toEqual([]);
  });

  it("joins with the easy-set reason into one tip", () => {
    const tips = recommendationsFor(curl, sets(5, 7), sets(8, 8));

    expect(tips).toHaveLength(1);
    expect(tips[0].reasons).toHaveLength(2);
  });
});

describe("recommending more reps for an exercise done without weight", () => {
  it("recommends more reps (or some weight) when a set was rated under 5", () => {
    const [tip] = recommendationsFor(curl, bodyweight(4, 6, 6));

    expect(tip).toEqual({
      id: "increase-reps",
      title: "Increase the reps, or add some weight if you can",
      reasons: ["Last time you did it without weight and rated set 1 at 4/10 — under 5 means it felt easy."],
    });
  });

  it("counts blank weights as no weight", () => {
    const blank = [{ weight: null, reps: 12, effort: 3 }];
    expect(recommendationsFor(curl, blank)[0].id).toBe("increase-reps");
  });

  it("doesn't suggest a heavier weight for a 5 without weight", () => {
    expect(recommendationsFor(curl, bodyweight(5, 5))).toEqual([]);
  });

  it("suggests more reps, not weight, when it's getting easier without weight", () => {
    const [tip] = recommendationsFor(curl, bodyweight(6, 6), bodyweight(8, 8));

    expect(tip.id).toBe("increase-reps");
    expect(tip.reasons[0]).toContain("average effort 8 → 6");
  });
});
