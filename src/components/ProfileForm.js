"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/apiClient";
import { AVATAR_TYPES, AVATAR_MAX_BYTES, PROFILE_FIELDS } from "../lib/profile";
import { HEIGHT_UNITS, WEIGHT_UNITS, cmToFtIn, ftInToCm, kgToStLb, stLbToKg } from "../lib/units";
import Avatar from "./Avatar";
import CameraCapture from "./CameraCapture";
import styles from "./ProfileForm.module.css";

// Edits the signed-in user's profile. Used both by the first-time setup
// window and the settings page. Calls onSaved(updatedProfile) on success.
export default function ProfileForm({ profile, onSaved, submitLabel = "Save" }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  // Both unit systems are kept in state; only the active one is shown and
  // submitted. Switching units converts the current values across.
  const [heightUnit, setHeightUnit] = useState(profile?.heightUnit ?? HEIGHT_UNITS.CM);
  const [heightCm, setHeightCm] = useState(profile?.heightCm ?? "");
  const [heightFtIn, setHeightFtIn] = useState(() => cmToFtIn(profile?.heightCm));
  const [weightUnit, setWeightUnit] = useState(profile?.weightUnit ?? WEIGHT_UNITS.KG);
  const [weightKg, setWeightKg] = useState(profile?.weightKg ?? "");
  const [weightStLb, setWeightStLb] = useState(() => kgToStLb(profile?.weightKg));
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef(null);
  const captureInputRef = useRef(null);

  // Free the previous preview's object URL whenever it's replaced/cleared.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const clearPickedFile = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (captureInputRef.current) captureInputRef.current.value = "";
  };

  // Shared by the file picker, the native camera input and the live camera.
  const acceptFile = (picked) => {
    setError("");
    if (!picked) return;
    if (!AVATAR_TYPES.includes(picked.type)) {
      setError("Profile picture must be a JPEG, PNG, WebP or GIF image.");
      return;
    }
    if (picked.size > AVATAR_MAX_BYTES) {
      setError("Profile picture must be 5 MB or smaller.");
      return;
    }
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  // Prefer the in-page live camera (works with laptop webcams too). Where
  // the browser can't provide one, fall back to the native camera input,
  // which on phones opens the camera app directly.
  const openCamera = () => {
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
    } else {
      captureInputRef.current?.click();
    }
  };

  const currentHeightCm = () =>
    heightUnit === HEIGHT_UNITS.CM ? heightCm : ftInToCm(heightFtIn.ft, heightFtIn.inches) ?? "";
  const currentWeightKg = () =>
    weightUnit === WEIGHT_UNITS.KG ? weightKg : stLbToKg(weightStLb.st, weightStLb.lb) ?? "";

  const switchHeightUnit = (unit) => {
    if (unit === heightUnit) return;
    if (unit === HEIGHT_UNITS.CM) setHeightCm(currentHeightCm());
    else setHeightFtIn(cmToFtIn(heightCm));
    setHeightUnit(unit);
  };

  const switchWeightUnit = (unit) => {
    if (unit === weightUnit) return;
    if (unit === WEIGHT_UNITS.KG) setWeightKg(currentWeightKg());
    else setWeightStLb(kgToStLb(weightKg));
    setWeightUnit(unit);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const submitHeightCm = currentHeightCm();
    const submitWeightKg = currentWeightKg();
    const { heightCm: hDef, weightKg: wDef } = PROFILE_FIELDS;
    if (submitHeightCm === "" || submitHeightCm < hDef.min || submitHeightCm > hDef.max) {
      setError("Please enter a valid height.");
      setSaving(false);
      return;
    }
    if (submitWeightKg === "" || submitWeightKg < wDef.min || submitWeightKg > wDef.max) {
      setError("Please enter a valid weight.");
      setSaving(false);
      return;
    }

    try {
      let avatarKey;
      if (file) {
        const { uploadUrl, key } = await api.post("/api/me/avatar-upload-url", { contentType: file.type });
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Upload to S3 failed.");
        avatarKey = key;
      }

      const { user } = await api.patch("/api/me", {
        name,
        address,
        heightCm: submitHeightCm,
        weightKg: submitWeightKg,
        heightUnit,
        weightUnit,
        ...(avatarKey ? { avatarKey } : {}),
      });
      clearPickedFile();
      setSaved(true);
      onSaved?.(user);
    } catch (err) {
      setError(err.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.avatarRow}>
        <Avatar src={previewUrl || profile?.avatarUrl} name={name} email={profile?.email} size={72} />
        <div className={styles.avatarActions}>
          <div className={styles.avatarButtons}>
            <button type="button" className={styles.buttonGhost} onClick={() => fileInputRef.current?.click()}>
              {profile?.avatarUrl || file ? "Change picture" : "Upload picture"}
            </button>
            <button type="button" className={styles.buttonGhost} onClick={openCamera}>
              Take photo
            </button>
          </div>
          <span className={styles.hint}>JPEG, PNG, WebP or GIF, up to 5 MB</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            onChange={(e) => acceptFile(e.target.files?.[0])}
            className={styles.hiddenInput}
          />
          <input
            ref={captureInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={(e) => acceptFile(e.target.files?.[0])}
            className={styles.hiddenInput}
          />
        </div>
      </div>

      {cameraOpen && <CameraCapture onCapture={acceptFile} onClose={() => setCameraOpen(false)} />}

      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          className={styles.input}
          type="text"
          autoComplete="name"
          required
          maxLength={PROFILE_FIELDS.name.maxLength}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Address</span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          autoComplete="street-address"
          required
          rows={3}
          maxLength={PROFILE_FIELDS.address.maxLength}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label} id="height-label">Height</span>
          <UnitToggle
            value={heightUnit}
            onChange={switchHeightUnit}
            options={[
              { value: HEIGHT_UNITS.CM, label: "cm" },
              { value: HEIGHT_UNITS.FT_IN, label: "ft / in" },
            ]}
            ariaLabel="Height unit"
          />
        </div>
        {heightUnit === HEIGHT_UNITS.CM ? (
          <UnitInput label="cm" value={heightCm} onChange={setHeightCm} labelledBy="height-label" />
        ) : (
          <div className={styles.row}>
            <UnitInput
              label="ft"
              step="1"
              value={heightFtIn.ft}
              onChange={(ft) => setHeightFtIn((h) => ({ ...h, ft }))}
              labelledBy="height-label"
            />
            <UnitInput
              label="in"
              required={false}
              value={heightFtIn.inches}
              onChange={(inches) => setHeightFtIn((h) => ({ ...h, inches }))}
              labelledBy="height-label"
            />
          </div>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label} id="weight-label">Weight</span>
          <UnitToggle
            value={weightUnit}
            onChange={switchWeightUnit}
            options={[
              { value: WEIGHT_UNITS.KG, label: "kg" },
              { value: WEIGHT_UNITS.ST_LB, label: "st / lb" },
            ]}
            ariaLabel="Weight unit"
          />
        </div>
        {weightUnit === WEIGHT_UNITS.KG ? (
          <UnitInput label="kg" value={weightKg} onChange={setWeightKg} labelledBy="weight-label" />
        ) : (
          <div className={styles.row}>
            <UnitInput
              label="st"
              step="1"
              value={weightStLb.st}
              onChange={(st) => setWeightStLb((w) => ({ ...w, st }))}
              labelledBy="weight-label"
            />
            <UnitInput
              label="lb"
              required={false}
              value={weightStLb.lb}
              onChange={(lb) => setWeightStLb((w) => ({ ...w, lb }))}
              labelledBy="weight-label"
            />
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {saved && !error && <div className={styles.success}>Profile saved.</div>}

      <button type="submit" disabled={saving} className={styles.button}>
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function UnitToggle({ value, onChange, options, ariaLabel }) {
  return (
    <div className={styles.unitToggle} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${styles.unitOption} ${value === o.value ? styles.unitOptionActive : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A number input with its unit shown inside the box on the right.
function UnitInput({ label, value, onChange, labelledBy, step = "0.1", required = true }) {
  return (
    <div className={styles.unitInputWrap}>
      <input
        className={`${styles.input} ${styles.unitInput}`}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-labelledby={labelledBy}
      />
      <span className={styles.unitSuffix} aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
