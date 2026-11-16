import { describe, expect, it } from "vitest";
import { averageEffortOf, averageWeightOf, totalWeightLiftedOf } from "../../src/lib/sessionStats";
import { applySessionEdit, SESSION_EDIT_LIMITS } from "../../src/lib/sessionEdit";
import { averageEffortSeries } from "../../src/lib/reports";

// Drop sets: a set of 6 × 5 kg (effort 6) with a drop of 6 × 3 kg
// (effort 8) — the example of 12 reps at 5 kg split into a drop.
const dropSet = { weight: 5, reps: 6, effort: 6, drops: [{ weight: 3, reps: 6, effort: 8 }] };

describe("drop sets in workout stats", () => {
  it("count every drop's reps × weight towards total weight lifted", () => {
    expect(totalWeightLiftedOf([{ sets: [dropSet] }])).toBe(6 * 5 + 6 * 3);
  });

  it("average each drop's own effort and weight with the sets'", () => {
    expect(averageEffortOf([{ sets: [dropSet] }])).toBe(7);
    expect(averageWeightOf([{ sets: [dropSet] }])).toBe(4);
  });

  it("leave sets without drops as they were", () => {
    const sets = [{ weight: 10, reps: 5, effort: 5 }];
    expect(totalWeightLiftedOf([{ sets }])).toBe(50);
    expect(averageEffortOf([{ sets }])).toBe(5);
  });

  it("include drop efforts in the effort report", () => {
    const sessions = [{ completedAt: "2026-11-16T10:00:00.000Z", exercises: [{ sets: [dropSet] }] }];
    expect(averageEffortSeries(sessions, "week").map((p) => p.value)).toEqual([7]);
  });
});

describe("editing a logged workout's drop sets", () => {
  const stored = {
    exercises: [{ exerciseId: "e1", name: "Curl", sets: [{ weight: 5, reps: 12, effort: 6, restSeconds: 60, completedAt: "t1" }] }],
  };
  const edit = (sets) => applySessionEdit(stored, [{ exerciseId: "e1", sets }]);

  it("adds a drop with its own effort and counts it in the total", () => {
    const result = edit([{ weight: "5", reps: "6", effort: "6", drops: [{ weight: "3", reps: "6", effort: "8" }] }]);

    expect(result.error).toBeUndefined();
    expect(result.exercises[0].sets[0]).toMatchObject({ weight: 5, reps: 6, effort: 6, drops: [{ weight: 3, reps: 6, effort: 8 }] });
    expect(result.totalWeightLifted).toBe(48);
  });

  it("keeps drops entered in lb as typed, converting the kg", () => {
    const result = edit([{ unit: "lb", weightEntered: "20", reps: "6", drops: [{ unit: "lb", weightEntered: "10", reps: "6" }] }]);
    const drop = result.exercises[0].sets[0].drops[0];

    expect(drop).toMatchObject({ unit: "lb", weightEntered: 10, reps: 6, effort: null });
    expect(drop.weight).toBeCloseTo(4.54, 2);
  });

  it("removes the drops key when every drop is deleted", () => {
    const result = edit([{ weight: "5", reps: "12", drops: [] }]);
    expect(result.exercises[0].sets[0]).not.toHaveProperty("drops");
  });

  it("rejects a drop with an effort outside 1–10", () => {
    expect(edit([{ weight: "5", reps: "6", drops: [{ weight: "3", reps: "6", effort: "11" }] }]).error).toBe(
      "Curl · set 1 · drop 1: effort must be 1–10"
    );
  });

  it("rejects a drop with a negative weight", () => {
    expect(edit([{ weight: "5", reps: "6", drops: [{ weight: "-1", reps: "6" }] }]).error).toBe("Curl · set 1 · drop 1: enter a weight");
  });

  it("limits how many drops a set can have", () => {
    const drops = Array.from({ length: SESSION_EDIT_LIMITS.dropsPerSet + 1 }, () => ({ weight: "1", reps: "1" }));
    expect(edit([{ weight: "5", reps: "6", drops }]).error).toMatch(/at most \d+ drop sets/);
  });
});
