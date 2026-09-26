"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import { ROLES, ROLE_LABELS } from "../../../lib/profile";
import AppHeader from "../../../components/AppHeader";
import Avatar from "../../../components/Avatar";
import styles from "./page.module.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function AdminUsersPage() {
  const { userId: myUserId } = useAuth();
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState("");

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
        setUsers((list) => list.map((u) => (u.userId === user.userId ? user : u)));
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
        (!q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q))
    );
  }, [users, search, roleFilter]);

  const counts = useMemo(() => {
    const c = {};
    for (const u of users ?? []) c[u.role] = (c[u.role] ?? 0) + 1;
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

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={styles.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {!filtered ? (
          <p className={styles.empty}>Loading users…</p>
        ) : filtered.length === 0 ? (
          <p className={styles.empty}>No users match.</p>
        ) : (
          <ul className={styles.list}>
            {filtered.map((u) => {
              const isMe = u.userId === myUserId;
              return (
                <li key={u.userId} className={styles.row}>
                  <Avatar src={u.avatarUrl} name={u.name} email={u.email} size={44} />
                  <div className={styles.info}>
                    <span className={styles.name}>
                      {u.name || "No name yet"}
                      {isMe && <span className={styles.you}>You</span>}
                    </span>
                    <span className={styles.email}>{u.email}</span>
                    <details className={styles.details}>
                      <summary>Profile</summary>
                      <dl>
                        <dt>Address</dt>
                        <dd>{u.address || "—"}</dd>
                        <dt>Height</dt>
                        <dd>{u.heightCm != null ? `${u.heightCm} cm` : "—"}</dd>
                        <dt>Weight</dt>
                        <dd>{u.weightKg != null ? `${u.weightKg} kg` : "—"}</dd>
                        <dt>Joined</dt>
                        <dd>{u.createdAt ? dateFormat.format(new Date(u.createdAt)) : "—"}</dd>
                      </dl>
                    </details>
                  </div>
                  <div className={styles.controls}>
                    <label className={styles.controlLabel}>
                      <span>Role</span>
                      <select
                        className={styles.select}
                        value={u.role}
                        disabled={isMe || savingUserId === u.userId}
                        title={isMe ? "You can't change your own role" : undefined}
                        onChange={(e) => changeRole(u, e.target.value)}
                        aria-label={`Role for ${u.name || u.email}`}
                      >
                        {Object.values(ROLES).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.controlLabel}>
                      <span>PT</span>
                      <select
                        className={styles.select}
                        value={u.ptUserId ?? ""}
                        disabled={savingUserId === u.userId}
                        onChange={(e) => changePt(u, e.target.value)}
                        aria-label={`PT for ${u.name || u.email}`}
                      >
                        <option value="">No PT</option>
                        {u.ptUserId && !trainers.some((t) => t.userId === u.ptUserId) && (
                          <option value={u.ptUserId}>{nameById[u.ptUserId] ?? "Unknown"}</option>
                        )}
                        {trainers
                          .filter((t) => t.userId !== u.userId)
                          .map((t) => (
                            <option key={t.userId} value={t.userId}>
                              {t.name || t.email}
                            </option>
                          ))}
                      </select>
                    </label>
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
