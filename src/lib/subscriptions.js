import { NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";
import {
  PLANS,
  PLAN_KEYS,
  PROGRAMME_PACK,
  SUBSCRIPTION_STATUS,
  TRIAL_DAYS,
  accessFor,
  formatPrice,
  isOwnBuild,
  isStaff,
} from "./billing";
import { chargeCard, cleanPaymentMethod } from "./payments";

// Subscriptions live on the user's row in the users table:
//   subscription: { plan, status, startedAt, trialEndsAt?, currentPeriodStart?,
//                   currentPeriodEnd?, cancelAtPeriodEnd?, pendingPlan?,
//                   paymentMethod?, endedAt?, failedAt? }
//   trialUsedAt          — the free trial can only be taken once
//   extraProgrammeSlots  — bought in packs of 5 (Basic)
//   payments             — every (simulated) charge, newest last
//   billingVersion       — bumped on every billing write, so two requests
//                          can't both renew (and charge) the same month
//
// There's no scheduler: subscriptions are rolled forward lazily, whenever
// the user next makes a request (getRequestUser calls refreshSubscription).

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CATCH_UP_RENEWALS = 24;

// `iso` plus `n` calendar months, kept on the same day of the month where
// possible (31 Jan + 1 month → 28/29 Feb).
export function addMonths(iso, n) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
}

// Writes billing changes for `user` — only if nobody else has since
// (billingVersion). `changes`: { subscription?, payments? (to append),
// extraProgrammeSlots?, trialUsedAt?, releaseTrainer? }. Returns the
// updated row, or null if another write won the race.
async function saveBilling(user, changes) {
  const names = { "#v": "billingVersion", "#u": "updatedAt" };
  const values = { ":next": (user.billingVersion ?? 0) + 1, ":now": new Date().toISOString() };
  const sets = ["#v = :next", "#u = :now"];
  for (const key of ["subscription", "extraProgrammeSlots", "trialUsedAt"]) {
    if (changes[key] === undefined) continue;
    names[`#${key}`] = key;
    values[`:${key}`] = changes[key];
    sets.push(`#${key} = :${key}`);
  }
  if (changes.payments?.length) {
    names["#payments"] = "payments";
    values[":payments"] = changes.payments;
    values[":empty"] = [];
    sets.push("#payments = list_append(if_not_exists(#payments, :empty), :payments)");
  }
  const remove = changes.releaseTrainer ? " REMOVE ptUserId, ptAssignedAt" : "";
  if (user.billingVersion != null) values[":prev"] = user.billingVersion;

  try {
    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: TABLES.users,
        Key: { userId: user.userId },
        UpdateExpression: `SET ${sets.join(", ")}${remove}`,
        ConditionExpression: user.billingVersion != null ? "#v = :prev" : "attribute_not_exists(#v)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );
    return Attributes;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return null;
    throw err;
  }
}

async function reload(userId) {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId }, ConsistentRead: true }));
  return Item;
}

// A client who's lost Pro (or never had it) loses their trainer link too.
function shouldReleaseTrainer(user) {
  return !!user.ptUserId && !!user.subscription && !accessFor(user).canUseTrainer;
}

// Rolls the subscription forward to now: ends a finished trial; at the end
// of a paid month either renews it (charging the saved card — and switching
// to a scheduled downgrade first) or ends it if it was cancelled; a failed
// renewal leaves it past due (no access until the card is updated).
// Returns the (possibly updated) user row.
export async function refreshSubscription(user, now = Date.now()) {
  if (!user || isStaff(user) || !user.subscription) return user;

  for (let attempt = 0; attempt < 3; attempt++) {
    const sub = { ...user.subscription };
    const payments = [];
    let changed = false;

    if (sub.status === SUBSCRIPTION_STATUS.TRIALING && new Date(sub.trialEndsAt).getTime() <= now) {
      Object.assign(sub, { status: SUBSCRIPTION_STATUS.EXPIRED, endedAt: sub.trialEndsAt });
      changed = true;
    }

    for (let i = 0; i < MAX_CATCH_UP_RENEWALS; i++) {
      if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE || new Date(sub.currentPeriodEnd).getTime() > now) break;
      changed = true;
      if (sub.cancelAtPeriodEnd) {
        Object.assign(sub, { status: SUBSCRIPTION_STATUS.EXPIRED, endedAt: sub.currentPeriodEnd, cancelAtPeriodEnd: false });
        break;
      }
      if (sub.pendingPlan) {
        sub.plan = sub.pendingPlan;
        delete sub.pendingPlan;
      }
      const plan = PLANS[sub.plan];
      const payment = chargeCard({
        paymentMethod: sub.paymentMethod,
        amountPence: plan.pricePence,
        description: `${plan.name} plan — monthly renewal`,
        now,
      });
      payments.push(payment);
      if (payment.status !== "succeeded") {
        Object.assign(sub, { status: SUBSCRIPTION_STATUS.PAST_DUE, failedAt: payment.at });
        break;
      }
      sub.currentPeriodStart = sub.currentPeriodEnd;
      sub.currentPeriodEnd = addMonths(sub.currentPeriodEnd, 1);
    }

    const next = { ...user, subscription: sub };
    const releaseTrainer = shouldReleaseTrainer(next);
    if (!changed && !releaseTrainer) return user;

    const saved = await saveBilling(user, { subscription: sub, payments, releaseTrainer });
    if (saved) return saved;
    user = await reload(user.userId); // someone else updated it first — start again from theirs
  }
  return user;
}

// For routes that need an active plan (or a staff role). Returns a 402
// response to send back, or null if they're fine.
export function requireAccess(user) {
  if (accessFor(user).hasAccess) return null;
  return NextResponse.json(
    { error: "Your plan has ended — choose a plan to keep using the app.", code: "subscription_required" },
    { status: 402 }
  );
}

// How many programmes the user may still build themselves: { limit, used }
// (limit null = unlimited). `programs` is their programme list.
export function programmeAllowance(user, programs) {
  const { programmeLimit } = accessFor(user);
  return { limit: programmeLimit, used: programs.filter((p) => isOwnBuild(p, user.userId)).length };
}

// ---- Actions from the subscribe / billing pages ----

const fail = (status, error) => ({ status, error });

// Applies a billing action for `user` and saves it. Returns { user } (the
// updated row) or { status, error }. Actions:
//   start_trial
//   subscribe       { plan: "basic" | "pro", paymentMethod? } — new, renew,
//                   upgrade (immediate, full month), downgrade (Pro → Basic,
//                   at the end of the paid month) or undo a cancellation
//   cancel          — paid plan ends at the end of the paid month
//   resume          — undo cancel / a scheduled downgrade
//   update_card     { paymentMethod } — retries a failed renewal straight away
//   buy_pack        { paymentMethod? } — 5 more programmes (Basic)
export async function applyBillingAction(user, action, body = {}, now = Date.now()) {
  if (isStaff(user)) return fail(400, "Trainer and admin accounts don't need a plan.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = planAction(user, action, body, now);
    if (result.error) {
      // A declined card is still recorded in their payment history.
      if (result.changes) await saveBilling(user, result.changes);
      return { status: result.status, error: result.error };
    }
    const saved = await saveBilling(user, result.changes);
    if (saved) return { user: saved, message: result.message };
    user = await refreshSubscription(await reload(user.userId), now);
  }
  return fail(409, "Your account was just updated — please try again.");
}

// Works out what an action changes, without saving. { changes, message } or
// { status, error }.
function planAction(user, action, body, now) {
  const nowIso = new Date(now).toISOString();
  const sub = user.subscription ? { ...user.subscription } : null;
  const access = accessFor(user, now);
  const live = access.hasAccess;
  const card = cleanPaymentMethod(body.paymentMethod) ?? sub?.paymentMethod ?? null;

  // Charges `pence`; on success returns the payment, on failure an error
  // result that still records the failed attempt.
  const take = (pence, description) => {
    const payment = chargeCard({ paymentMethod: card, amountPence: pence, description, now });
    return payment.status === "succeeded"
      ? { payment }
      : { failed: { status: 402, error: payment.failureMessage, changes: { payments: [payment] } } };
  };

  // A fresh paid month starting now.
  const startPaid = (planKey) => ({
    plan: planKey,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    startedAt: nowIso,
    currentPeriodStart: nowIso,
    currentPeriodEnd: addMonths(nowIso, 1),
    cancelAtPeriodEnd: false,
    paymentMethod: card,
  });

  const withTrainerCheck = (changes) => ({
    ...changes,
    releaseTrainer: shouldReleaseTrainer({ ...user, ...changes, subscription: changes.subscription ?? user.subscription }),
  });

  switch (action) {
    case "start_trial": {
      if (live) return fail(409, "You already have a plan.");
      if (user.trialUsedAt) return fail(409, "You've already had your free trial — choose a monthly plan to continue.");
      return {
        changes: withTrainerCheck({
          trialUsedAt: nowIso,
          subscription: {
            plan: PLAN_KEYS.TRIAL,
            status: SUBSCRIPTION_STATUS.TRIALING,
            startedAt: nowIso,
            trialEndsAt: new Date(now + TRIAL_DAYS * DAY_MS).toISOString(),
          },
        }),
        message: `Your ${TRIAL_DAYS}-day free trial has started.`,
      };
    }

    case "subscribe": {
      const target = body.plan;
      if (target !== PLAN_KEYS.BASIC && target !== PLAN_KEYS.PRO) return fail(400, "Choose the Basic or Pro plan.");
      const paidAndLive = live && sub.status === SUBSCRIPTION_STATUS.ACTIVE;

      if (paidAndLive && sub.plan === target) {
        if (sub.cancelAtPeriodEnd || sub.pendingPlan) {
          delete sub.pendingPlan;
          return { changes: { subscription: { ...sub, cancelAtPeriodEnd: false } }, message: `You're staying on ${PLANS[target].name}.` };
        }
        return fail(409, `You're already on ${PLANS[target].name}.`);
      }
      // Pro → Basic: keep Pro until the paid month ends, then switch.
      if (paidAndLive && sub.plan === PLAN_KEYS.PRO && target === PLAN_KEYS.BASIC) {
        return {
          changes: { subscription: { ...sub, pendingPlan: PLAN_KEYS.BASIC, cancelAtPeriodEnd: false } },
          message: `You'll move to Basic on ${new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB")} — Pro stays until then.`,
        };
      }
      // New, after a trial, after it ended, or upgrading: charge now, new month.
      if (!card) return fail(400, "Add a card to subscribe.");
      const plan = PLANS[target];
      const { payment, failed } = take(plan.pricePence, `${plan.name} plan — first month`);
      if (failed) return failed;
      return {
        changes: withTrainerCheck({ subscription: startPaid(target), payments: [payment] }),
        message: `You're on ${plan.name} — ${formatPrice(plan.pricePence)} a month.`,
      };
    }

    case "cancel": {
      if (!live || sub.status !== SUBSCRIPTION_STATUS.ACTIVE) return fail(400, "There's no paid plan to cancel.");
      delete sub.pendingPlan;
      return {
        changes: { subscription: { ...sub, cancelAtPeriodEnd: true } },
        message: `Cancelled — you keep access until ${new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB")}.`,
      };
    }

    case "resume": {
      if (!live || sub.status !== SUBSCRIPTION_STATUS.ACTIVE) return fail(400, "There's nothing to resume.");
      delete sub.pendingPlan;
      return { changes: { subscription: { ...sub, cancelAtPeriodEnd: false } }, message: "Your plan will carry on renewing." };
    }

    case "update_card": {
      const newCard = cleanPaymentMethod(body.paymentMethod);
      if (!newCard) return fail(400, "Enter a valid card.");
      if (!sub) return fail(400, "Choose a plan first.");
      // A failed renewal is retried on the new card straight away.
      if (sub.status === SUBSCRIPTION_STATUS.PAST_DUE) {
        const plan = PLANS[sub.plan];
        const payment = chargeCard({ paymentMethod: newCard, amountPence: plan.pricePence, description: `${plan.name} plan — renewal`, now });
        if (payment.status !== "succeeded") return { status: 402, error: payment.failureMessage, changes: { payments: [payment] } };
        return {
          changes: withTrainerCheck({ subscription: { ...startPaid(sub.plan), startedAt: sub.startedAt, paymentMethod: newCard }, payments: [payment] }),
          message: "Card updated and your plan is active again.",
        };
      }
      return { changes: { subscription: { ...sub, paymentMethod: newCard } }, message: "Card updated." };
    }

    case "buy_pack": {
      if (!access.canBuyPack) return fail(400, "Extra programmes are available on the Basic plan.");
      const { payment, failed } = take(PROGRAMME_PACK.pricePence, PROGRAMME_PACK.name);
      if (failed) return failed;
      return {
        changes: {
          extraProgrammeSlots: (user.extraProgrammeSlots ?? 0) + PROGRAMME_PACK.programmes,
          payments: [payment],
          // Remember the card used, for next time.
          ...(card && sub && card !== sub.paymentMethod && { subscription: { ...sub, paymentMethod: card } }),
        },
        message: `${PROGRAMME_PACK.programmes} more programmes added.`,
      };
    }

    default:
      return fail(400, "Unknown action.");
  }
}
