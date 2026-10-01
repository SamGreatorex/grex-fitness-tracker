// Chat timestamps: "14:05" today, "Yesterday", the weekday within a week,
// otherwise the date.
export function formatChatTime(iso) {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
}

// The time of a single message, shown under its bubble.
export function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Day separator in a thread: "Today", "Yesterday" or the full date.
export function formatDayHeading(iso) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
