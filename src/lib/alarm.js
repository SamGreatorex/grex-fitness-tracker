// A digital-watch-style alarm synthesized with the Web Audio API, so the
// rest timer can sound an alarm without shipping/hosting an audio file.
// Six quick beeps read clearly as "timer's done" without needing to be
// harsh — a triangle wave (softer harmonics than square) at a gentler
// volume keeps the same rapid-beep rhythm without being jarring.
export function playAlarm(audioCtx) {
  if (!audioCtx) return;
  try {
    audioCtx.resume?.();

    const beep = (startTime, duration, freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.28, startTime + 0.012);
      gain.gain.setValueAtTime(0.28, startTime + duration - 0.012);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    for (let i = 0; i < 6; i++) {
      beep(now + i * 0.16, 0.08, 1800);
    }
  } catch {
    // Web Audio unavailable — skip the alarm rather than throw.
  }
}
