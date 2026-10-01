import { WEIGHT_UNITS, chartWeightToKg, formatWeight } from "../../lib/units";

// MetricDetail/TrendChart props for each kind of report value.

// Body weight, charted as kg or decimal stones (see kgToChartWeight).
export function bodyWeightFormat(weightUnit) {
  const stones = weightUnit === WEIGHT_UNITS.ST_LB;
  return {
    formatValue: stones ? (v) => formatWeight(chartWeightToKg(v, weightUnit), weightUnit) : (v) => `${v.toFixed(1)} kg`,
    // A change of a few pounds reads better than "0.2 st".
    formatChange: stones ? (d) => `${(d * 14).toFixed(1)} lb` : (d) => `${d.toFixed(1)} kg`,
    words: { up: "gained", down: "lost" },
    chart: {
      unit: stones ? "" : " kg",
      zeroBaseline: false,
      formatValue: stones ? (v) => formatWeight(chartWeightToKg(v, weightUnit), weightUnit) : (v) => v.toFixed(1),
      formatAxis: (v) => v.toFixed(1),
    },
  };
}

// A tape measurement, already in the user's length unit.
export function lengthFormat(lengthUnit) {
  return {
    formatValue: (v) => `${v.toFixed(1)} ${lengthUnit}`,
    formatChange: (d) => `${d.toFixed(1)} ${lengthUnit}`,
    words: { up: "gained", down: "lost" },
    chart: { unit: ` ${lengthUnit}`, zeroBaseline: false, formatValue: (v) => v.toFixed(1) },
  };
}

// Kilograms lifted — more is progress.
export function liftedFormat({ decimals = 0 } = {}) {
  return {
    formatValue: (v) => `${v.toLocaleString(undefined, { maximumFractionDigits: decimals })} kg`,
    formatChange: (d) => `${d.toLocaleString(undefined, { maximumFractionDigits: decimals })} kg`,
    goodDirection: "up",
    chart: { unit: " kg", formatValue: decimals ? (v) => v.toFixed(decimals) : undefined },
  };
}

// Average effort out of 10 — neither direction is "better".
export const effortFormat = {
  formatValue: (v) => `${v.toFixed(1)}/10`,
  formatChange: (d) => d.toFixed(1),
  chart: { unit: "/10", formatValue: (v) => v.toFixed(1) },
};
