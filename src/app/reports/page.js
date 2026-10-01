import { Suspense } from "react";
import ReportsOverview from "./ReportsOverview";

// The chosen period lives in the URL (?period=), read with useSearchParams —
// which needs a Suspense boundary.
export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsOverview />
    </Suspense>
  );
}
