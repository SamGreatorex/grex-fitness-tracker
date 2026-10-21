import { NextResponse } from "next/server";
import { getRequestUser } from "../../../lib/users";
import { listProgramsForOwner } from "../../../lib/programs";
import { applyBillingAction, programmeAllowance } from "../../../lib/subscriptions";
import { PLANS, PROGRAMME_PACK, TRIAL_DAYS, accessFor } from "../../../lib/billing";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

async function summary(user) {
  const programs = await listProgramsForOwner(user.userId);
  return {
    access: accessFor(user),
    subscription: user.subscription ?? null,
    trialUsed: !!user.trialUsedAt,
    programmes: programmeAllowance(user, programs),
    extraProgrammeSlots: user.extraProgrammeSlots ?? 0,
    // Newest first.
    payments: [...(user.payments ?? [])].reverse().slice(0, 24),
    plans: PLANS,
    pack: PROGRAMME_PACK,
    trialDays: TRIAL_DAYS,
  };
}

// The caller's plan, what it allows, programmes used, and payment history.
export const GET = withLogging("GET /api/billing", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await summary(user));
});

// { action, ...details } — see applyBillingAction. Returns the updated
// billing summary plus `user` (the profile, for the app's auth state) and
// a `message` to show.
export const POST = withLogging("POST /api/billing", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, ...details } = await request.json();
  const result = await applyBillingAction(user, action, details);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ...(await summary(result.user)), user: result.user, message: result.message });
});
