// Sound. The discs are records: each plays its own loop (tracks.js) on one deck (deck.js),
// and moving the carousel is the crossfader. Drag between discs and the two loops blend
// while the filter closes; hold the front disc and the music follows your hand, stopping
// when you hold still and scratching when you turn it. Small synthesised cues answer the
// notches, the keypad, and the lock.
//
// createSound(ctx, { first, onLevel }) -> Promise<engine>, resolved once the first loop
// is ready. The AudioContext is made by the caller inside a click, so the browser lets
// it play.
//   engine.on() / off()       spin up from silence, or tape-stop to it
//   engine.mix(pos, speed)    carousel position (which loops) and speed (how muffled)
//   engine.grip(v)            hand speed on the held disc in rad/s, or null when let go
//   engine.muffle(on)         a dialog is open: the music goes behind glass
//   engine.cue(kind, arg)     tick, key, seal, deny, unlock, open, grab

const V = new URL(import.meta.url).searchParams.get("v") || "";
// A hand turning the disc at this speed (rad/s) plays the loop at its normal speed.
const HAND = 5.2;
const S16 = 60 / 122 / 4;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export async function createSound(ctx, { first = 0, onLevel } = {}) {
  const [{ render, COUNT }] = await Promise.all([
    import(`./tracks.js?v=${V}`),
    ctx.audioWorklet.addModule(`deck.js?v=${V}`),
  ]);

  // deck -> sweep (the spin-up opening) -> tone (motion and dialogs) -> music ┐
  //                                                               sfx cues ┴> master -> limiter
  const deck = new AudioWorkletNode(ctx, "deck", { numberOfInputs: 0, outputChannelCount: [2] });
  const rate = deck.parameters.get("rate");
  const mixer = deck.parameters.get("mix");
  const sweep = ctx.createBiquadFilter();
  sweep.type = "lowpass";
  sweep.frequency.value = 180;
  sweep.Q.value = 1.1;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 20000;
  tone.Q.value = 0.8;
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  sfx.gain.value = 0.85;
  const master = ctx.createGain();
  master.gain.value = 0;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -4;
  limit.knee.value = 2;
  limit.ratio.value = 16;
  limit.attack.value = 0.002;
  limit.release.value = 0.12;
  deck.connect(sweep).connect(tone).connect(music).connect(master);
  sfx.connect(master);
  master.connect(limit).connect(ctx.destination);

  // Meters: the low end for the beat, a coarse spectrum for the button's bars.
  const lowTap = ctx.createBiquadFilter();
  lowTap.type = "lowpass";
  lowTap.frequency.value = 130;
  const low = ctx.createAnalyser();
  low.fftSize = 512;
  const spectrum = ctx.createAnalyser();
  spectrum.fftSize = 256;
  spectrum.smoothingTimeConstant = 0.6;
  master.connect(lowTap).connect(low);
  master.connect(spectrum);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // Render the loops nearest the current disc first; the deck plays whatever has arrived.
  const order = [...Array(COUNT).keys()].sort((a, b) => Math.abs(a - first) - Math.abs(b - first));
  let firstIn;
  const firstReady = new Promise((r) => { firstIn = r; });
  (async () => {
    for (const i of order) {
      const channels = await render(i, ctx.sampleRate);
      deck.port.postMessage({ type: "track", i, channels }, channels.map((c) => c.buffer));
      if (i === first) firstIn();
    }
  })().catch((err) => { console.warn("A disc loop failed to render.", err); firstIn(); });
  await firstReady;

  let playing = false;
  let gripped = false;
  let muffled = false;
  let moving = 0;
  let toneAt = 20000;
  let parkTimer = 0;
  const now = () => ctx.currentTime;
  // Freeze a param where it is right now, so the next ramp starts from there.
  const hold = (p, t) => {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
  };

  function retone() {
    const goal = muffled ? 480 : clamp(20000 * 2 ** (-moving * 1.25), 650, 20000);
    if (Math.abs(Math.log2(goal / toneAt)) < 0.04) return;
    toneAt = goal;
    tone.frequency.setTargetAtTime(goal, now(), muffled ? 0.09 : 0.05);
  }

  // ── Meter loop, only while playing ─────────────────────────────────
  const lowBuf = new Float32Array(low.fftSize);
  const bins = new Uint8Array(spectrum.frequencyBinCount);
  // Bin ranges, and a floor and gain per band so the quieter highs still move.
  const bands = [[0, 2, 0.6, 2.5], [2, 6, 0.5, 3.2], [6, 22, 0.2, 3.2], [22, 90, 0.02, 3]];
  const bars = [0, 0, 0, 0];
  let env = 0;
  let meterFrame = 0;
  function meter() {
    low.getFloatTimeDomainData(lowBuf);
    let sum = 0;
    for (let k = 0; k < lowBuf.length; k++) sum += lowBuf[k] * lowBuf[k];
    const rms = Math.sqrt(sum / lowBuf.length);
    env = rms > env ? env + (rms - env) * 0.7 : env * 0.86;
    spectrum.getByteFrequencyData(bins);
    bands.forEach(([a, b, floor, gain], k) => {
      let s = 0;
      for (let j = a; j < b; j++) s += bins[j];
      bars[k] = clamp((s / (b - a) / 255 - floor) * gain, 0, 1);
    });
    onLevel?.(clamp(env * 2.8, 0, 1), bars);
    meterFrame = requestAnimationFrame(meter);
  }
  function stopMeter() {
    cancelAnimationFrame(meterFrame);
    meterFrame = 0;
    env = 0;
    onLevel?.(0, [0, 0, 0, 0]);
  }

  document.addEventListener("visibilitychange", () => {
    if (!playing) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  // ── Cues ──────────────────────────────────────────────────────────
  function blip(t, f, { type = "sine", dur = 0.05, v = 0.1, to, pan = 0, cutoff } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    let head = o;
    if (cutoff) {
      const f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = cutoff;
      head = o.connect(f2);
    }
    head.connect(g).connect(p).connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(t, { from, to = from, dur, v = 0.05, type = "bandpass", q = 1, pan = 0 }) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // A minor pentatonic, so cues always sit in the key of the loops.
  const PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91];

  const cues = {
    tick(i = 0) {
      const t = now();
      blip(t, hz(PENTA[5 + (i % 5)]), { type: "triangle", dur: 0.04, v: 0.05 });
      hiss(t, { from: 7000, dur: 0.012, v: 0.05, type: "highpass" });
    },
    key(k) {
      const t = now();
      if (k === "C") { blip(t, 330, { type: "square", to: 220, dur: 0.08, v: 0.04, cutoff: 1600 }); return; }
      const n = PENTA[Number(k) % PENTA.length];
      blip(t, hz(n), { type: "square", dur: 0.07, v: 0.04, cutoff: 2600 });
      blip(t, hz(n + 12), { dur: 0.05, v: 0.02 });
    },
    seal() {
      const t = now();
      blip(t, 540, { to: 110, dur: 0.3, v: 0.11 });
      hiss(t, { from: 3200, to: 380, dur: 0.32, v: 0.05 });
    },
    deny() {
      const t = now();
      blip(t, 220, { type: "sawtooth", to: 200, dur: 0.12, v: 0.06, cutoff: 1300, pan: -0.2 });
      blip(t + 0.13, 165, { type: "sawtooth", to: 140, dur: 0.22, v: 0.06, cutoff: 1100, pan: 0.2 });
    },
    unlock() {
      const t = now();
      [69, 72, 76, 81, 84, 88].forEach((n, k) => blip(t + k * S16 / 2, hz(n), { type: "triangle", dur: 0.3, v: 0.05, pan: k % 2 ? 0.35 : -0.35 }));
      hiss(t, { from: 700, to: 9000, dur: 0.5, v: 0.05, type: "highpass" });
      blip(t + 0.38, 150, { to: 44, dur: 0.45, v: 0.32 });
    },
    open() {
      const t = now();
      hiss(t, { from: 500, to: 7000, dur: 0.34, v: 0.08 });
      blip(t, 300, { to: 1300, dur: 0.24, v: 0.04 });
    },
    grab() {
      const t = now();
      blip(t, 110, { to: 58, dur: 0.1, v: 0.14 });
      hiss(t, { from: 900, dur: 0.035, v: 0.06, type: "lowpass" });
    },
  };

  return {
    get playing() { return playing; },

    on() {
      clearTimeout(parkTimer);
      ctx.resume();
      const t = now();
      const wasPlaying = playing;
      playing = true;
      hold(master.gain, t);
      master.gain.setTargetAtTime(0.9, t, 0.04);
      // The platter spins up from a stop, and the filter opens like a drop.
      hold(rate, t);
      rate.setTargetAtTime(1, t + 0.04, 0.26);
      if (!wasPlaying) {
        hold(sweep.frequency, t);
        sweep.frequency.setValueAtTime(180, t);
        sweep.frequency.exponentialRampToValueAtTime(20000, t + 2.4);
      }
      if (!meterFrame) meter();
    },

    off() {
      if (!playing) return;
      playing = false;
      gripped = false;
      const t = now();
      // Tape stop: the loop winds down in pitch, then fades.
      hold(rate, t);
      rate.setTargetAtTime(0, t, 0.17);
      hold(master.gain, t);
      master.gain.setTargetAtTime(0, t + 0.42, 0.07);
      clearTimeout(parkTimer);
      parkTimer = setTimeout(() => { if (!playing) { stopMeter(); ctx.suspend(); } }, 1100);
    },

    mix(pos, speed) {
      if (!playing) return;
      mixer.setTargetAtTime(clamp(pos, 0, COUNT - 1), now(), 0.012);
      moving = Math.abs(speed);
      retone();
    },

    grip(v) {
      if (!playing) return;
      if (v === null || v === undefined) {
        if (!gripped) return;
        gripped = false;
        const t = now();
        hold(rate, t);
        rate.setTargetAtTime(1, t, 0.14);
        return;
      }
      gripped = true;
      rate.setTargetAtTime(clamp(v / HAND, -2.6, 2.6), now(), 0.022);
    },

    muffle(on) {
      muffled = Boolean(on);
      music.gain.setTargetAtTime(muffled ? 0.7 : 1, now(), 0.1);
      retone();
    },

    cue(kind, arg) {
      if (!playing || ctx.state !== "running") return;
      cues[kind]?.(arg);
    },
  };
}
