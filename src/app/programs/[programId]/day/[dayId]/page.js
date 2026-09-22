import { Suspense } from "react";
import WorkoutSessionClient from "./WorkoutSessionClient";

export default function DayWorkoutPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutSessionClient />
    </Suspense>
  );
}
