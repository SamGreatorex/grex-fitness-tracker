import { Suspense } from "react";
import MeasurementsReport from "./MeasurementsReport";

export default function MeasurementsReportPage() {
  return (
    <Suspense fallback={null}>
      <MeasurementsReport />
    </Suspense>
  );
}
