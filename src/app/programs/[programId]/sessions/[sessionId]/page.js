import { Suspense } from "react";
import SessionView from "../../../../../components/SessionView";

// SessionView reads ?edit=1 (useSearchParams), which needs a Suspense boundary.
export default function SessionViewPage() {
  return (
    <Suspense fallback={null}>
      <SessionView />
    </Suspense>
  );
}
