/** Subtle audio feedback for barcode scan workflows (Web Audio API — no asset files). */

type TonePreset = "success" | "error" | "scan";

const playTone = (frequency: number, durationMs: number, type: OscillatorType = "sine"): void => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
    setTimeout(() => void ctx.close(), durationMs + 80);
  } catch {
    /* Audio blocked or unsupported */
  }
};

/** Pleasant ascending chime on successful barcode scan */
export const playScanSuccess = (): void => {
  playTone(880, 90, "sine");
  setTimeout(() => playTone(1174, 80, "sine"), 70);
};

/** Low error tone on invalid / rejected sample scan */
export const playScanError = (): void => {
  playTone(220, 220, "triangle");
  setTimeout(() => playTone(165, 180, "triangle"), 100);
};

/** Short blip when barcode field receives input */
export const playScanBlip = (): void => {
  playTone(660, 40, "sine");
};

export const labAudio = {
  success: playScanSuccess,
  error: playScanError,
  blip: playScanBlip,
  play(preset: TonePreset): void {
    if (preset === "success") playScanSuccess();
    else if (preset === "error") playScanError();
    else playScanBlip();
  }
};
