/**
 * Original AFG AI interface cues, synthesized locally with Web Audio.
 *
 * No audio files, copyrighted material or network requests are used. Cues are
 * short, bounded envelopes and only run after a user gesture. The shared
 * experience settings (`afg_visual_preferences_v1`) control mute and volume.
 */
export type UiSound =
  | 'navigate'
  | 'send'
  | 'receive'
  | 'success'
  | 'error'
  | 'notice';

type Tone = { frequency: number; delay: number; duration: number; type: OscillatorType; gain: number };

const SOUND_KEY = 'afg_visual_preferences_v1';

const patterns: Record<UiSound, Tone[]> = {
  navigate: [
    { frequency: 420, delay: 0, duration: 0.055, type: 'sine', gain: 0.035 },
    { frequency: 560, delay: 0.035, duration: 0.06, type: 'sine', gain: 0.026 },
  ],
  send: [
    { frequency: 880, delay: 0, duration: 0.06, type: 'triangle', gain: 0.045 },
    { frequency: 1320, delay: 0.045, duration: 0.07, type: 'sine', gain: 0.03 },
  ],
  receive: [
    { frequency: 660, delay: 0, duration: 0.09, type: 'sine', gain: 0.04 },
    { frequency: 990, delay: 0.075, duration: 0.12, type: 'sine', gain: 0.032 },
  ],
  success: [
    { frequency: 523.25, delay: 0, duration: 0.08, type: 'sine', gain: 0.04 },
    { frequency: 659.25, delay: 0.07, duration: 0.09, type: 'sine', gain: 0.035 },
    { frequency: 783.99, delay: 0.14, duration: 0.16, type: 'sine', gain: 0.028 },
  ],
  error: [
    { frequency: 240, delay: 0, duration: 0.1, type: 'triangle', gain: 0.04 },
    { frequency: 170, delay: 0.08, duration: 0.16, type: 'triangle', gain: 0.03 },
  ],
  notice: [
    { frequency: 740, delay: 0, duration: 0.075, type: 'sine', gain: 0.035 },
    { frequency: 880, delay: 0.07, duration: 0.1, type: 'sine', gain: 0.025 },
  ],
};

let context: AudioContext | null = null;
let lastPlayedAt = 0;

function readPreferences(): { enabled: boolean; volume: number } {
  try {
    const data = JSON.parse(localStorage.getItem(SOUND_KEY) || 'null');
    return {
      enabled: typeof data?.sound === 'boolean' ? data.sound : true,
      volume: typeof data?.volume === 'number' && Number.isFinite(data.volume)
        ? Math.max(0, Math.min(1, data.volume))
        : 0.3,
    };
  } catch {
    return { enabled: true, volume: 0.3 };
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    context ||= new AudioContextConstructor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

/** Play one short interface cue. Safe to call on every interaction. */
export function playUiSound(kind: UiSound): void {
  const preferences = readPreferences();
  if (!preferences.enabled || preferences.volume <= 0) return;
  const audio = audioContext();
  if (!audio) return;

  const now = audio.currentTime;
  // Prevent duplicate cues when one interaction fires several handlers.
  if (now - lastPlayedAt < 0.055) return;
  lastPlayedAt = now;

  const master = audio.createGain();
  master.gain.setValueAtTime(Math.max(0.0001, preferences.volume * 0.5), now);
  master.connect(audio.destination);

  for (const tone of patterns[kind]) {
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    const start = now + tone.delay;
    const end = start + tone.duration;
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain), start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }
}

/** Release the shared context when an owner is torn down. */
export function closeUiSound(): void {
  const active = context;
  context = null;
  if (active) void active.close().catch(() => undefined);
}
