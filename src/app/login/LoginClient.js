"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signIn,
  signUp,
  confirmSignUp,
  confirmSignIn,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";
import { useAuth } from "../../components/AuthProvider";
import PasswordRequirements from "../../components/PasswordRequirements";
import { meetsPasswordRules, passwordErrorMessage } from "../../lib/password";
import styles from "./login.module.css";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const { user, loading: sessionLoading, refresh } = useAuth();

  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");

  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Forgot password: null → "request" (enter email) → "confirm" (code + new password).
  const [forgotStep, setForgotStep] = useState(null);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!sessionLoading && user) {
      router.replace(redirectTo);
    }
  }, [user, sessionLoading, router, redirectTo]);

  if (sessionLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.subtext}>Loading…</p>
      </main>
    );
  }

  const handleSignIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) {
        await refresh();
        router.push(redirectTo);
        router.refresh();
      } else if (result.nextStep?.signInStep === "CONFIRM_SIGN_UP") {
        setNeedsConfirm(true);
      } else if (result.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setNeedsNewPassword(true);
      } else {
        setError(`Additional step required: ${result.nextStep?.signInStep ?? "unknown"}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await confirmSignIn({ challengeResponse: newPassword });
      if (result.isSignedIn) {
        await refresh();
        router.replace(redirectTo);
      } else {
        setError(`Additional step required: ${result.nextStep?.signInStep ?? "unknown"}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set password.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name: displayName || email.split("@")[0],
          },
        },
      });
      if (result.isSignUpComplete) {
        setTab("signin");
      } else {
        setNeedsConfirm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await confirmSignUp({ username: email, confirmationCode: confirmCode });
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) {
        await refresh();
        router.replace(redirectTo);
      } else {
        setNeedsConfirm(false);
        setTab("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setBusy(false);
    }
  };

  const startForgot = () => {
    setForgotStep("request");
    setError("");
    setInfo("");
  };

  const backToSignIn = () => {
    setForgotStep(null);
    setTab("signin");
    setError("");
    setInfo("");
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
  };

  const sendResetCode = async () => {
    try {
      const result = await resetPassword({ username: email });
      const destination = result.nextStep?.codeDeliveryDetails?.destination;
      setInfo(destination ? `We've emailed a code to ${destination}.` : "We've emailed you a code.");
    } catch (err) {
      // Don't reveal whether an account exists for this email.
      if (err?.name !== "UserNotFoundException") throw err;
      setInfo("If an account exists for that email, we've sent it a code.");
    }
    setForgotStep("confirm");
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sendResetCode();
    } catch (err) {
      setError(
        err?.name === "InvalidParameterException"
          ? "This account's email hasn't been verified, so we can't send a reset code. Sign up again or contact support."
          : passwordErrorMessage(err, "Could not send a reset code.")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResendResetCode = async () => {
    setError("");
    try {
      await sendResetCode();
    } catch (err) {
      setError(passwordErrorMessage(err, "Could not resend the code."));
    }
  };

  const handleForgotConfirm = async (e) => {
    e.preventDefault();
    setError("");
    if (!meetsPasswordRules(resetNewPassword)) return setError("Your new password doesn't meet the requirements.");
    if (resetNewPassword !== resetConfirmPassword) return setError("Passwords don't match.");

    setBusy(true);
    try {
      await confirmResetPassword({ username: email, confirmationCode: resetCode.trim(), newPassword: resetNewPassword });
      // Sign straight in with the new password rather than making them retype it.
      const result = await signIn({ username: email, password: resetNewPassword });
      if (result.isSignedIn) {
        await refresh();
        router.replace(redirectTo);
      } else {
        backToSignIn();
        setPassword("");
        setInfo("Password reset. Sign in with your new password.");
      }
    } catch (err) {
      setError(passwordErrorMessage(err, "Could not reset your password."));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendSignUpCode({ username: email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    }
  };

  const cardTitle = forgotStep
    ? "Reset your password"
    : needsNewPassword
    ? "Set a new password"
    : needsConfirm
    ? "Confirm your email"
    : tab === "signup"
    ? "Create your account"
    : "Welcome back";

  const cardSubtext =
    forgotStep === "request"
    ? "Enter your email and we'll send you a code to reset your password."
    : forgotStep === "confirm"
    ? "Enter the code from your email and choose a new password."
    : needsNewPassword
    ? "Your account requires a new permanent password."
    : needsConfirm
    ? "Enter the 6-digit code we emailed you."
    : tab === "signup"
    ? "Track your gym programs and progress."
    : "Sign in to your fitness tracker.";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.wordmark}>
          <span className={styles.wordmarkName}>
            Fit<span className={styles.wordmarkFour}>4</span> The Future
          </span>
          <span className={styles.wordmarkTag}>Fitness tracker</span>
        </div>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>{cardTitle}</h1>
            <p className={styles.subtext}>{cardSubtext}</p>
          </div>

          {forgotStep === "request" ? (
            <form onSubmit={handleForgotRequest} className={styles.form}>
              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} className={styles.button}>
                {busy ? "Sending…" : "Send reset code"}
              </button>
              <button type="button" className={styles.buttonGhost} onClick={backToSignIn}>
                Back to sign in
              </button>
            </form>
          ) : forgotStep === "confirm" ? (
            <form onSubmit={handleForgotConfirm} className={styles.form}>
              {info && <div className={styles.info}>{info}</div>}
              <label className={styles.field}>
                <span className={styles.label}>Reset code</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>New password</span>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                />
              </label>
              <PasswordRequirements password={resetNewPassword} />
              <label className={styles.field}>
                <span className={styles.label}>Confirm new password</span>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                />
              </label>
              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} className={styles.button}>
                {busy ? "Resetting…" : "Reset password & sign in"}
              </button>
              <div className={styles.linkRow}>
                <button type="button" className={styles.linkButton} onClick={handleResendResetCode}>
                  Resend code
                </button>
                <button type="button" className={styles.linkButton} onClick={backToSignIn}>
                  Back to sign in
                </button>
              </div>
            </form>
          ) : needsNewPassword ? (
            <form onSubmit={handleNewPassword} className={styles.form}>
              <label className={styles.field}>
                <span className={styles.label}>New password</span>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} className={styles.button}>
                {busy ? "Saving…" : "Set password & sign in"}
              </button>
            </form>
          ) : needsConfirm ? (
            <form onSubmit={handleConfirm} className={styles.form}>
              <label className={styles.field}>
                <span className={styles.label}>Verification code</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                />
              </label>
              {error && <div className={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} className={styles.button}>
                {busy ? "Confirming…" : "Confirm"}
              </button>
              <button type="button" className={styles.buttonGhost} onClick={handleResend}>
                Resend code
              </button>
            </form>
          ) : (
            <>
              <div className={styles.tabs}>
                <button
                  type="button"
                  className={`${styles.tab} ${tab === "signin" ? styles.tabActive : ""}`}
                  onClick={() => { setTab("signin"); setError(""); }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`${styles.tab} ${tab === "signup" ? styles.tabActive : ""}`}
                  onClick={() => { setTab("signup"); setError(""); }}
                >
                  Sign up
                </button>
              </div>

              {tab === "signin" ? (
                <form onSubmit={handleSignIn} className={styles.form}>
                  {info && <div className={styles.info}>{info}</div>}
                  <label className={styles.field}>
                    <span className={styles.label}>Email</span>
                    <input className={styles.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Password</span>
                    <input className={styles.input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </label>
                  <button type="button" className={`${styles.linkButton} ${styles.forgotLink}`} onClick={startForgot}>
                    Forgot password?
                  </button>
                  {error && <div className={styles.error}>{error}</div>}
                  <button type="submit" disabled={busy} className={styles.button}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className={styles.form}>
                  <label className={styles.field}>
                    <span className={styles.label}>Name</span>
                    <input className={styles.input} type="text" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Email</span>
                    <input className={styles.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Password</span>
                    <input className={styles.input} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </label>
                  {error && <div className={styles.error}>{error}</div>}
                  <button type="submit" disabled={busy} className={styles.button}>
                    {busy ? "Creating account…" : "Sign up"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
