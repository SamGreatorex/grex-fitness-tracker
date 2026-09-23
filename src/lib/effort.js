// Maps a 1-10 effort rating to a color on a green (easy) -> red (hard) scale.
export function effortColor(level) {
  const clamped = Math.min(10, Math.max(1, Number(level) || 1));
  const t = (clamped - 1) / 9;
  const hue = 142 - t * 142; // 142 = green, 0 = red
  return `hsl(${hue}, 70%, 42%)`;
}
