import Link from "next/link";
import Avatar from "./Avatar";
import styles from "./TrainerCard.module.css";

// "Your trainer" on the home page. `trainer` is { name, avatarUrl }, or null
// when the user hasn't been assigned a PT yet. Shows the PT's display name
// only — never their email. `chatHref`, when given, adds a Message button.
export default function TrainerCard({ trainer, chatHref }) {
  if (!trainer) {
    return (
      <div className={`${styles.card} ${styles.cardEmpty}`}>
        <span className={styles.label}>Your trainer</span>
        <span className={styles.emptyText}>You haven&apos;t been assigned a trainer yet.</span>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <Avatar src={trainer.avatarUrl} name={trainer.name || "?"} size={48} />
      <div className={styles.info}>
        <span className={styles.label}>Your trainer</span>
        {trainer.name ? (
          <span className={styles.name}>{trainer.name}</span>
        ) : (
          <span className={styles.emptyText}>Your trainer hasn&apos;t added their name yet.</span>
        )}
        {trainer.isSelf && <span className={styles.emptyText}>That&apos;s you — chat is between trainers and their clients.</span>}
      </div>
      {chatHref && (
        <Link href={chatHref} className={styles.messageButton}>
          Message
        </Link>
      )}
    </div>
  );
}
