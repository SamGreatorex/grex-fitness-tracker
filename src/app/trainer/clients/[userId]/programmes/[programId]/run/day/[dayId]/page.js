import { Suspense } from "react";
import WorkoutSession from "../../../../../../../../../components/WorkoutSession";

export default function RunDayPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutSession />
    </Suspense>
  );
}
