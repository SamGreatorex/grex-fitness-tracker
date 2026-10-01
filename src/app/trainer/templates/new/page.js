"use client";

import AppHeader from "../../../../components/AppHeader";
import ProgrammeBuilder from "../../../../components/ProgrammeBuilder";
import styles from "../../page.module.css";

export default function NewTemplatePage() {
  return (
    <>
      <AppHeader backHref="/trainer/templates" backLabel="Templates" />
      <main className={styles.main}>
        <h1 className={styles.title}>New template</h1>
        <p className={styles.subtitle}>Shared with every trainer, to start clients&apos; programmes from.</p>
        <ProgrammeBuilder isTemplate backHref="/trainer/templates" />
      </main>
    </>
  );
}
