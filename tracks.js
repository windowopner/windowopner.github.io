// The five loops, one per disc, synthesised offline into plain sample arrays. They share a
// tempo, a length, and (loosely) A minor, so the deck can crossfade between neighbours in
// the middle of a bar and it still sounds like a mix.
//
//   01  deep house       Am9, Fmaj9, Dm9, Em7
//   02  future garage    half-time, big pad, shimmering arp
//   03  minimal techno   rolling sixteenth bass, rim and hats
//   04  dub techno       one chord stab through a long delay, vinyl dust
//   05  IDM              broken kick, FM droplets in euclidean rhythms
//
// render(i, sampleRate) -> Promise<[Float32Array, Float32Array]>, exactly one loop long.

export const BPM = 122;
const BEAT = 60 / BPM;
const S16 = BEAT / 4;
const BARS = 4;
const STEPS = BARS * 16;
export const LOOP = STEPS * S16;
// Rendered past the end, then folded back onto the start so reverb and delay tails
// carry across the seam instead of cutting off.
const TAIL = 3.5;

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const at = (step) => step * S16;

// Same numbers every render, so a loop never changes between visits.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "x...x...x...x..." -> [[0, 1], [4, 1], ...] repeated over every bar. X is an accent,
// o a ghost note.
function hits(pattern) {
  const out = [];
  const levels = { X: 1, x: 0.75, o: 0.4 };
  for (let s = 0; s < STEPS; s++) {
    const ch = pattern[s % pattern.length];
    if (levels[ch]) out.push([s, levels[ch]]);
  }
  return out;
}

// k hits spread as evenly as possible over n steps, turned by `rot`.
function euclid(k, n, rot = 0) {
  const out = [];
  for (let s = 0; s < n; s++) if (((s + rot) * k) % n < k) out.push(s);
  return out;
}

// ── The studio: buses, a reverb, a ping-pong delay, and a kick-driven pump ──
function studio(ctx) {
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 10;
  glue.ratio.value = 3;
  glue.attack.value = 0.008;
  glue.release.value = 0.18;
  glue.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(glue);
  const drums = ctx.createGain();
  drums.connect(master);
  // Everything that isn't a drum ducks under the kick.
  const pump = ctx.createGain();
  pump.connect(master);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  const r = rng(7);
  for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;

  // Reverb: two seconds of decaying stereo noise.
  const ir = ctx.createBuffer(2, Math.round(ctx.sampleRate * 2.6), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * (1 - i / d.length) ** 3.2;
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const revIn = ctx.createGain();
  const revOut = ctx.createGain();
  revOut.gain.value = 0.55;
  revIn.connect(verb).connect(revOut).connect(pump);

  // Delay: dotted eighths bouncing left to right, darkening as they repeat.
  const dlyIn = ctx.createGain();
  const dL = ctx.createDelay(2);
  const dR = ctx.createDelay(2);
  dL.delayTime.value = dR.delayTime.value = S16 * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.46;
  const dark = ctx.createBiquadFilter();
  dark.type = "lowpass";
  dark.frequency.value = 2400;
  const merge = ctx.createChannelMerger(2);
  const dlyOut = ctx.createGain();
  dlyOut.gain.value = 0.5;
  dlyIn.connect(dL);
  dL.connect(merge, 0, 0);
  dL.connect(dR);
  dR.connect(merge, 0, 1);
  dR.connect(dark).connect(fb).connect(dL);
  merge.connect(dlyOut);
  dlyOut.connect(pump);
  const dlyToRev = ctx.createGain();
  dlyToRev.gain.value = 0.3;
  dlyOut.connect(dlyToRev).connect(revIn);

  return { ctx, master, drums, pump, revIn, dlyIn, noise, dlyFb: fb, dlyDark: dark };
}

function send(st, from, rev, dly) {
  const { ctx } = st;
  if (rev) { const g = ctx.createGain(); g.gain.value = rev; from.connect(g).connect(st.revIn); }
  if (dly) { const g = ctx.createGain(); g.gain.value = dly; from.connect(g).connect(st.dlyIn); }
}

function panner(st, pan, dest) {
  const p = st.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(dest);
  return p;
}

// ── Instruments ─────────────────────────────────────────────────────
function duck(st, t, depth) {
  st.pump.gain.setValueAtTime(1 - depth, t);
  st.pump.gain.setTargetAtTime(1, t + 0.015, 0.085);
}

function kick(st, t, v = 1, { tone = 52, punch = 160, decay = 0.42 } = {}) {
  const { ctx } = st;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(punch, t);
  o.frequency.exponentialRampToValueAtTime(tone, t + 0.065);
  o.frequency.exponentialRampToValueAtTime(tone * 0.82, t + decay);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.05, decay / 3.2);
  o.connect(g).connect(st.drums);
  o.start(t);
  o.stop(t + decay * 2);
  noiseHit(st, t, { type: "highpass", freq: 2800, dur: 0.006, v: v * 0.22 });
}

function noiseHit(st, t, { type = "highpass", freq = 8000, q = 0.7, dur = 0.05, v = 0.2, pan = 0, attack = 0.001, dest, rev = 0, dly = 0 }) {
  const { ctx } = st;
  const s = ctx.createBufferSource();
  s.buffer = st.noise;
  s.loop = dur > 0.5;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + attack + dur);
  const p = panner(st, pan, dest || st.drums);
  s.connect(f).connect(g).connect(p);
  send(st, p, rev, dly);
  s.start(t, (t * 7.31) % 0.9);
  s.stop(t + attack + dur + 0.02);
}

const hat = (st, t, v, open = false, pan = 0.12) =>
  noiseHit(st, t, { type: "highpass", freq: open ? 6800 : 8200, dur: open ? 0.2 : 0.035, v: v * (open ? 0.16 : 0.13), pan });

function clap(st, t, v = 1, rev = 0.3) {
  for (let k = 0; k < 3; k++) noiseHit(st, t + k * 0.011, { type: "bandpass", freq: 1250, q: 1.3, dur: 0.012, v: v * 0.28 });
  noiseHit(st, t + 0.03, { type: "bandpass", freq: 1150, q: 1.1, dur: 0.16, v: v * 0.3, rev });
}

function rim(st, t, v = 1, pan = -0.2) {
  const { ctx } = st;
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = 1650;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v * 0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.035);
  const p = panner(st, pan, st.drums);
  o.connect(g).connect(p);
  send(st, p, 0.12, 0.18);
  o.start(t);
  o.stop(t + 0.05);
}

// A subtractive voice: detuned oscillators, a lowpass with its own envelope, an amp envelope.
function voice(st, t, f, dur, o) {
  const { ctx } = st;
  const lp = ctx.createBiquadFilter();
  lp.type = o.filter || "lowpass";
  lp.Q.value = o.q ?? 0.7;
  lp.frequency.setValueAtTime(o.cutoff * (o.env ?? 1), t);
  lp.frequency.setTargetAtTime(o.cutoff, t + 0.004, o.fdecay ?? 0.12);
  const vca = ctx.createGain();
  const a = o.attack ?? 0.004;
  const v = o.v ?? 0.2;
  vca.gain.setValueAtTime(0, t);
  vca.gain.linearRampToValueAtTime(v, t + a);
  if (o.sustain !== undefined) vca.gain.setTargetAtTime(v * o.sustain, t + a, o.decay ?? 0.1);
  const rel = o.release ?? 0.08;
  vca.gain.setTargetAtTime(0, t + Math.max(a, dur), rel / 4);
  const end = t + Math.max(a, dur) + rel * 1.6 + 0.02;
  for (const det of o.detune || [0]) {
    const osc = ctx.createOscillator();
    osc.type = o.wave || "sawtooth";
    osc.frequency.value = f;
    osc.detune.value = det;
    osc.connect(lp);
    osc.start(t);
    osc.stop(end);
  }
  const p = panner(st, o.pan || 0, o.dest || st.pump);
  lp.connect(vca).connect(p);
  send(st, p, o.rev, o.dly);
}

// Two-operator FM: glassy, like a drop hitting water.
function bell(st, t, f, { dur = 1.4, ratio = 3.5, index = 3, v = 0.1, pan = 0, rev = 0.4, dly = 0.4 } = {}) {
  const { ctx } = st;
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * ratio;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(f * index, t);
  depth.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.5);
  mod.connect(depth).connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  const p = panner(st, pan, st.pump);
  car.connect(g).connect(p);
  send(st, p, rev, dly);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.02);
  mod.stop(t + dur + 0.02);
}

function pad(st, t, notes, dur, o = {}) {
  notes.forEach((m, k) => voice(st, t, hz(m), dur, {
    wave: "sawtooth", detune: [-11, 0, 9], cutoff: o.cutoff ?? 1300, q: 0.5,
    attack: o.attack ?? 0.35, release: o.release ?? 1.1, v: (o.v ?? 0.045), pan: (k % 2 ? 0.28 : -0.28) * (o.width ?? 1),
    rev: o.rev ?? 0.5, dly: o.dly ?? 0,
  }));
}

function sub(st, t, m, dur, v = 0.32) {
  voice(st, t, hz(m), dur, { wave: "sine", cutoff: 400, attack: 0.008, release: 0.08, v });
}

// ── The five loops ───────────────────────────────────────────────────
const tracks = [
  // 01 deep house: four to the floor, offbeat bass, warm ninth chords.
  (st) => {
    const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [50, 53, 57, 60, 64], [52, 55, 59, 62, 69]];
    const roots = [45, 41, 38, 40];
    for (const [s, v] of hits("x...x...x...x...")) { kick(st, at(s), 0.95 * v); }
    for (let s = 0; s < STEPS + 16; s += 4) duck(st, at(s), 0.6);
    for (const [s, v] of hits("....x.......x...")) clap(st, at(s), v);
    for (const [s, v] of hits("..x...x...x...x.")) hat(st, at(s), v, true);
    for (const [s, v] of hits("o.o.o.o.o.o.oxo.")) hat(st, at(s), v * 0.8, false, -0.15);
    for (const [s, v] of hits("..x...x...x.x.x.")) {
      const bar = Math.floor(s / 16);
      const oct = s % 16 === 14 ? 12 : 0;
      voice(st, at(s), hz(roots[bar] + oct), S16 * 1.4, { cutoff: 380, env: 3.2, fdecay: 0.06, q: 5, v: 0.24 * v, release: 0.05 });
      sub(st, at(s), roots[bar] - 12, S16 * 1.4, 0.22 * v);
    }
    chords.forEach((c, bar) => pad(st, at(bar * 16), c, at(15), { cutoff: 1500, v: 0.034 }));
    // A sparse pluck walking up each chord.
    const pick = hits("x..x..x...x..x..");
    pick.forEach(([s], k) => {
      const c = chords[Math.floor(s / 16)];
      voice(st, at(s), hz(c[k % c.length] + 12), S16, { wave: "square", cutoff: 1800, env: 2.4, fdecay: 0.05, sustain: 0.2, decay: 0.08, v: 0.055, pan: k % 2 ? 0.35 : -0.35, dly: 0.5, rev: 0.2 });
    });
  },

  // 02 future garage: half-time, heavy reverb, a shimmering arp over a wide pad.
  (st) => {
    const chords = [[53, 57, 60, 64, 67], [55, 59, 62, 64, 69], [57, 60, 64, 67, 72], [52, 55, 59, 64, 71]];
    const roots = [41, 43, 45, 40];
    for (const [s, v] of hits("x.........x.....x.........x...x.")) kick(st, at(s), 0.9 * v, { tone: 48, decay: 0.55 });
    for (const [s] of hits("x.........x.....x.........x...x.")) duck(st, at(s), 0.5);
    for (let s = STEPS; s < STEPS + 16; s += 10) duck(st, at(s), 0.5);
    for (const [s, v] of hits("........x.......")) clap(st, at(s), v * 1.1, 0.7);
    for (const [s, v] of hits("..x.o..x..o.x..o")) hat(st, at(s), v, false, 0.25);
    for (const [s, v] of hits("oooooooooooooooo")) noiseHit(st, at(s) + (s % 2 ? S16 * 0.18 : 0), { type: "highpass", freq: 10500, dur: 0.02, v: 0.035 * v, pan: -0.3 });
    roots.forEach((m, bar) => {
      sub(st, at(bar * 16), m - 12, at(10), 0.3);
      sub(st, at(bar * 16 + 11), m - 12, at(4), 0.22);
    });
    chords.forEach((c, bar) => pad(st, at(bar * 16), c, at(16), { cutoff: 2100, v: 0.032, attack: 0.6, release: 1.8, rev: 0.75, width: 1.4 }));
    for (let s = 0; s < STEPS; s++) {
      const c = chords[Math.floor(s / 16)];
      const up = [...c, ...c.map((m) => m + 12)];
      const n = up[(s * 3) % up.length] + 12;
      const swell = 0.4 + 0.6 * Math.sin(((s % 16) / 16) * Math.PI);
      voice(st, at(s), hz(n), S16 * 0.8, { wave: "triangle", cutoff: 4200, env: 1.5, sustain: 0.3, decay: 0.05, v: 0.04 * swell, pan: Math.sin(s * 0.9) * 0.6, dly: 0.35, rev: 0.4 });
    }
  },

  // 03 minimal techno: hard kick, rolling bass with a slowly opening filter, rim and hats.
  (st) => {
    for (const [s, v] of hits("x...x...x...x...")) kick(st, at(s), v, { punch: 175, tone: 50, decay: 0.32 });
    for (let s = 0; s < STEPS + 16; s += 4) duck(st, at(s), 0.72);
    for (const [s, v] of hits("..x...x...x...x.")) hat(st, at(s), v * 1.1, true, 0.08);
    for (const [s, v] of hits("oxoxoxoXoxoxoxoX")) hat(st, at(s), v, false, -0.1);
    for (const [s, v] of hits("......x.......x.......x....x..x.")) rim(st, at(s), v);
    for (let s = 0; s < STEPS; s++) {
      if (s % 4 === 0) continue;
      const open = 0.5 - 0.5 * Math.cos((s / STEPS) * Math.PI * 2);
      const n = s % 8 === 7 ? 57 : 45;
      voice(st, at(s), hz(n), S16 * 0.7, { cutoff: 260 + open * 1500, env: 2.6, fdecay: 0.04, q: 9, v: 0.15, release: 0.03 });
      sub(st, at(s), 33, S16 * 0.7, 0.16);
    }
    // One minor stab, answered by the delay.
    for (const s of [30, 62]) pad(st, at(s), [57, 60, 67], S16 * 0.6, { cutoff: 1900, v: 0.06, attack: 0.003, release: 0.12, rev: 0.25, dly: 0.85 });
    pad(st, 0, [45, 52], LOOP, { cutoff: 500, v: 0.022, attack: 1.5, release: 2, rev: 0.4 });
  },

  // 04 dub techno: soft kick, one chord stab drowned in delay, sub bass, dust.
  (st) => {
    st.dlyFb.gain.value = 0.62;
    st.dlyDark.frequency.value = 1500;
    const chords = [[50, 53, 57, 60], [50, 53, 57, 60], [53, 57, 60, 64], [52, 55, 59, 62]];
    for (const [s, v] of hits("x...x...x...x...")) kick(st, at(s), 0.85 * v, { tone: 46, punch: 130, decay: 0.5 });
    for (let s = 0; s < STEPS + 16; s += 4) duck(st, at(s), 0.45);
    for (const [s, v] of hits("..o...o...o...o.")) hat(st, at(s), v * 1.3, true, 0.2);
    for (const [s, v] of hits("o.oxo.o.o.oxo.oo")) hat(st, at(s), v * 0.7, false, -0.2);
    for (const [s] of hits("..x.......x.....")) {
      const c = chords[Math.floor(s / 16)];
      c.forEach((m, k) => voice(st, at(s), hz(m), S16 * 0.9, {
        filter: "bandpass", cutoff: 900 + 300 * Math.sin(s * 0.4), q: 1.4, detune: [-6, 6], attack: 0.004, sustain: 0.3, decay: 0.06,
        release: 0.18, v: 0.075, pan: k % 2 ? 0.2 : -0.2, dly: 1, rev: 0.6,
      }));
    }
    for (const [s] of hits("x.......x..x....")) sub(st, at(s), 38 - (Math.floor(s / 16) === 2 ? -3 : 0), S16 * 2.6, 0.3);
    // Vinyl dust: sparse crackle and a little hiss.
    const r = rng(404);
    for (let k = 0; k < 90; k++) {
      noiseHit(st, r() * LOOP, { type: "bandpass", freq: 2000 + r() * 4000, q: 2, dur: 0.002 + r() * 0.004, v: 0.04 + r() * 0.08, pan: r() * 1.6 - 0.8, dest: st.master });
    }
    noiseHit(st, 0, { type: "highpass", freq: 5000, dur: LOOP, attack: 0.001, v: 0.006, dest: st.master });
  },

  // 05 IDM: a broken kick, FM droplets falling in euclidean rhythms, an airy pad.
  (st) => {
    const r = rng(5);
    const scale = [69, 72, 74, 76, 79, 81, 84, 86, 88];
    const kicks = [0, 6, 10, 16, 22, 26, 32, 38, 42, 48, 54, 57, 59];
    kicks.forEach((s) => kick(st, at(s), 0.8, { tone: 50, punch: 190, decay: 0.3 }));
    [...kicks, STEPS, STEPS + 6].forEach((s) => duck(st, at(s), 0.4));
    for (const [s] of hits("....x.......x...")) rim(st, at(s), 0.9, 0.3);
    for (let bar = 0; bar < BARS; bar++) {
      for (const s of euclid(7, 16, bar)) hat(st, at(bar * 16 + s), 0.6 + r() * 0.4, false, r() * 1.2 - 0.6);
      // A ratchet at the end of every other bar.
      if (bar % 2) for (let k = 0; k < 6; k++) noiseHit(st, at(bar * 16 + 14) + k * S16 / 3, { type: "highpass", freq: 9000, dur: 0.012, v: 0.05 + k * 0.012, pan: 0.4 });
      for (const s of euclid(5, 16, bar * 3)) {
        const n = scale[Math.floor(r() * scale.length)];
        bell(st, at(bar * 16 + s), hz(n), { v: 0.07 + r() * 0.04, ratio: r() < 0.5 ? 3.5 : 2.01, index: 2 + r() * 3, pan: r() * 1.4 - 0.7, dly: 0.5, rev: 0.5 });
      }
    }
    pad(st, 0, [57, 64, 71, 74], at(32), { cutoff: 1700, v: 0.03, attack: 1.2, release: 2.4, rev: 0.8, width: 1.6 });
    pad(st, at(32), [53, 60, 67, 71], at(32), { cutoff: 1700, v: 0.03, attack: 1.2, release: 2.4, rev: 0.8, width: 1.6 });
    for (const s of [0, 32]) sub(st, at(s), 33, at(12), 0.26);
    for (const s of [20, 52]) sub(st, at(s), 29 + (s > 32 ? 0 : 4), at(8), 0.2);
  },
];

export const COUNT = tracks.length;

// All five come out at about the same loudness, so a crossfade never jumps in level.
const TARGET_RMS = 0.15;

export async function render(i, sampleRate) {
  const length = Math.round(LOOP * sampleRate);
  const ctx = new OfflineAudioContext(2, length + Math.round(TAIL * sampleRate), sampleRate);
  const st = studio(ctx);
  tracks[i](st);
  const buf = await ctx.startRendering();
  const out = [0, 1].map((c) => {
    const src = buf.getChannelData(c);
    const loop = src.slice(0, length);
    for (let k = length; k < src.length; k++) loop[k - length] += src[k];
    return loop;
  });
  let sum = 0;
  let peak = 0;
  for (const ch of out) for (let k = 0; k < ch.length; k++) { sum += ch[k] * ch[k]; peak = Math.max(peak, Math.abs(ch[k])); }
  const rms = Math.sqrt(sum / (length * 2)) || 1;
  const gain = Math.min(TARGET_RMS / rms, 0.95 / (peak || 1));
  for (const ch of out) for (let k = 0; k < ch.length; k++) ch[k] *= gain;
  return out;
}
