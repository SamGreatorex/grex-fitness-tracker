"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/apiClient";
import AppHeader from "../../components/AppHeader";
import Avatar from "../../components/Avatar";
import styles from "./page.module.css";

function matches(user, q) {
  return !q || (user.name || "").toLowerCase().includes(q) || (user.email || "").toLowerCase().includes(q);
}

// Trainer mode home: your clients (open one to manage their programmes),
// and users with no PT yet, who you can take on as clients. Users who
// belong to another PT never appear here.
export default function TrainerHome() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [busyUserId, setBusyUserId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.get("/api/trainer/clients"));
    } catch (err) {
      setError(err.message || "Could not load clients.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const takeOn = async (u) => {
    setBusyUserId(u.userId);
    setError("");
    try {
      await api.post(`/api/trainer/clients/${u.userId}`);
    } catch (err) {
      // 409: another PT got there first — the reload below drops them from the list.
      setError(err.message || `Could not add ${u.name || u.email}.`);
    } finally {
      await load();
      setBusyUserId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const clients = useMemo(() => data?.clients.filter((u) => matches(u, q)), [data, q]);
  const available = useMemo(() => data?.available.filter((u) => matches(u, q)), [data, q]);

  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>Trainer</h1>
        <p className={styles.subtitle}>Manage your clients and build their programmes.</p>

        <input
          className={styles.search}
          type="search"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            My clients{data ? ` (${data.clients.length})` : ""}
          </h2>
        </div>
        {!clients ? (
          <p className={styles.empty}>Loading…</p>
        ) : clients.length === 0 ? (
          <p className={styles.empty}>
            {data.clients.length === 0 ? "No clients yet — take someone on from the list below." : "No clients match."}
          </p>
        ) : (
          <ul className={styles.list}>
            {clients.map((c) => (
              <li key={c.userId}>
                <Link href={`/trainer/clients/${c.userId}`} className={styles.row}>
                  <Avatar src={c.avatarUrl} name={c.name} email={c.email} size={44} />
                  <span className={styles.info}>
                    <span className={styles.name}>{c.name || "No name yet"}</span>
                    <span className={styles.email}>{c.email}</span>
                  </span>
                  <span className={styles.chevron} aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className={`${styles.sectionHeader} ${styles.sectionSpaced}`}>
          <h2 className={styles.sectionTitle}>
            Available{data ? ` (${data.available.length})` : ""}
          </h2>
        </div>
        <p className={styles.sectionHint}>Users without a PT. Take someone on to start building their programmes.</p>
        {!available ? (
          <p className={styles.empty}>Loading…</p>
        ) : available.length === 0 ? (
          <p className={styles.empty}>{data.available.length === 0 ? "Everyone has a PT right now." : "No users match."}</p>
        ) : (
          <ul className={styles.list}>
            {available.map((u) => (
              <li key={u.userId} className={styles.row}>
                <Avatar src={u.avatarUrl} name={u.name} email={u.email} size={44} />
                <span className={styles.info}>
                  <span className={styles.name}>{u.name || "No name yet"}</span>
                  <span className={styles.email}>{u.email}</span>
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busyUserId === u.userId}
                  onClick={() => takeOn(u)}
                >
                  {busyUserId === u.userId ? "Adding…" : "Take on"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
