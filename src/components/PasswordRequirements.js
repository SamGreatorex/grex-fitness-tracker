import { PASSWORD_RULES } from "../lib/password";
import styles from "./PasswordRequirements.module.css";

// Live checklist of the password rules, ticking each off as it's met.
export default function PasswordRequirements({ password }) {
  return (
    <ul className={styles.list} aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.key} className={met ? styles.met : styles.unmet}>
            <span aria-hidden="true" className={styles.mark}>
              {met ? "✓" : "○"}
            </span>
            {rule.label}
            <span className="sr-only">{met ? " (met)" : " (not met)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
