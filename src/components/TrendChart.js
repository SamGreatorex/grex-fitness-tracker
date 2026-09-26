"use client";

import { useMemo, useRef, useState } from "react";
import styles from "./TrendChart.module.css";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 28, left: 44 };
const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right;
const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

function niceCeil(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s * base >= value) ?? 10;
  return step * base;
}

function xFor(index, count) {
  if (count <= 1) return PADDING.left + CHART_WIDTH / 2;
  return PADDING.left + (CHART_WIDTH * index) / (count - 1);
}

function niceFloor(value) {
  if (value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  return Math.floor(value / base) * base;
}

function yFor(value, yMin, yMax) {
  return PADDING.top + CHART_HEIGHT * (1 - (value - yMin) / (yMax - yMin));
}

// Fits the y-range to the data (with headroom) instead of starting at 0 —
// for measures like body weight, where the change is what matters and a
// 0-based axis would flatten it into a straight line.
function fittedDomain(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.25, Math.abs(max) * 0.02, 0.5);
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  // Three equal gridline gaps on a round step (e.g. 77.5 / 80 / 82.5 / 85),
  // widening the step until the range fits.
  let step = niceCeil((hi - lo) / 3);
  let start = Math.floor(lo / step) * step;
  while (start + 3 * step < hi) {
    step = niceCeil(step * 1.01);
    start = Math.floor(lo / step) * step;
  }
  return [start, start + 3 * step];
}

// A single-series trend line — period-bucketed data (`data`: [{ key, label,
// value }]), a subtle area wash, gridlines, an end label, and a crosshair
// tooltip on hover. One axis, one series — no legend needed.
// `zeroBaseline={false}` fits the y-axis to the data instead of 0..max.
// `formatAxis` formats y-axis ticks (defaults to formatValue).
export default function TrendChart({
  title,
  unit = "",
  data,
  formatValue = (v) => Math.round(v),
  formatAxis,
  zeroBaseline = true,
  emptyText = "No data yet for this period.",
}) {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const [yMin, yMax] = useMemo(() => {
    if (!zeroBaseline && data.length > 0) return fittedDomain(data.map((d) => d.value));
    return [0, niceCeil(Math.max(...data.map((d) => d.value), 0) * 1.15)];
  }, [data, zeroBaseline]);
  const axisFormat = formatAxis ?? formatValue;

  const points = useMemo(
    () => data.map((d, i) => ({ ...d, x: xFor(i, data.length), y: yFor(d.value, yMin, yMax) })),
    [data, yMin, yMax]
  );

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1].x},${PADDING.top + CHART_HEIGHT} L${points[0].x},${PADDING.top + CHART_HEIGHT} Z`
      : "";

  const gridSteps = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const last = points[points.length - 1];

  const handleMove = (e) => {
    if (points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const pointerX = fracX * WIDTH;
    let nearest = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - pointerX);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  return (
    <div className="vizRoot">
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <p className={styles.title}>{title}</p>
          {last && (
            <span className={styles.latestValue}>
              {formatValue(last.value)}
              {unit}
            </span>
          )}
        </div>

        {points.length === 0 ? (
          <p className={styles.empty}>{emptyText}</p>
        ) : (
          <div className={styles.chartWrap}>
            <svg
              ref={svgRef}
              className={styles.svg}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              onPointerMove={handleMove}
              onPointerLeave={() => setHoverIndex(null)}
            >
              {gridSteps.map((g) => (
                <g key={g}>
                  <line
                    className={styles.gridline}
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={yFor(g, yMin, yMax)}
                    y2={yFor(g, yMin, yMax)}
                  />
                  <text className={styles.axisLabel} x={0} y={yFor(g, yMin, yMax) + 4}>
                    {axisFormat(g)}
                  </text>
                </g>
              ))}

              {points.length > 1 && <path className={styles.area} d={areaPath} />}
              {points.length > 1 && <path className={styles.line} d={linePath} />}

              {points.map((p, i) => {
                const showXLabel = points.length <= 7 || i % Math.ceil(points.length / 7) === 0 || i === points.length - 1;
                return (
                  <g key={p.key}>
                    {showXLabel && (
                      <text className={styles.xLabel} x={p.x} y={HEIGHT - 8}>
                        {p.label}
                      </text>
                    )}
                    {i === points.length - 1 && <circle className={styles.dot} cx={p.x} cy={p.y} r={5} />}
                  </g>
                );
              })}

              {last && (
                <text className={styles.endLabel} x={last.x} y={last.y - 12} textAnchor="middle">
                  {formatValue(last.value)}
                  {unit}
                </text>
              )}

              {hoverIndex != null && (
                <>
                  <line
                    className={styles.crosshair}
                    x1={points[hoverIndex].x}
                    x2={points[hoverIndex].x}
                    y1={PADDING.top}
                    y2={PADDING.top + CHART_HEIGHT}
                  />
                  <circle className={styles.hoverDot} cx={points[hoverIndex].x} cy={points[hoverIndex].y} r={5} />
                </>
              )}
            </svg>

            {hoverIndex != null && (
              <div
                className={styles.tooltip}
                style={{
                  left: `${(points[hoverIndex].x / WIDTH) * 100}%`,
                  top: `${(points[hoverIndex].y / HEIGHT) * 100 - 4}%`,
                }}
              >
                <span className={styles.tooltipValue}>
                  {formatValue(points[hoverIndex].value)}
                  {unit}
                </span>
                <span className={styles.tooltipLabel}>{points[hoverIndex].label}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
