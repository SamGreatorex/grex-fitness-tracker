// Shared by the client and the API routes — no server-only imports here.
//
// Plans and what each one allows. Payments are simulated for now (see
// src/lib/payments.js); Stripe will replace that later, so prices live here
// in pence and plan keys are what a Stripe price would map to.

import { ROLES } from "./profile";

export const CURRENCY = "GBP";

// Free trial length — set NEXT_PUBLIC_TRIAL_DAYS to change it (NEXT_PUBLIC_
// so Amplify passes it to the build; see amplify.yml).
export const TRIAL_DAYS = (() => {
  const n = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS);
  return Number.isInteger(n) && n > 0 && n <= 365 ? n : 12;
})();

export const PLAN_KEYS = { TRIAL: "trial", BASIC: "basic", PRO: "pro" };

export const PLANS = {
  [PLAN_KEYS.TRIAL]: {
    key: PLAN_KEYS.TRIAL,
    name: "Free trial",
    pricePence: 0,
    interval: null,
    programmeLimit: 5,
    trainer: false,
    features: [`Full access for ${TRIAL_DAYS} days`, "Build up to 5 programmes", "No card needed"],
  },
  [PLAN_KEYS.BASIC]: {
    key: PLAN_KEYS.BASIC,
    name: "Basic",
    pricePence: 299,
    interval: "month",
    programmeLimit: 5,
    trainer: false,
    features: ["Full access to the app", "Build up to 5 programmes", "Add 5 more programmes any time for £20"],
  },
  [PLAN_KEYS.PRO]: {
    key: PLAN_KEYS.PRO,
    name: "Pro",
    pricePence: 1099,
    interval: "month",
    programmeLimit: null, // unlimited
    trainer: true,
    features: ["Full access to the app", "Unlimited programmes", "Your own personal trainer", "Chat with your trainer"],
  },
};

// One-off top-up for Basic: 5 more programmes.
export const PROGRAMME_PACK = { pricePence: 2000, programmes: 5, name: "5 extra programmes" };

export const SUBSCRIPTION_STATUS = {
  TRIALING: "trialing",
  ACTIVE: "active",
  PAST_DUE: "past_due", // a renewal payment failed — update the card to continue
  EXPIRED: "expired", // trial over, or cancelled and the paid month ran out
};

export function formatPrice(pence) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: CURRENCY }).format(pence / 100);
}

// PTs and admins run the service — billing doesn't apply to them.
export function isStaff(user) {
  return user?.role === ROLES.PT || user?.role === ROLES.ADMIN;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// What `user` (a users-table row) may do right now:
//   hasAccess      — may use the app (otherwise: choose or renew a plan)
//   needsPlan      — has never chosen one
//   plan / status  — their subscription's plan key and status
//   programmeLimit — how many programmes they may build themselves (null = unlimited)
//   canUseTrainer  — may have a PT and chat with them (Pro)
//   canBuyPack     — may buy the 5-programme top-up (Basic)
//   trialDaysLeft, endsAt — for display
// The server also rolls subscriptions forward (renewals, expiry) before
// this is checked — see refreshSubscription in src/lib/subscriptions.js.
export function accessFor(user, now = Date.now()) {
  if (isStaff(user)) {
    return { staff: true, hasAccess: true, needsPlan: false, plan: null, status: null, programmeLimit: null, canUseTrainer: true, canBuyPack: false };
  }
  const sub = user?.subscription;
  if (!sub) {
    return { staff: false, hasAccess: false, needsPlan: true, plan: null, status: null, programmeLimit: 0, canUseTrainer: false, canBuyPack: false };
  }
  const plan = PLANS[sub.plan] ?? PLANS[PLAN_KEYS.BASIC];
  const endsAt = sub.status === SUBSCRIPTION_STATUS.TRIALING ? sub.trialEndsAt : sub.currentPeriodEnd;
  const live =
    (sub.status === SUBSCRIPTION_STATUS.TRIALING || sub.status === SUBSCRIPTION_STATUS.ACTIVE) &&
    !!endsAt &&
    new Date(endsAt).getTime() > now;
  const extra = plan.key === PLAN_KEYS.BASIC ? user.extraProgrammeSlots ?? 0 : 0;
  return {
    staff: false,
    hasAccess: live,
    needsPlan: false,
    plan: plan.key,
    status: sub.status,
    programmeLimit: plan.programmeLimit == null ? null : plan.programmeLimit + extra,
    canUseTrainer: live && plan.trainer,
    canBuyPack: live && plan.key === PLAN_KEYS.BASIC,
    endsAt: endsAt ?? null,
    trialDaysLeft:
      sub.status === SUBSCRIPTION_STATUS.TRIALING && endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS)) : null,
  };
}

// Programmes a user built for themselves — the ones their plan's limit
// counts (programmes a trainer builds for them don't).
export function isOwnBuild(program, userId) {
  return !program.isTemplate && program.ownerUserId === userId && program.createdBy === userId;
}
