import { Suspense } from "react";
import SubscribeClient from "./SubscribeClient";

// Reads ?plan= and ?next= (useSearchParams), which needs a Suspense boundary.
export default function SubscribePage() {
  return (
    <Suspense fallback={null}>
      <SubscribeClient />
    </Suspense>
  );
}
