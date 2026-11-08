import assert from "node:assert/strict";

const data = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => data.get(key) || null,
  },
  configurable: true,
});

let started = 0;
class FakeGain {
  gain = {
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  connect() {}
}
class FakeOscillator {
  type = "sine";
  frequency = { setValueAtTime() {} };
  connect() {}
  start() { started += 1; }
  stop() {}
}
class FakeAudioContext {
  state = "running";
  currentTime = 1;
  destination = {};
  createGain() { return new FakeGain(); }
  createOscillator() { return new FakeOscillator(); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
Object.defineProperty(globalThis, "window", {
  value: { AudioContext: FakeAudioContext },
  configurable: true,
});

const { playUiSound, closeUiSound } = await import("../src/lib/uiSound.ts");

data.set("afg_visual_preferences_v1", JSON.stringify({ sound: false, volume: 0.5 }));
playUiSound("send");
assert.equal(started, 0, "Muted cues must not create oscillators.");

data.set("afg_visual_preferences_v1", JSON.stringify({ sound: true, volume: 0 }));
playUiSound("send");
assert.equal(started, 0, "Zero volume must not create oscillators.");

data.set("afg_visual_preferences_v1", JSON.stringify({ sound: true, volume: 0.5 }));
playUiSound("receive");
assert.equal(started, 2, "The receive cue uses two bounded tones.");

// The throttle prevents duplicate cues from multiple handlers on one gesture.
playUiSound("error");
assert.equal(started, 2, "Duplicate cues inside the throttle window are ignored.");

closeUiSound();
console.log("AFG UI sound: mute, zero volume, cue synthesis and duplicate throttle passed.");
