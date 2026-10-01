"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../components/AuthProvider";
import { api } from "../../../../lib/apiClient";
import AppHeader from "../../../../components/AppHeader";
import ProgrammeBuilder from "../../../../components/ProgrammeBuilder";
import styles from "../../builder.module.css";

// A user editing a programme they built themselves. (Ones their PT built
// are edited from trainer mode.)
export default function EditOwnProgrammePage() {
  const { programId } = useParams();
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const [program, setProgram] = useState(null);
  const [error, setError] = useState("");
  const programHref = `/programs/${programId}`;

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { program } = await api.get(`/api/programs/${programId}`);
        if (program.ownerUserId !== user.userId || program.createdBy !== user.userId) {
          throw new Error("Only programmes you built yourself can be edited here.");
        }
        setProgram(program);
      } catch (err) {
        setError(err.message || "Could not load the programme.");
      }
    })();
  }, [programId, user]);

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref={programHref} backLabel={program?.name || "Programme"} />
      <main className={styles.main}>
        <h1 className={styles.title}>Edit programme</h1>
        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !program ? (
          <p className={styles.empty}>Loading programme…</p>
        ) : (
          // Deleting heads home, since the programme page won't exist any more.
          <ProgrammeBuilder selfBuilt ownerUserId={user.userId} program={program} backHref={programHref} deletedHref="/" />
        )}
      </main>
    </>
  );
}
