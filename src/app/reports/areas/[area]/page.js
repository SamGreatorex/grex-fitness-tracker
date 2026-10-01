import { Suspense } from "react";
import AreaReport from "./AreaReport";

export default function AreaReportPage() {
  return (
    <Suspense fallback={null}>
      <AreaReport />
    </Suspense>
  );
}
