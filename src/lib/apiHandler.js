import { NextResponse } from "next/server";

// Wraps a Route Handler so any error it throws is logged with the route
// name attached (visible in CloudWatch) and turned into a JSON 500 that
// also carries the route name and the error's own message (visible in the
// browser's Network tab) — without this, an uncaught error only shows up
// as a generic, unattributed 500 with no indication of where it happened.
export function withLogging(routeLabel, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`[API ERROR] ${routeLabel}:`, err);
      return NextResponse.json(
        { error: err.message || "Internal server error", route: routeLabel, name: err.name },
        { status: 500 }
      );
    }
  };
}
