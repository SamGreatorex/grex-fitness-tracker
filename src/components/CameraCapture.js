"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CameraCapture.module.css";

// Live camera view for taking a profile picture — works with laptop
// webcams as well as phone cameras (front/back switchable). Calls
// onCapture(File) with a square JPEG once the user accepts a shot.
// Needs a secure context (https, or localhost in dev) for getUserMedia.
export default function CameraCapture({ onCapture, onClose }) {
  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facingMode, setFacingMode] = useState("user");
  const [canSwitch, setCanSwitch] = useState(false);
  const [shot, setShot] = useState(null); // { blob, url }
  const [error, setError] = useState("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    dialogRef.current?.showModal();
    return stopStream;
  }, [stopStream]);

  // (Re)start the camera whenever the facing mode changes, or after a retake.
  useEffect(() => {
    if (shot) return;
    let cancelled = false;
    (async () => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError("");

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow camera access in your browser settings and try again."
            : "Could not start the camera."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facingMode, shot, stopStream]);

  useEffect(() => {
    if (!shot) return;
    return () => URL.revokeObjectURL(shot.url);
  }, [shot]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    // Centre-crop to a square, since it's shown in a circle anyway.
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    const out = Math.min(size, 1024);

    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    // The front camera preview is mirrored, so mirror the saved photo to match.
    if (facingMode === "user") {
      ctx.translate(out, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, size, size, 0, 0, out, out);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not capture the photo.");
          return;
        }
        stopStream();
        setShot({ blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.9
    );
  };

  const acceptPhoto = () => {
    const file = new File([shot.blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    dialogRef.current?.close();
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.title}>Take a photo</p>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close camera"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>

        <div className={styles.viewport}>
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.url} alt="Captured photo" className={styles.media} />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`${styles.media} ${facingMode === "user" ? styles.mirrored : ""}`}
            />
          )}
          {error && <div className={styles.errorOverlay}>{error}</div>}
        </div>

        <div className={styles.actions}>
          {shot ? (
            <>
              <button type="button" className={styles.buttonGhost} onClick={() => setShot(null)}>
                Retake
              </button>
              <button type="button" className={styles.button} onClick={acceptPhoto}>
                Use photo
              </button>
            </>
          ) : (
            <>
              {canSwitch && (
                <button
                  type="button"
                  className={styles.buttonGhost}
                  onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
                >
                  Switch camera
                </button>
              )}
              <button type="button" className={styles.button} onClick={takePhoto} disabled={!!error}>
                Capture
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
