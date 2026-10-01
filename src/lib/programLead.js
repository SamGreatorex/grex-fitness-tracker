// Who runs a programme's workouts. Safe to import on the client.
//   user    — the client runs it themselves (start, log sets, rate effort).
//   trainer — their PT runs it with them from trainer mode; the client can
//             only view it and the workouts logged against it.
// Programmes without a `ledBy` (seeded, or built before this existed) are
// user-led.
export const PROGRAM_LEADS = { USER: "user", TRAINER: "trainer" };

export function isTrainerLed(program) {
  return program?.ledBy === PROGRAM_LEADS.TRAINER;
}

// Where a programme's screens live: the client's own /programs pages, or —
// when a trainer is running it for `clientUserId` — under trainer mode.
export function programmeBasePath(programId, clientUserId) {
  return clientUserId ? `/trainer/clients/${clientUserId}/programmes/${programId}/run` : `/programs/${programId}`;
}
