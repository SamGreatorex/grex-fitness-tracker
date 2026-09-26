"use client";

import Link from "next/link";
import AppHeader from "../../components/AppHeader";
import styles from "./page.module.css";

const SECTIONS = [
  {
    href: "/admin/exercises",
    title: "Exercise library",
    description: "Add, edit and remove exercises, their media and muscle tags.",
  },
  {
    href: "/admin/users",
    title: "Users",
    description: "See everyone who has signed up and change their role (Basic, PT, Admin).",
  },
];

export default function AdminHome() {
  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.subtitle}>Manage the app and its users.</p>

        <div className={styles.grid}>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className={styles.card}>
              <span className={styles.cardTitle}>{s.title}</span>
              <span className={styles.cardText}>{s.description}</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
