import { describe, expect, it } from "vitest";
import {
  chartWeightToKg,
  cmToDisplayLength,
  cmToFtIn,
  convertTypedWeight,
  displayLengthToCm,
  formatHeight,
  formatSetWeight,
  formatWeight,
  ftInToCm,
  kgToChartWeight,
  kgToLb,
  kgToStLb,
  lbToKg,
  lengthUnitFor,
  setWeightIn,
  stLbToKg,
} from "../../src/lib/units";

// Test plan 2.14 (display units), 4.4 / 4.12 / 5.9 (kg/lb weights).

describe("height", () => {
  it("converts cm to feet and inches", () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, inches: 10.9 });
  });

  it("converts feet and inches to cm", () => {
    expect(ftInToCm(5, 10)).toBe(177.8);
    expect(ftInToCm(6, "")).toBe(182.9);
  });

  it("treats both parts empty as no value", () => {
    expect(ftInToCm("", "")).toBeNull();
    expect(cmToFtIn("")).toEqual({ ft: "", inches: "" });
  });

  it("formats in the chosen unit", () => {
    expect(formatHeight(180, "ftin")).toBe("5 ft 10.9 in");
    expect(formatHeight(180, "cm")).toBe("180 cm");
    expect(formatHeight(null, "cm")).toBe("—");
  });
});

describe("body weight", () => {
  it("converts kg to stones and pounds", () => {
    expect(kgToStLb(70)).toEqual({ st: 11, lb: 0.3 });
  });

  it("rolls 14 lb over into the next stone", () => {
    expect(kgToStLb(6.3367)).toEqual({ st: 1, lb: 0 });
  });

  it("converts stones and pounds to kg", () => {
    expect(stLbToKg(11, 0)).toBe(69.9);
    expect(stLbToKg("", "")).toBeNull();
  });

  it("formats in the chosen unit", () => {
    expect(formatWeight(70, "stlb")).toBe("11 st 0.3 lb");
    expect(formatWeight(70.04, "kg")).toBe("70 kg");
    expect(formatWeight(null, "kg")).toBe("—");
  });

  it("round-trips chart values", () => {
    const st = kgToChartWeight(70, "stlb");
    expect(chartWeightToKg(st, "stlb")).toBeCloseTo(70, 6);
    expect(kgToChartWeight(70, "kg")).toBe(70);
  });
});

describe("lifting weights", () => {
  it("round-trips lb → kg → lb", () => {
    expect(lbToKg(100)).toBe(45.36);
    expect(kgToLb(45.36)).toBe(100);
  });

  it("shows a set in the unit it was logged in", () => {
    const lbSet = { weight: 45.36, unit: "lb", weightEntered: 100 };
    expect(setWeightIn(lbSet, "lb")).toBe(100);
    expect(setWeightIn(lbSet, "kg")).toBe(45.36);
    expect(setWeightIn({ weight: 20 }, "lb")).toBe(44.1);
    expect(setWeightIn({ weight: null }, "kg")).toBeNull();
  });

  it("formats a set for display", () => {
    expect(formatSetWeight({ weight: 45.36, unit: "lb", weightEntered: 100 })).toBe("100 lb (45.4 kg)");
    expect(formatSetWeight({ weight: 45 })).toBe("45 kg");
  });

  it("converts what's typed when the unit is switched", () => {
    expect(convertTypedWeight("20", "kg", "lb")).toBe("44.1");
    expect(convertTypedWeight("100", "lb", "kg")).toBe("45.4");
    expect(convertTypedWeight("20", "kg", "kg")).toBe("20");
    expect(convertTypedWeight("", "kg", "lb")).toBe("");
    expect(convertTypedWeight("abc", "kg", "lb")).toBe("abc");
  });
});

describe("tape measurements", () => {
  it("picks the unit from the user's choice, else their height unit", () => {
    expect(lengthUnitFor({})).toBe("cm");
    expect(lengthUnitFor({ heightUnit: "ftin" })).toBe("in");
    expect(lengthUnitFor({ heightUnit: "ftin", measurementUnit: "cm" })).toBe("cm");
  });

  it("converts between cm and inches", () => {
    expect(cmToDisplayLength(25.4, "in")).toBe(10);
    expect(displayLengthToCm(10, "in")).toBe(25.4);
    expect(displayLengthToCm("", "in")).toBeNull();
  });
});
