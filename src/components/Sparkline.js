const WIDTH = 96;
const HEIGHT = 32;
const PAD = 3;

// A minimal 12-point-scale trend line for a stat tile — no axes, no
// gridlines. The line stays in the de-emphasis (muted) hue; only the final
// point picks up the accent color, per the stat-tile "current period in the
// accent" convention.
export default function Sparkline({ values }) {
  if (values.length < 2) return null;

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: PAD + ((WIDTH - PAD * 2) * i) / (values.length - 1),
    y: PAD + (HEIGHT - PAD * 2) * (1 - (v - min) / range),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const lastPoint = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT}>
      <path d={linePath} fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="var(--series-1)" />
    </svg>
  );
}
