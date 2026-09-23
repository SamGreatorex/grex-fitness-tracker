// A short two-beep chime synthesized with the Web Audio API, so the rest
// timer can sound an alarm without shipping/hosting an audio file.
export function playAlarm(audioCtx) {
  if (!audioCtx) return;
  try {
    audioCtx.resume?.();
    const beep = (startTime, freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    };
    const now = audioCtx.currentTime;
    beep(now, 880);
    beep(now + 0.3, 880);
  } catch {
    // Web Audio unavailable — skip the alarm rather than throw.
  }
}
