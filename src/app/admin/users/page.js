"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import { ROLES, ROLE_LABELS } from "../../../lib/profile";
import { formatHeight, formatWeight } from "../../../lib/units";
import AppHeader from "../../../components/AppHeader";
import Avatar from "../../../components/Avatar";
import Dropdown from "../../../components/Dropdown";
import { BRAND_LABELS } from "../../../components/CardForm";
import { PLANS, PLAN_KEYS, SUBSCRIPTION_STATUS, accessFor, formatPrice } from "../../../lib/billing";
import styles from "./page.module.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmt = (iso) => (iso ? dateFormat.format(new Date(iso)) : "—");

// Which plan group a user is in, for the filter and counts.
const PLAN_GROUPS = [
  { value: PLAN_KEYS.TRIAL, label: "Trial" },
  { value: PLAN_KEYS.BASIC, label: "Basic" },
  { value: PLAN_KEYS.PRO, label: "Pro" },
  { value: "ended", label: "Ended / unpaid" },
  { value: "none", label: "No plan" },
  { value: "staff", label: "Staff" },
];

function planGroup(u) {
  const a = accessFor(u);
  if (a.staff) return "staff";
  if (a.needsPlan) return "none";
  // A paid month awaiting renewal still counts as on its plan.
  if (!a.hasAccess && !(u.subscription.status === SUBSCRIPTION_STATUS.ACTIVE && !u.subscription.cancelAtPeriodEnd)) return "ended";
  return a.plan;
}

// The plan badge and one line on where it stands, e.g. "Pro" + "Renews
// 8 Nov 2026 · £10.99/month".
function planSummary(u) {
  const a = accessFor(u);
  const sub = u.subscription;
  if (a.staff) return { badge: "Staff", tone: "muted", detail: "No plan needed" };
  if (!sub) return { badge: "No plan", tone: "muted", detail: "Hasn't chosen a plan yet" };
  const plan = PLANS[sub.plan];
  if (sub.status === SUBSCRIPTION_STATUS.PAST_DUE) return { badge: plan.name, tone: "bad", detail: `Payment failed ${fmt(sub.failedAt)}` };
  // Renewals happen on the member's next visit, so a paid month that's run
  // out (and wasn't cancelled) is due to renew, not over.
  if (!a.hasAccess && sub.status === SUBSCRIPTION_STATUS.ACTIVE && !sub.cancelAtPeriodEnd) {
    return { badge: plan.name, tone: sub.plan === PLAN_KEYS.PRO ? "pro" : "basic", detail: `Renewal due since ${fmt(sub.currentPeriodEnd)} — renews on their next visit` };
  }
  if (!a.hasAccess) return { badge: plan.name, tone: "bad", detail: `Ended ${fmt(sub.endedAt ?? sub.trialEndsAt ?? sub.currentPeriodEnd)}` };
  if (sub.status === SUBSCRIPTION_STATUS.TRIALING) {
    return { badge: plan.name, tone: "trial", detail: `${a.trialDaysLeft} day${a.trialDaysLeft === 1 ? "" : "s"} left · ends ${fmt(sub.trialEndsAt)}` };
  }
  const tone = sub.plan === PLAN_KEYS.PRO ? "pro" : "basic";
  if (sub.cancelAtPeriodEnd) return { badge: plan.name, tone, detail: `Cancelled · access until ${fmt(sub.currentPeriodEnd)}` };
  if (sub.pendingPlan) return { badge: plan.name, tone, detail: `Moves to ${PLANS[sub.pendingPlan].name} on ${fmt(sub.currentPeriodEnd)}` };
  return { badge: plan.name, tone, detail: `Renews ${fmt(sub.currentPeriodEnd)} · ${formatPrice(plan.pricePence)}/month` };
}

export default function AdminUsersPage() {
  const { userId: myUserId, profile: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletingUserId, setDeletingUserId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { users } = await api.get("/api/admin/users");
      setUsers(users);
    } catch (err) {
      setError(err.message || "Could not load users.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const updateUser = async (target, changes, failMessage) => {
    setSavingUserId(target.userId);
    setError("");
    try {
      const { user, releasedClients } = await api.patch(`/api/admin/users/${target.userId}`, changes);
      if (releasedClients) {
        // Their clients were unassigned server-side — refresh everyone.
        await load();
      } else {
        // Merged, so extras from the list (programmesBuilt) are kept.
        setUsers((list) => list.map((u) => (u.userId === user.userId ? { ...u, ...user } : u)));
      }
    } catch (err) {
      setError(err.message || failMessage);
    } finally {
      setSavingUserId(null);
    }
  };

  const changeRole = async (target, role) => {
    if (role === target.role) return;
    const who = target.name || target.email;
    if (role === ROLES.ADMIN && !window.confirm(`Make ${who} an admin? They'll be able to manage every user.`)) return;
    const isTrainer = target.role === ROLES.PT || target.role === ROLES.ADMIN;
    if (
      isTrainer &&
      role === ROLES.BASIC &&
      users.some((u) => u.ptUserId === target.userId) &&
      !window.confirm(`${who} has clients. Making them Basic will unassign all of their clients. Continue?`)
    ) {
      return;
    }
    await updateUser(target, { role }, `Could not change ${who}'s role.`);
  };

  const deleteUser = async (target) => {
    const who = target.name || target.email;
    const clientCount = users.filter((u) => u.ptUserId === target.userId).length;
    const message =
      `Permanently delete ${who}?\n\n` +
      "This removes their sign-in, profile, programmes, workout history and body measurements. " +
      (clientCount ? `Their ${clientCount} client${clientCount === 1 ? "" : "s"} will be left without a trainer. ` : "") +
      "This can't be undone.";
    if (!window.confirm(message)) return;

    setDeletingUserId(target.userId);
    setError("");
    setNotice("");
    try {
      await api.delete(`/api/admin/users/${target.userId}`);
      setNotice(`${who} has been deleted.`);
      // Reload: any clients they had are now unassigned.
      await load();
    } catch (err) {
      setError(`Couldn't finish deleting ${who}: ${err.message || "unknown error"}. You can try again.`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const changePt = (target, ptUserId) =>
    updateUser(target, { ptUserId: ptUserId || null }, `Could not change ${target.name || target.email}'s PT.`);

  // Anyone who can act as a PT.
  const trainers = useMemo(
    () => (users ?? []).filter((u) => u.role === ROLES.PT || u.role === ROLES.ADMIN),
    [users]
  );
  const nameById = useMemo(() => Object.fromEntries((users ?? []).map((u) => [u.userId, u.name || u.email])), [users]);

  const filtered = useMemo(() => {
    if (!users) return null;
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!planFilter || planGroup(u) === planFilter) &&
        (!q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q))
    );
  }, [users, search, roleFilter, planFilter]);

  const counts = useMemo(() => {
    const c = {};
    for (const u of users ?? []) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [users]);

  const planCounts = useMemo(() => {
    const c = {};
    for (const u of users ?? []) c[planGroup(u)] = (c[planGroup(u)] ?? 0) + 1;
    return c;
  }, [users]);

  return (
    <>
      <AppHeader backHref="/admin" backLabel="Admin" />
      <main className={styles.main}>
        <h1 className={styles.title}>Users</h1>
        {users && (
          <p className={styles.subtitle}>
            {users.length} {users.length === 1 ? "user" : "users"} ·{" "}
            {Object.values(ROLES)
              .map((r) => `${counts[r] ?? 0} ${ROLE_LABELS[r]}`)
              .join(" · ")}
          </p>
        )}
        {users && (
          // Plan counts — tap one to show just those users.
          <div className={styles.planCounts}>
            {PLAN_GROUPS.map((g) => (
              <button
                key={g.value}
                type="button"
                className={`${styles.planCount} ${planFilter === g.value ? styles.planCountActive : ""}`}
                aria-pressed={planFilter === g.value}
                onClick={() => setPlanFilter(planFilter === g.value ? "" : g.value)}
              >
                <span className={styles.planCountNumber}>{planCounts[g.value] ?? 0}</span>
                {g.label}
              </button>
            ))}
          </div>
        )}

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Dropdown
            className={styles.select}
            value={roleFilter}
            onChange={setRoleFilter}
            aria-label="Filter by role"
            options={[{ value: "", label: "All roles" }, ...Object.values(ROLES).map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
          />
          <Dropdown
            className={styles.select}
            value={planFilter}
            onChange={setPlanFilter}
            aria-label="Filter by plan"
            options={[{ value: "", label: "All plans" }, ...PLAN_GROUPS]}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {notice && !error && <p className={styles.notice}>{notice}</p>}

        {!filtered ? (
          <p className={styles.empty}>Loading users…</p>
        ) : filtered.length === 0 ? (
          <p className={styles.empty}>No users match.</p>
        ) : (
          <ul className={styles.list}>
            {filtered.map((u) => {
              const isMe = u.userId === myUserId;
              const access = accessFor(u);
              const plan = planSummary(u);
              const sub = u.subscription;
              const card = sub?.paymentMethod;
              const payments = [...(u.payments ?? [])].reverse();
              const totalPaid = payments.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + p.amountPence, 0);
              return (
                <li key={u.userId} className={styles.row}>
                  <Avatar src={u.avatarUrl} name={u.name} email={u.email} size={44} />
                  <div className={styles.info}>
                    <span className={styles.name}>
                      {u.name || "No name yet"}
                      {isMe && <span className={styles.you}>You</span>}
                    </span>
                    <span className={styles.email}>{u.email}</span>
                    <span className={styles.planLine}>
                      <span className={`${styles.planBadge} ${styles[`tone_${plan.tone}`]}`}>{plan.badge}</span>
                      <span className={styles.planDetail}>{plan.detail}</span>
                    </span>
                    {!access.staff && (
                      <span className={styles.planDetail}>
                        Programmes built: {u.programmesBuilt ?? 0}
                        {access.programmeLimit == null ? (access.needsPlan ? "" : " · unlimited") : ` of ${access.programmeLimit}`}
                      </span>
                    )}
                    <details className={styles.details}>
                      <summary>Profile & billing</summary>
                      <dl>
                        <dt>Address</dt>
                        <dd>{u.address || "—"}</dd>
                        <dt>Height</dt>
                        <dd>{formatHeight(u.heightCm, me?.heightUnit)}</dd>
                        <dt>Weight</dt>
                        <dd>{formatWeight(u.weightKg, me?.weightUnit)}</dd>
                        <dt>Joined</dt>
                        <dd>{u.createdAt ? dateFormat.format(new Date(u.createdAt)) : "—"}</dd>
                        {!access.staff && (
                          <>
                            <dt>Plan</dt>
                            <dd>
                              {sub ? `${PLANS[sub.plan].name} · since ${fmt(sub.startedAt)}` : "None"}
                            </dd>
                            <dt>Free trial</dt>
                            <dd>{u.trialUsedAt ? `Taken ${fmt(u.trialUsedAt)}` : "Not taken"}</dd>
                            <dt>Card</dt>
                            <dd>
                              {card
                                ? `${BRAND_LABELS[card.brand] ?? "Card"} •••• ${card.last4} · exp ${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
                                : "—"}
                            </dd>
                            <dt>Extra programmes</dt>
                            <dd>{u.extraProgrammeSlots ? `${u.extraProgrammeSlots} (bought in packs)` : "—"}</dd>
                            <dt>Total paid</dt>
                            <dd>{formatPrice(totalPaid)}</dd>
                          </>
                        )}
                      </dl>
                      {!access.staff && payments.length > 0 && (
                        <ul className={styles.payments}>
                          {payments.slice(0, 6).map((p) => (
                            <li key={p.id}>
                              <span>
                                {fmt(p.at)} · {p.description}
                              </span>
                              <span className={p.status === "succeeded" ? undefined : styles.paymentFailed}>
                                {p.status === "succeeded" ? formatPrice(p.amountPence) : `Failed — ${p.failureMessage ?? "declined"}`}
                              </span>
                            </li>
                          ))}
                          {payments.length > 6 && <li className={styles.planDetail}>…and {payments.length - 6} earlier</li>}
                        </ul>
                      )}
                      {!isMe && (
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => deleteUser(u)}
                          disabled={deletingUserId === u.userId}
                        >
                          {deletingUserId === u.userId ? "Deleting…" : "Delete user"}
                        </button>
                      )}
                    </details>
                  </div>
                  <div className={styles.controls}>
                    <div className={styles.controlLabel}>
                      <span aria-hidden="true">Role</span>
                      <Dropdown
                        className={styles.select}
                        value={u.role}
                        disabled={isMe || savingUserId === u.userId}
                        title={isMe ? "You can't change your own role" : undefined}
                        onChange={(role) => changeRole(u, role)}
                        aria-label={`Role for ${u.name || u.email}`}
                        options={Object.values(ROLES).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                      />
                    </div>
                    <div className={styles.controlLabel}>
                      <span aria-hidden="true">PT</span>
                      <Dropdown
                        className={styles.select}
                        value={u.ptUserId ?? ""}
                        disabled={savingUserId === u.userId}
                        onChange={(ptUserId) => changePt(u, ptUserId)}
                        aria-label={`PT for ${u.name || u.email}`}
                        options={[
                          { value: "", label: "No PT" },
                          ...(u.ptUserId && !trainers.some((t) => t.userId === u.ptUserId)
                            ? [{ value: u.ptUserId, label: nameById[u.ptUserId] ?? "Unknown" }]
                            : []),
                          ...trainers
                            // Admins can be their own PT; nobody else can.
                            .filter((t) => t.userId !== u.userId || u.role === ROLES.ADMIN)
                            .map((t) => ({ value: t.userId, label: t.userId === u.userId ? "Themselves" : t.name || t.email })),
                        ]}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
