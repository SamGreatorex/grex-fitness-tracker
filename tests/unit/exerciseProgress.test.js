import { describe, expect, it } from "vitest";
import { exerciseChange, sessionExerciseChanges, weeklyExerciseProgress } from "../../src/lib/exerciseProgress";

const strength = (sets) => ({ exerciseId: "e1", name: "Curl", sets });

describe("comparing an exercise with last time, set by set", () => {
  it("shows each set's weight and effort with how much each moved", () => {
    const last = [
      { weight: 20, reps: 10, effort: 8 },
      { weight: 20, reps: 8, effort: 6 },
    ];
    const today = strength([
      { weight: 22.5, reps: 10, effort: 7 },
      { weight: 20, reps: 10, effort: 7 },
    ]);

    expect(exerciseChange(today, last)).toEqual({
      key: "e1",
      name: "Curl",
      first: false,
      note: null,
      unit: "kg",
      columns: { row: "Set", amount: "Weight (kg)", effort: "Effort" },
      rows: [
        { label: "1", drop: false, amount: { value: 22.5, change: 2.5 }, effort: { value: 7, change: -1 } },
        { label: "2", drop: false, amount: { value: 20, change: 0 }, effort: { value: 7, change: 1 } },
      ],
    });
  });

  it("compares drop sets with last time's drops on the same set", () => {
    const last = [{ weight: 5, reps: 12, effort: 6, drops: [{ weight: 3, reps: 6, effort: 9 }] }];
    const today = strength([
      { weight: 5, reps: 6, effort: 6, drops: [{ weight: 4, reps: 6, effort: 8 }, { weight: 2, reps: 6, effort: 9 }] },
    ]);
    const rows = exerciseChange(today, last).rows;

    expect(rows.map((r) => r.label)).toEqual(["1", "↳", "↳"]);
    expect(rows[1]).toEqual({ label: "↳", drop: true, amount: { value: 4, change: 1 }, effort: { value: 8, change: -1 } });
    // No second drop last time: nothing to compare.
    expect(rows[2].amount).toEqual({ value: 2, change: null });
  });

  it("has no change for a set that didn't exist last time or wasn't rated", () => {
    const rows = exerciseChange(strength([{ weight: 20, reps: 10 }, { weight: 20, reps: 10, effort: 7 }]), [
      { weight: 20, reps: 10, effort: 6 },
    ]).rows;

    expect(rows[0].effort).toEqual({ value: null, change: null });
    expect(rows[1]).toMatchObject({ amount: { change: null }, effort: { change: null } });
  });

  it("compares in lb when today's sets were logged in lb", () => {
    const today = strength([{ weight: 22.68, unit: "lb", weightEntered: 50, reps: 10 }]);
    const result = exerciseChange(today, [{ weight: 20.41, unit: "lb", weightEntered: 45, reps: 10 }]);

    expect(result.unit).toBe("lb");
    expect(result.rows[0].amount).toEqual({ value: 50, change: 5 });
  });

  it("marks the first time, still listing the sets", () => {
    const result = exerciseChange(strength([{ weight: 20, reps: 10, effort: 6 }]), null);

    expect(result).toMatchObject({ first: true, note: "First time — nothing to compare yet" });
    expect(result.rows[0]).toMatchObject({ amount: { value: 20, change: null }, effort: { value: 6, change: null } });
  });

  it("compares cardio time and effort", () => {
    const today = { exerciseId: "c1", name: "Run", sets: [], cardio: { durationSeconds: 1500, effort: 5 } };

    expect(exerciseChange(today, { durationSeconds: 1200, effort: 6 })).toMatchObject({
      first: false,
      unit: "min",
      rows: [{ amount: { value: 25, change: 5 }, effort: { value: 5, change: -1 } }],
    });
  });
});

describe("comparing a past workout", () => {
  const logged = (sessionId, completedAt, weight) => ({
    sessionId,
    completedAt,
    exercises: [{ exerciseId: "e1", name: "Curl", sets: [{ weight, reps: 10 }] }],
  });
  const history = [
    logged("s3", "2026-11-10T10:00:00.000Z", 30),
    logged("s2", "2026-11-03T10:00:00.000Z", 25),
    logged("s1", "2026-10-27T10:00:00.000Z", 20),
  ];

  it("compares with the workout before it, not later ones", () => {
    const [change] = sessionExerciseChanges(history[1], history);
    expect(change.rows[0].amount).toEqual({ value: 25, change: 5 });
  });

  it("says first time for the earliest workout", () => {
    const [change] = sessionExerciseChanges(history[2], history);
    expect(change.first).toBe(true);
  });
});

describe("week by week through a programme", () => {
  const session = (week, completedAt, exercises) => ({ week, completedAt, exercises });
  const curl = (...sets) => ({ exerciseId: "e1", name: "Curl", sets });
  const run = (durationSeconds, effort) => ({ exerciseId: "c1", name: "Run", sets: [], cardio: { durationSeconds, effort } });

  const sessions = [
    session(1, "2026-11-02T10:00:00.000Z", [curl({ weight: 20, reps: 10, effort: 8 }), run(600, 6)]),
    session(1, "2026-11-04T10:00:00.000Z", [curl({ weight: 20, reps: 10, effort: 6 }), run(600, 6)]),
    session(2, "2026-11-09T10:00:00.000Z", [curl({ weight: 22.5, reps: 10, effort: 6, drops: [{ weight: 10, reps: 8, effort: 6 }] })]),
    session(3, "2026-11-16T10:00:00.000Z", [curl({ weight: 22.5, reps: 10, effort: 7.1 }), run(1500, 5)]),
  ];

  it("shows each week's heaviest set and average effort against the week before", () => {
    const [curlWeeks] = weeklyExerciseProgress(sessions, 3);

    expect(curlWeeks).toMatchObject({ name: "Curl", first: false, note: null, unit: "kg" });
    expect(curlWeeks.columns).toEqual({ row: "Week", amount: "Top weight (kg)", effort: "Avg. effort" });
    expect(curlWeeks.rows).toEqual([
      { label: "Wk 1", drop: false, amount: { value: 20, change: null }, effort: { value: 7, change: null } },
      // Drop sets count towards effort, not the top weight.
      { label: "Wk 2", drop: false, amount: { value: 22.5, change: 2.5 }, effort: { value: 6, change: -1 } },
      { label: "Wk 3", drop: false, amount: { value: 22.5, change: 0 }, effort: { value: 7.1, change: 1.1 } },
    ]);
  });

  it("treats a tiny change in average effort as the same", () => {
    const close = [
      session(1, "2026-11-02T10:00:00.000Z", [curl({ weight: 20, reps: 10, effort: 7 })]),
      session(2, "2026-11-09T10:00:00.000Z", [curl({ weight: 20, reps: 10, effort: 7.2 })]),
    ];
    expect(weeklyExerciseProgress(close, 2)[0].rows[1].effort).toEqual({ value: 7.2, change: 0 });
  });

  it("totals cardio time per week and compares with the last week it was done", () => {
    const runWeeks = weeklyExerciseProgress(sessions, 3)[1];

    expect(runWeeks.columns.amount).toBe("Total time (min)");
    expect(runWeeks.rows[1]).toEqual({ label: "Wk 2", drop: false, amount: { value: null, change: null }, effort: { value: null, change: null } });
    // Week 3 against week 1, the last week it was done.
    expect(runWeeks.rows[2]).toMatchObject({ amount: { value: 25, change: 5 }, effort: { value: 5, change: -1 } });
  });

  it("notes an exercise only done in one week", () => {
    const [only] = weeklyExerciseProgress(sessions.slice(0, 2), 1);
    expect(only).toMatchObject({ first: true, note: "Only done in one week so far" });
  });

  it("ignores weeks after the one being summarised", () => {
    expect(weeklyExerciseProgress(sessions, 2)[0].rows.map((r) => r.label)).toEqual(["Wk 1", "Wk 2"]);
  });
});
