import { Suspense } from "react";
import WeightReport from "./WeightReport";

export default function WeightReportPage() {
  return (
    <Suspense fallback={null}>
      <WeightReport />
    </Suspense>
  );
}
