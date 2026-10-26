// The 1-10 effort scale: a colour and a label per level, from dark blue
// (extremely easy) through green, yellow and orange to burgundy (maximal).
// The "dark" shades are lifted a little so they still read on the app's
// black background.
export const EFFORT_SCALE = [
  { level: 1, color: "#2f5fd0", label: "Extremely Easy" }, // dark blue
  { level: 2, color: "#4fa8e8", label: "Very Easy" }, // light blue
  { level: 3, color: "#1f8a46", label: "Easy" }, // dark green
  { level: 4, color: "#5fc46a", label: "Somewhat Easy" }, // light green
  { level: 5, color: "#c9a200", label: "Somewhat Hard" }, // dark yellow
  { level: 6, color: "#f5a04a", label: "Hard" }, // light orange
  { level: 7, color: "#e0620d", label: "Harder" }, // dark orange
  { level: 8, color: "#ef5350", label: "Very Hard" }, // light red
  { level: 9, color: "#c62828", label: "Extremely Hard" }, // dark red
  { level: 10, color: "#9b2148", label: "Maximal Exertion" }, // burgundy
];

// The scale entry for a rating, rounded to the nearest level (averages like
// 6.4 are decimals) and clamped to 1-10.
function effortLevel(level) {
  const clamped = Math.min(10, Math.max(1, Math.round(Number(level) || 1)));
  return EFFORT_SCALE[clamped - 1];
}

export function effortColor(level) {
  return effortLevel(level).color;
}

export function effortLabel(level) {
  return effortLevel(level).label;
}
