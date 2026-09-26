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

// Tape measurements follow the user's height unit: cm, or inches for ft/in.
export function lengthUnitLabel(heightUnit) {
  return heightUnit === HEIGHT_UNITS.FT_IN ? "in" : "cm";
}

export function cmToDisplayLength(cm, heightUnit) {
  const n = parse(cm);
  if (n === null || !Number.isFinite(n)) return "";
  return heightUnit === HEIGHT_UNITS.FT_IN ? round1(n / CM_PER_INCH) : round1(n);
}

export function displayLengthToCm(value, heightUnit) {
  const n = parse(value);
  if (n === null) return null;
  return heightUnit === HEIGHT_UNITS.FT_IN ? round1(n * CM_PER_INCH) : round1(n);
}

export function formatLength(cm, heightUnit) {
  if (cm == null) return "—";
  return `${cmToDisplayLength(cm, heightUnit)} ${lengthUnitLabel(heightUnit)}`;
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
