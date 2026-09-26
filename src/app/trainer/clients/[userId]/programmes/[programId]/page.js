"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../../../lib/apiClient";
import AppHeader from "../../../../../../components/AppHeader";
import ProgrammeBuilder from "../../../../../../components/ProgrammeBuilder";
import { useClient } from "../../../../useClient";
import styles from "../../../../page.module.css";

export default function EditProgrammePage() {
  const { userId, programId } = useParams();
  const { client } = useClient(userId);
  const [program, setProgram] = useState(null);
  const [error, setError] = useState("");
  const clientHref = `/trainer/clients/${userId}`;

  useEffect(() => {
    (async () => {
      try {
        const { program } = await api.get(`/api/programs/${programId}`);
        if (program.ownerUserId !== userId) throw new Error("This programme doesn't belong to this client.");
        setProgram(program);
      } catch (err) {
        setError(err.message || "Could not load the programme.");
      }
    })();
  }, [programId, userId]);

  return (
    <>
      <AppHeader backHref={clientHref} backLabel={client?.name || "Client"} />
      <main className={styles.main}>
        <h1 className={styles.title}>Edit programme</h1>
        <p className={styles.subtitle}>For {client?.name || client?.email || "this client"}</p>
        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !program ? (
          <p className={styles.empty}>Loading programme…</p>
        ) : (
          <ProgrammeBuilder ownerUserId={userId} program={program} backHref={clientHref} />
        )}
      </main>
    </>
  );
}
