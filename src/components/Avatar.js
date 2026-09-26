import styles from "./Avatar.module.css";

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return source.slice(0, 1).toUpperCase();
}

// Profile picture if there is one, otherwise the user's initials.
export default function Avatar({ src, name, email, size = 36 }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={styles.image} />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
