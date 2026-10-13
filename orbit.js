// Space theme: the six discs ride a tilted ring around a pixel planet.
// The planet hangs off the left edge of the screen and the ring sweeps across it,
// so only some discs are in frame at once. Selecting a disc turns the ring until
// that disc reaches the front slot, low and just left of centre.
// Planet, ring dust, and stars are drawn at a third of the size and scaled up pixelated.
window.Orbit = (() => {
  const TAU = Math.PI * 2;
  const STEP = TAU / 6;
  const FRONT = (62 * Math.PI) / 180; // ring angle of the selected slot

  // Composition, as fractions of the stage: planet off the left edge, a wide ring tilted up to the right.
  const PLANET_X = 0.045; // of viewport width
  const PLANET_Y = 0.52;  // of stage height
  const PLANET_R = 0.62;  // of stage height
  const RING_R = 0.86;    // of viewport width
  const RING_FLAT = 0.14; // ring height as a share of its width
  const RING_TILT = (-4 * Math.PI) / 180;
  const SCALE = 3;
  const DRAW_MS = 1000 / 15;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let glass, items, back, front, sky, bctx, fctx, sctx;
  let running = false;
  let raf = 0;
  let ring = FRONT;
  let target = FRONT;
  let lastDraw = 0;
  // Positions are worked out across the whole page ("band": full width, full height),
  // so the planet can run off the screen edge and sit behind the header and console.
  // Disc positions are shifted back into the stage's own coordinates.
  let BW = 0, BH = 0, H = 0, bandLeft = 0, bandTop = 0, CX = 0, CY = 0, R = 0, RY = 0, PR = 0;
  const COS_T = Math.cos(RING_TILT);
  const SIN_T = Math.sin(RING_TILT);
  const dust = [];
  let stars = [];

  // Small seeded random so the ring looks the same on every visit.
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const BANDS = ["#b8492f", "#e3a35c", "#efd9b4", "#8f5136"].map(hex);
  const NIGHT = hex("#140b08");
  const LIGHT = (() => { const l = [0.62, -0.42, 0.66]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
  const DUST_COLORS = ["255, 226, 184", "227, 163, 92", "200, 120, 80", "240, 236, 224"];

  function init() {
    glass = document.querySelector(".glass");
    items = [...document.querySelectorAll("#discs > li")];
    back = document.getElementById("orbit-back");
    front = document.getElementById("orbit-front");
    sky = document.getElementById("sky");
    bctx = back.getContext("2d");
    fctx = front.getContext("2d");
    sctx = sky.getContext("2d");

    const r = rng(7);
    // Ring dust: a dense main band around the disc track, a gap, and a faint inner band.
    for (let k = 0; k < 1100; k++) {
      const inner = r() < 0.22;
      const rad = inner ? 0.8 + r() * 0.06 : 0.92 + Math.pow(r(), 1.6) * 0.16 * (r() < 0.5 ? 1 : -0.6);
      dust.push({ a: r() * TAU, rad, c: DUST_COLORS[Math.floor(r() * DUST_COLORS.length)], size: r() < 0.1 ? 2 : 1, alpha: inner ? 0.25 + r() * 0.3 : 0.45 + r() * 0.55 });
    }
    // The disc track itself, as an evenly dotted line.
    for (let k = 0; k < 220; k++) dust.push({ a: (k / 220) * TAU, rad: 1, c: DUST_COLORS[0], size: 1, alpha: 0.7 });

    new ResizeObserver(() => { if (running) measure(); }).observe(glass);
    window.addEventListener("resize", () => { if (running) measure(); }, { passive: true });
  }

  function measure() {
    const rect = glass.getBoundingClientRect();
    BW = document.documentElement.clientWidth;
    H = rect.height;
    bandLeft = rect.left;
    bandTop = rect.top + window.scrollY;
    BH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    CX = BW * PLANET_X;
    CY = bandTop + H * PLANET_Y;
    PR = Math.min(H * PLANET_R, BW * 0.32);
    R = BW * RING_R;
    RY = R * RING_FLAT;
    [back, front].forEach((c) => {
      c.width = Math.max(1, Math.ceil(BW / SCALE));
      c.height = Math.max(1, Math.ceil(BH / SCALE));
      c.style.left = `${-bandLeft}px`;
      c.style.top = `${-bandTop}px`;
      c.style.width = `${BW}px`;
      c.style.height = `${BH}px`;
    });

    sky.width = Math.max(1, Math.ceil(window.innerWidth / SCALE));
    sky.height = Math.max(1, Math.ceil(window.innerHeight / SCALE));
    const r = rng(42);
    const count = Math.round((sky.width * sky.height) / 130);
    stars = Array.from({ length: count }, () => ({
      x: Math.floor(r() * sky.width),
      y: Math.floor(r() * sky.height),
      b: 0.15 + r() * 0.6,
      twinkle: r() < 0.3,
      phase: r() * TAU,
      warm: r() < 0.35,
    }));
  }

  function focus(i, instant) {
    const desired = FRONT - i * STEP;
    let d = (((desired - target) % TAU) + TAU) % TAU;
    if (d > Math.PI) d -= TAU;
    target += d;
    if (instant || reduced) ring = target;
  }

  // A point on the tilted ring, in band coordinates.
  function ringPoint(ang, scale = 1) {
    const lx = Math.cos(ang) * R * scale;
    const ly = Math.sin(ang) * RY * scale;
    return [CX + lx * COS_T - ly * SIN_T, CY + lx * SIN_T + ly * COS_T];
  }

  function layout(a) {
    items.forEach((li, i) => {
      const ang = a + i * STEP;
      const sn = Math.sin(ang);
      const depth = (sn + 1) / 2;
      const [bx, by] = ringPoint(ang);
      const x = bx - bandLeft;
      const y = by - bandTop;
      const s = 0.46 + 0.54 * depth;
      li.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      // Back half goes under the planet canvas (z 5), front half over it.
      li.style.zIndex = sn < 0 ? String(1 + Math.round(depth * 3)) : String(6 + Math.round(depth * 10));
      li.style.filter = `brightness(${(0.4 + 0.6 * depth).toFixed(2)})`;
    });
  }

  function drawPlanet(t) {
    const pr = Math.max(4, Math.round(PR / SCALE));
    const size = pr * 2 + 1;
    const img = fctx.createImageData(size, size);
    const d = img.data;
    const rot = reduced ? 0 : t * 0.00022;
    for (let py = -pr; py <= pr; py++) {
      for (let px = -pr; px <= pr; px++) {
        const rr = px * px + py * py;
        if (rr > pr * pr) continue;
        const nx = px / pr;
        const ny = py / pr;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lon = Math.atan2(nx, nz) + rot;
        const b = Math.sin(ny * 10 + Math.sin(lon * 3 + ny * 4) * 0.7);
        const band = b < -0.6 ? 0 : b < -0.1 ? 1 : b < 0.35 ? 2 : b < 0.75 ? 1 : 3;
        const lit = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        const v = lit + BAYER[((py + pr) & 3) * 4 + ((px + pr) & 3)] * 0.22;
        const col = v < 0.12 ? NIGHT : BANDS[band];
        const f = v < 0.12 ? 1 : v < 0.42 ? 0.5 : v < 0.7 ? 0.78 : 1;
        const o = ((py + pr) * size + (px + pr)) * 4;
        d[o] = col[0] * f;
        d[o + 1] = col[1] * f;
        d[o + 2] = col[2] * f;
        d[o + 3] = 255;
      }
    }
    fctx.putImageData(img, Math.round(CX / SCALE) - pr, Math.round(CY / SCALE) - pr);
  }

  function drawDust(a, t) {
    const spin = reduced ? 0 : t * 0.00004;
    dust.forEach((p) => {
      const phi = p.a + a + spin;
      const sn = Math.sin(phi);
      const ctx = sn < 0 ? bctx : fctx;
      const [bx, by] = ringPoint(phi, p.rad);
      const x = Math.floor(bx / SCALE);
      const y = Math.floor(by / SCALE);
      ctx.fillStyle = `rgba(${p.c}, ${(p.alpha * (0.55 + 0.45 * (sn + 1) / 2)).toFixed(2)})`;
      ctx.fillRect(x, y, p.size, p.size);
    });
  }

  let comet = null;
  function drawSky(t) {
    sctx.clearRect(0, 0, sky.width, sky.height);
    stars.forEach((s) => {
      const a = s.twinkle && !reduced ? s.b * (0.45 + 0.55 * Math.sin(t * 0.003 + s.phase)) : s.b;
      sctx.fillStyle = s.warm ? `rgba(255, 214, 170, ${a.toFixed(2)})` : `rgba(235, 240, 255, ${a.toFixed(2)})`;
      sctx.fillRect(s.x, s.y, 1, 1);
    });
    // Now and then a shooting star crosses the top of the sky.
    if (!reduced && !comet && Math.random() < 0.004) {
      comet = { x: Math.random() * sky.width, y: Math.random() * sky.height * 0.4, life: 14 };
    }
    if (comet) {
      for (let k = 0; k < 8; k++) {
        sctx.fillStyle = `rgba(255, 240, 220, ${(0.8 - k * 0.1).toFixed(2)})`;
        sctx.fillRect(Math.round(comet.x - k * 2), Math.round(comet.y - k), 1, 1);
      }
      comet.x += 4;
      comet.y += 2;
      if (--comet.life <= 0) comet = null;
    }
  }

  function draw(t, a) {
    bctx.clearRect(0, 0, back.width, back.height);
    fctx.clearRect(0, 0, front.width, front.height);
    drawPlanet(t);
    drawDust(a, t);
    drawSky(t);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    ring += (target - ring) * 0.075;
    if (Math.abs(target - ring) < 0.0005) ring = target;
    const a = ring + (reduced ? 0 : Math.sin(now / 3800) * 0.035);
    layout(a);
    if (now - lastDraw >= DRAW_MS) {
      lastDraw = now;
      draw(now, a);
    }
  }

  function start(i) {
    if (!glass) init();
    running = true;
    measure();
    focus(i, true);
    layout(ring);
    draw(performance.now(), ring);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!glass) return;
    running = false;
    cancelAnimationFrame(raf);
    items.forEach((li) => { li.style.transform = ""; li.style.zIndex = ""; li.style.filter = ""; });
    [bctx, fctx, sctx].forEach((ctx) => ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height));
  }

  return {
    start,
    stop,
    focus: (i) => { if (running) focus(i); },
  };
})();
