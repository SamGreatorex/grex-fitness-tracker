import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/dynamo", () => ({ ddb: { send: vi.fn() }, TABLES: {} }));

import { normaliseProgramInput } from "../../src/lib/programs";
import { aggregateSessionStats, averageEffortOf, averageWeightOf } from "../../src/lib/sessionStats";

// Test plan 4.2–4.5 / 5.8–5.10 (programme builder rules) and 4.18
// (workout summary totals).

const strength = (extra = {}) => ({
  name: "Bench press",
  targetSets: "3",
  targetReps: "10",
  targetWeight: "",
  restSeconds: "60",
  ...extra,
});

const programme = (extra = {}) => ({
  name: "Strength block",
  goal: "Build muscle",
  ledBy: "user",
  durationWeeks: "4",
  days: [{ dayId: null, label: "Upper", subtitle: "", exercises: [strength()] }],
  ...extra,
});

const firstExercise = (body) => normaliseProgramInput(body).program.days[0].exercises[0];

describe("normaliseProgramInput — valid programmes", () => {
  it("normalises a strength programme", () => {
    const { program, error } = normaliseProgramInput(programme());
    expect(error).toBeUndefined();
    expect(program).toMatchObject({ name: "Strength block", goal: "Build muscle", ledBy: "user", durationWeeks: 4 });
    expect(program.days[0]).toMatchObject({ label: "Upper", subtitle: null, order: 0 });
    expect(program.days[0].exercises[0]).toMatchObject({
      exerciseId: "0",
      name: "Bench press",
      targetSets: 3,
      targetReps: 10,
      targetWeight: null,
      restSeconds: 60,
    });
  });

  it("keeps rep ranges as text", () => {
    expect(firstExercise(programme({ days: [{ exercises: [strength({ targetReps: "8-12" })] }] })).targetReps).toBe("8-12");
  });

  it("supports trainer-led programmes and defaults anything else to user-led", () => {
    expect(normaliseProgramInput(programme({ ledBy: "trainer" })).program.ledBy).toBe("trainer");
    expect(normaliseProgramInput(programme({ ledBy: "someone" })).program.ledBy).toBe("user");
  });

  it("stores cardio as settings and time only", () => {
    const body = programme({ days: [{ exercises: [{ name: "Treadmill", type: "cardio", settings: "8 mph", targetSeconds: 600 }] }] });
    expect(firstExercise(body)).toMatchObject({ name: "Treadmill", type: "cardio", settings: "8 mph", targetSeconds: 600 });
    expect(firstExercise(body)).not.toHaveProperty("targetSets");
  });

  it("keeps existing day ids so logged workouts stay attached", () => {
    const existing = { days: [{ dayId: "abc12345" }] };
    const kept = normaliseProgramInput(programme({ days: [{ dayId: "abc12345", exercises: [strength()] }] }), existing);
    expect(kept.program.days[0].dayId).toBe("abc12345");

    const fresh = normaliseProgramInput(programme({ days: [{ dayId: "unknown1", exercises: [strength()] }] }), existing);
    expect(fresh.program.days[0].dayId).not.toBe("unknown1");
    expect(fresh.program.days[0].dayId).toHaveLength(8);
  });
});

describe("normaliseProgramInput — start weight in kg or lb (4.4, 5.9)", () => {
  const withWeight = (targetWeight, targetWeightUnit) =>
    programme({ days: [{ exercises: [strength({ targetWeight, targetWeightUnit })] }] });

  it("stores a kg start weight as is", () => {
    expect(firstExercise(withWeight("60", "kg"))).toMatchObject({ targetWeight: 60, targetWeightUnit: null, targetWeightEntered: null });
  });

  it("treats a missing unit as kg", () => {
    expect(firstExercise(withWeight("60"))).toMatchObject({ targetWeight: 60, targetWeightUnit: null });
  });

  it("stores an lb start weight in kg and keeps the number typed", () => {
    expect(firstExercise(withWeight("100", "lb"))).toMatchObject({ targetWeight: 45.36, targetWeightUnit: "lb", targetWeightEntered: 100 });
  });

  it("leaves the start weight empty when none is given", () => {
    expect(firstExercise(withWeight("", "lb"))).toMatchObject({ targetWeight: null, targetWeightUnit: null, targetWeightEntered: null });
  });

  it("rejects weights over the limit, in the unit used", () => {
    expect(normaliseProgramInput(withWeight("501", "kg")).error).toBe("Day 1 · Bench press: start weight must be 0–500 kg");
    expect(normaliseProgramInput(withWeight("1200", "lb")).error).toBe("Day 1 · Bench press: start weight must be 0–1102.3 lb");
  });

  it("rejects negative and non-numeric weights", () => {
    expect(normaliseProgramInput(withWeight("-5", "kg")).error).toMatch(/start weight/);
    expect(normaliseProgramInput(withWeight("heavy", "lb")).error).toMatch(/start weight/);
  });
});

describe("normaliseProgramInput — validation errors (4.5)", () => {
  const errorFor = (body) => normaliseProgramInput(body).error;

  it("needs a name", () => {
    expect(errorFor(programme({ name: "  " }))).toBe("Programme name is required");
    expect(errorFor(programme({ name: "x".repeat(101) }))).toBe("Programme name must be at most 100 characters");
  });

  it("needs 1–52 weeks", () => {
    expect(errorFor(programme({ durationWeeks: "0" }))).toBe("Duration must be 1–52 weeks");
    expect(errorFor(programme({ durationWeeks: "53" }))).toBe("Duration must be 1–52 weeks");
  });

  it("needs 1–7 days", () => {
    expect(errorFor(programme({ days: [] }))).toBe("Add at least one day");
    const eight = Array.from({ length: 8 }, () => ({ exercises: [strength()] }));
    expect(errorFor(programme({ days: eight }))).toBe("A programme can have at most 7 days");
  });

  it("needs at least one exercise per day", () => {
    expect(errorFor(programme({ days: [{ exercises: [strength()] }, { exercises: [] }] }))).toBe("Day 2 needs at least one exercise");
  });

  it("checks sets and rest", () => {
    expect(errorFor(programme({ days: [{ exercises: [strength({ targetSets: "0" })] }] }))).toBe("Day 1 · Bench press: sets must be 1–20");
    expect(errorFor(programme({ days: [{ exercises: [strength({ restSeconds: "601" })] }] }))).toBe("Day 1 · Bench press: rest must be 0–600s");
  });

  it("needs a time for cardio", () => {
    const body = programme({ days: [{ exercises: [{ name: "Bike", type: "cardio", targetSeconds: null }] }] });
    expect(errorFor(body)).toBe("Day 1 · Bike: enter a time (up to 6 hours)");
  });
});

describe("workout summary stats (4.18)", () => {
  const exercises = [
    { sets: [{ weight: 60, reps: 10, effort: 6 }, { weight: 70, reps: 8, effort: 8 }] },
    { cardio: { effort: 4 } },
  ];

  it("averages weight across sets and effort across sets and cardio", () => {
    expect(averageWeightOf(exercises)).toBe(65);
    expect(averageEffortOf(exercises)).toBe(6);
    expect(averageWeightOf([{ cardio: {} }])).toBeNull();
  });

  it("rolls several sessions up", () => {
    const sessions = [
      { exercises, totalWeightLifted: 1160, durationSeconds: 1800 },
      { exercises: [{ sets: [{ weight: 80, reps: 5, effort: 9 }] }], totalWeightLifted: 400, durationSeconds: 600 },
    ];
    expect(aggregateSessionStats(sessions)).toEqual({
      sessionCount: 2,
      totalWeightLifted: 1560,
      averageWeight: 70,
      averageEffort: 6.75,
      durationSeconds: 2400,
    });
  });
});
