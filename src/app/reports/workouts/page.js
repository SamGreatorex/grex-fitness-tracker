import { Suspense } from "react";
import WorkoutsReport from "./WorkoutsReport";

export default function WorkoutsReportPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutsReport />
    </Suspense>
  );
}
