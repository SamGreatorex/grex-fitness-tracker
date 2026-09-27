"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { api } from "../../lib/apiClient";
import AppHeader from "../../components/AppHeader";
import BodyDiagram from "../../components/BodyDiagram";
import MeasurementStepper from "./MeasurementStepper";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { MEASUREMENTS, MEASUREMENT_LABELS, todayLocal } from "../../lib/measurements";
import {
  WEIGHT_UNITS,
  cmToDisplayLength,
  displayLengthToCm,
  formatLength,
  formatWeight,
  kgToStLb,
  lengthUnitFor,
  stLbToKg,
} from "../../lib/units";
import styles from "./page.module.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
// Dates are plain YYYY-MM-DD; parse at local noon so no timezone can shift the day.
const formatDate = (date) => dateFormat.format(new Date(`${date}T12:00:00`));

function emptyForm() {
  return { weightKg: "", weightSt: "", weightLb: "", lengths: {} };
}

// Stored (metric) entry → form values in the user's display units.
function entryToForm(entry, lengthUnit) {
  if (!entry) return emptyForm();
  const { st, lb } = kgToStLb(entry.weightKg);
  const lengths = {};
  for (const [key, cm] of Object.entries(entry.measurements ?? {})) lengths[key] = cmToDisplayLength(cm, lengthUnit);
  return { weightKg: entry.weightKg ?? "", weightSt: st, weightLb: lb, lengths };
}

export default function MeasurementsPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, profile, setProfile } = useAuth();
  const weightUnit = profile?.weightUnit;
  // Units come from the profile (set in Profile settings). Values are
  // stored metric, so past entries always show in the current choice.
  const lengthUnit = lengthUnitFor(profile);
  // Only "has the profile loaded" matters for the initial load — not every
  // profile change (saving a weigh-in updates the profile's weight).
  const profileReady = !!profile;

  const [entries, setEntries] = useState(null);
  const [date, setDate] = useState(todayLocal);
  const [form, setForm] = useState(emptyForm);
  const [active, setActive] = useState("waist");
  const [stepIndex, setStepIndex] = useState(0);
  // Phones and small tablets (≤768px) get the one-at-a-time stepper with
  // the diagram stacked above the input; wider screens get the full grid.
  const isPhone = useMediaQuery("(max-width: 768px)");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const entriesByDate = useMemo(() => Object.fromEntries((entries ?? []).map((e) => [e.date, e])), [entries]);

  const loadDate = useCallback(
    (nextDate, byDate) => {
      setDate(nextDate);
      setForm(entryToForm(byDate[nextDate], lengthUnit));
      setStepIndex(0);
      setError("");
      setSavedMessage("");
    },
    [lengthUnit]
  );

  useEffect(() => {
    if (!user || !profileReady) return;
    (async () => {
      try {
        const { entries } = await api.get("/api/measurements");
        setEntries(entries);
        // Pre-fill today's entry if one was already logged.
        const byDate = Object.fromEntries(entries.map((e) => [e.date, e]));
        loadDate(todayLocal(), byDate);
      } catch (err) {
        setError(err.message || "Could not load your measurements.");
      }
    })();
  }, [user, profileReady, loadDate]);

  const setLength = (key, value) => setForm((f) => ({ ...f, lengths: { ...f.lengths, [key]: value } }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      const weightKg = weightUnit === WEIGHT_UNITS.ST_LB ? stLbToKg(form.weightSt, form.weightLb) : form.weightKg;
      const measurements = {};
      for (const { key } of MEASUREMENTS) measurements[key] = displayLengthToCm(form.lengths[key], lengthUnit);

      const { entry, profile: updatedProfile } = await api.put(`/api/measurements/${date}`, {
        weightKg: weightKg === "" ? null : weightKg,
        measurements,
        createdAt: entriesByDate[date]?.createdAt,
      });
      setEntries((list) => [...list.filter((x) => x.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date)));
      if (updatedProfile) setProfile(updatedProfile);
      setSavedMessage(`Saved for ${formatDate(date)}.`);
    } catch (err) {
      setError(err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryDate) => {
    if (!window.confirm(`Delete your measurements for ${formatDate(entryDate)}?`)) return;
    setError("");
    try {
      const { profile: updatedProfile } = await api.delete(`/api/measurements/${entryDate}`);
      const remaining = entries.filter((x) => x.date !== entryDate);
      setEntries(remaining);
      if (updatedProfile) setProfile(updatedProfile);
      if (entryDate === date) loadDate(date, Object.fromEntries(remaining.map((x) => [x.date, x])));
    } catch (err) {
      setError(err.message || "Could not delete.");
    }
  };

  const history = useMemo(() => [...(entries ?? [])].reverse(), [entries]);

  // Most recent earlier reading of each value, for "Last time" hints.
  const lastValues = useMemo(() => {
    const out = { weightKg: null, lengths: {} };
    for (const e of entries ?? []) {
      if (e.date >= date) break; // entries are oldest-first
      if (e.weightKg != null) out.weightKg = e.weightKg;
      Object.assign(out.lengths, e.measurements);
    }
    return out;
  }, [entries, date]);
  const lastText = (key) =>
    key === "weight"
      ? lastValues.weightKg != null && formatWeight(lastValues.weightKg, weightUnit)
      : lastValues.lengths[key] != null && formatLength(lastValues.lengths[key], lengthUnit);
  const lastPlaceholder = (key) =>
    lastValues.lengths[key] != null ? String(cmToDisplayLength(lastValues.lengths[key], lengthUnit)) : "";
  const activeHint = MEASUREMENTS.find((m) => m.key === active)?.hint;
  const isEditing = !!entriesByDate[date];

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Body measurements</h1>
        {/* Skipped on phones to keep the stepper above the keyboard. */}
        {!isPhone && (
          <p className={styles.subtitle}>
            Log your weight and tape measurements to track changes over time. See the trends in{" "}
            <Link href="/reports" className={styles.link}>
              Progress reports
            </Link>
            .
          </p>
        )}

        {isPhone ? (
          <form className={styles.phoneCard} onSubmit={handleSave}>
            <div className={styles.phoneDateRow}>
              <label className={styles.phoneDateLabel} htmlFor="entry-date">
                Date
              </label>
              <input
                id="entry-date"
                className={`${styles.input} ${styles.phoneDate}`}
                type="date"
                required
                max={todayLocal()}
                value={date}
                onChange={(e) => e.target.value && loadDate(e.target.value, entriesByDate)}
              />
              {isEditing && <span className={styles.editingBadge}>Saved</span>}
            </div>

            <MeasurementStepper
              stepIndex={stepIndex}
              onStepChange={setStepIndex}
              form={form}
              setForm={setForm}
              setLength={setLength}
              weightUnit={weightUnit}
              lengthUnit={lengthUnit}
              lastText={lastText}
              saving={saving}
              saveLabel={isEditing ? "Update entry" : "Save entry"}
              canSave={!!entries}
            />

            {error && <div className={styles.error}>{error}</div>}
            {savedMessage && !error && <div className={styles.success}>{savedMessage}</div>}
          </form>
        ) : (
          <div className={styles.layout}>
            <aside className={styles.guide}>
              <BodyDiagram active={active} filled={form.lengths} onSelect={(key) => document.getElementById(`m-${key}`)?.focus()} />
              {activeHint && (
                <p className={styles.hint}>
                  <strong>{MEASUREMENT_LABELS[active]}:</strong> {activeHint}
                </p>
              )}
            </aside>

            <form className={styles.card} onSubmit={handleSave}>
              <div className={styles.topRow}>
                <label className={styles.field}>
                  <span className={styles.label}>Date</span>
                  <input
                    className={styles.input}
                    type="date"
                    required
                    max={todayLocal()}
                    value={date}
                    onChange={(e) => e.target.value && loadDate(e.target.value, entriesByDate)}
                  />
                </label>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="weight">
                    Weight
                  </label>
                  {weightUnit === WEIGHT_UNITS.ST_LB ? (
                    <div className={styles.pair}>
                      <UnitInput
                        id="weight"
                        unit="st"
                        step="1"
                        value={form.weightSt}
                        onChange={(v) => setForm((f) => ({ ...f, weightSt: v }))}
                      />
                      <UnitInput unit="lb" value={form.weightLb} onChange={(v) => setForm((f) => ({ ...f, weightLb: v }))} />
                    </div>
                  ) : (
                    <UnitInput id="weight" unit="kg" value={form.weightKg} onChange={(v) => setForm((f) => ({ ...f, weightKg: v }))} />
                  )}
                </div>
              </div>

              <p className={styles.sectionLabel}>Measurements ({lengthUnit}) — fill in whichever you track</p>
              <div className={styles.grid}>
                {MEASUREMENTS.map(({ key, label }) => (
                  <label key={key} className={`${styles.field} ${active === key ? styles.fieldActive : ""}`}>
                    <span className={styles.label}>{label}</span>
                    <UnitInput
                      id={`m-${key}`}
                      unit={lengthUnit}
                      value={form.lengths[key] ?? ""}
                      placeholder={lastPlaceholder(key)}
                      onChange={(v) => setLength(key, v)}
                      onFocus={() => setActive(key)}
                    />
                  </label>
                ))}
              </div>

              {error && <div className={styles.error}>{error}</div>}
              {savedMessage && !error && <div className={styles.success}>{savedMessage}</div>}

              <button type="submit" className={styles.button} disabled={saving || !entries}>
                {saving ? "Saving…" : isEditing ? "Update entry" : "Save entry"}
              </button>
              <p className={styles.unitNote}>
                Units follow your{" "}
                <Link href="/settings" className={styles.link}>
                  profile settings
                </Link>
                .
              </p>
            </form>
          </div>
        )}

        <details className={styles.historySection} open={!isPhone}>
          <summary className={styles.sectionTitle}>
            History{entries ? ` (${entries.length})` : ""}
          </summary>
          {!entries ? (
            <p className={styles.empty}>Loading…</p>
          ) : history.length === 0 ? (
            <p className={styles.empty}>No entries yet — your first one will appear here.</p>
          ) : (
            <ul className={styles.history}>
              {history.map((entry) => {
                const logged = MEASUREMENTS.filter(({ key }) => entry.measurements?.[key] != null);
                return (
                  <li key={entry.date} className={`${styles.historyRow} ${entry.date === date ? styles.historyRowActive : ""}`}>
                    <button type="button" className={styles.historyMain} onClick={() => loadDate(entry.date, entriesByDate)}>
                      <span className={styles.historyDate}>{formatDate(entry.date)}</span>
                      <span className={styles.historyWeight}>{entry.weightKg != null ? formatWeight(entry.weightKg, weightUnit) : "No weight"}</span>
                      {logged.length > 0 && (
                        <span className={styles.historyMeasures}>
                          {logged.map(({ key }) => `${MEASUREMENT_LABELS[key]} ${formatLength(entry.measurements[key], lengthUnit)}`).join(" · ")}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label={`Delete entry for ${formatDate(entry.date)}`}
                      onClick={() => handleDelete(entry.date)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      </main>
    </>
  );
}

function UnitInput({ id, unit, value, onChange, onFocus, step = "0.1" }) {
  return (
    <span className={styles.unitInputWrap}>
      <input
        id={id}
        className={`${styles.input} ${styles.unitInput}`}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
      />
      <span className={styles.unitSuffix} aria-hidden="true">
        {unit}
      </span>
    </span>
  );
}
