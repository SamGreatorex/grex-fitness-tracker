"use client";

import { useParams } from "next/navigation";
import AppHeader from "../../../../../../components/AppHeader";
import ProgrammeBuilder from "../../../../../../components/ProgrammeBuilder";
import { useClient } from "../../../../useClient";
import styles from "../../../../page.module.css";

export default function NewProgrammePage() {
  const { userId } = useParams();
  const { client } = useClient(userId);
  const clientHref = `/trainer/clients/${userId}`;

  return (
    <>
      <AppHeader backHref={clientHref} backLabel={client?.name || "Client"} />
      <main className={styles.main}>
        <h1 className={styles.title}>New programme</h1>
        <p className={styles.subtitle}>For {client?.name || client?.email || "this client"}</p>
        {client === undefined ? (
          <p className={styles.empty}>Loading…</p>
        ) : client === null ? (
          <p className={styles.error}>This user isn&apos;t one of your clients.</p>
        ) : (
          <ProgrammeBuilder ownerUserId={userId} backHref={clientHref} />
        )}
      </main>
    </>
  );
}
