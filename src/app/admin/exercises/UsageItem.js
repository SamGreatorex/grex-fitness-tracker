import styles from "./page.module.css";

// One place an exercise is used: whose programme it is (or that it's a
// shared template), then the programme and day. `userNames` maps
// userId → display name.
export default function UsageItem({ usage, userNames }) {
  const owner = usage.isTemplate
    ? "Template"
    : userNames[usage.ownerUserId] || "Unknown user";

  return (
    <li className={styles.usageItem}>
      <span className={usage.isTemplate ? styles.usageTemplate : styles.usageOwner}>{owner}</span>
      {" — "}
      {usage.programName} · {usage.dayLabel}
    </li>
  );
}
