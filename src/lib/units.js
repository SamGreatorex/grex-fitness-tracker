// Height/weight are always stored in cm/kg; these convert to and from the
// imperial units a user can choose to enter/view them in.

export const HEIGHT_UNITS = { CM: "cm", FT_IN: "ftin" };
export const WEIGHT_UNITS = { KG: "kg", ST_LB: "stlb" };

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

const round1 = (n) => Math.round(n * 10) / 10;

// Empty-string-safe parse: "" → null, otherwise a finite number or NaN.
function parse(value) {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}

export function cmToFtIn(cm) {
  const n = parse(cm);
  if (n === null || !Number.isFinite(n)) return { ft: "", inches: "" };
  let ft = Math.floor(n / CM_PER_INCH / 12);
  let inches = round1(n / CM_PER_INCH - ft * 12);
  if (inches >= 12) {
    ft += 1;
    inches = round1(inches - 12);
  }
  return { ft, inches };
}

// Returns null if neither part is filled in; a missing inches part counts as 0.
export function ftInToCm(ft, inches) {
  const f = parse(ft);
  const i = parse(inches);
  if (f === null && i === null) return null;
  return round1(((f ?? 0) * 12 + (i ?? 0)) * CM_PER_INCH);
}

export function kgToStLb(kg) {
  const n = parse(kg);
  if (n === null || !Number.isFinite(n)) return { st: "", lb: "" };
  const totalLb = n / KG_PER_LB;
  let st = Math.floor(totalLb / 14);
  let lb = round1(totalLb - st * 14);
  if (lb >= 14) {
    st += 1;
    lb = round1(lb - 14);
  }
  return { st, lb };
}

// Returns null if neither part is filled in; a missing lb part counts as 0.
export function stLbToKg(st, lb) {
  const s = parse(st);
  const l = parse(lb);
  if (s === null && l === null) return null;
  return round1(((s ?? 0) * 14 + (l ?? 0)) * KG_PER_LB);
}

// ---- Lifting weights ----
// A strength set's weight is always stored in kg (set.weight) — totals,
// averages and reports all use that. An exercise can be logged in lb (e.g.
// a machine labelled in pounds): those sets also keep unit: "lb" and the
// number actually entered (weightEntered), so they show — and prefill next
// time — exactly as typed.
export const LIFT_UNITS = { KG: "kg", LB: "lb" };

// kg to 2 decimals, so lb → kg → lb round-trips (100 lb → 45.36 kg → 100 lb).
export function lbToKg(lb) {
  return Math.round(lb * KG_PER_LB * 100) / 100;
}

export function kgToLb(kg) {
  return round1(kg / KG_PER_LB);
}

// The weight to show for a logged set in `unit` — the exact number entered
// when it was logged in that unit, otherwise converted from kg.
export function setWeightIn(set, unit) {
  if (set?.weight == null) return null;
  if (unit === LIFT_UNITS.LB) return set.unit === LIFT_UNITS.LB && set.weightEntered != null ? set.weightEntered : kgToLb(set.weight);
  return set.weight;
}

// A logged set's weight for display: "100 lb (45.4 kg)" if logged in lb,
// otherwise "45 kg".
export function formatSetWeight(set) {
  const kg = `${round1(set?.weight ?? 0)} kg`;
  return set?.unit === LIFT_UNITS.LB ? `${setWeightIn(set, LIFT_UNITS.LB)} lb (${kg})` : kg;
}

// Converts a typed weight between kg and lb ("" stays "").
export function convertTypedWeight(value, from, to) {
  if (from === to || value === "" || value == null) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(to === LIFT_UNITS.LB ? kgToLb(n) : round1(n * KG_PER_LB));
}

export const LENGTH_UNITS = { CM: "cm", IN: "in" };

// Unit for tape measurements: the user's explicit choice, or — if they've
// never picked — whatever their height unit implies (ft/in → inches).
export function lengthUnitFor(profile) {
  if (profile?.measurementUnit === LENGTH_UNITS.IN || profile?.measurementUnit === LENGTH_UNITS.CM) {
    return profile.measurementUnit;
  }
  return profile?.heightUnit === HEIGHT_UNITS.FT_IN ? LENGTH_UNITS.IN : LENGTH_UNITS.CM;
}

export function cmToDisplayLength(cm, lengthUnit) {
  const n = parse(cm);
  if (n === null || !Number.isFinite(n)) return "";
  return lengthUnit === LENGTH_UNITS.IN ? round1(n / CM_PER_INCH) : round1(n);
}

export function displayLengthToCm(value, lengthUnit) {
  const n = parse(value);
  if (n === null) return null;
  return lengthUnit === LENGTH_UNITS.IN ? round1(n * CM_PER_INCH) : round1(n);
}

export function formatLength(cm, lengthUnit) {
  if (cm == null) return "—";
  return `${cmToDisplayLength(cm, lengthUnit)} ${lengthUnit}`;
}

export function formatHeight(cm, heightUnit) {
  if (cm == null) return "—";
  if (heightUnit === HEIGHT_UNITS.FT_IN) {
    const { ft, inches } = cmToFtIn(cm);
    return `${ft} ft ${inches} in`;
  }
  return `${round1(cm)} cm`;
}

export function formatWeight(kg, weightUnit) {
  if (kg == null) return "—";
  if (weightUnit === WEIGHT_UNITS.ST_LB) {
    const { st, lb } = kgToStLb(kg);
    return `${st} st ${lb} lb`;
  }
  return `${round1(kg)} kg`;
}

// Weight as one number for charting: kg, or decimal stones.
export function kgToChartWeight(kg, weightUnit) {
  return weightUnit === WEIGHT_UNITS.ST_LB ? kg / KG_PER_LB / 14 : kg;
}

export function chartWeightToKg(value, weightUnit) {
  return weightUnit === WEIGHT_UNITS.ST_LB ? value * 14 * KG_PER_LB : value;
}
