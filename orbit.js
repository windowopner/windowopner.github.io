// Space theme: the six discs ride a tilted ring around a pixel planet.
// Selecting a disc turns the ring until that disc sits at the front.
// Planet, ring dust, and stars are drawn at a third of the size and scaled up pixelated.
window.Orbit = (() => {
  const TAU = Math.PI * 2;
  const STEP = TAU / 6;
  const FRONT = Math.PI / 2; // angle where a disc is nearest the viewer
  const SCALE = 3;
  const DRAW_MS = 1000 / 15;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let glass, items, back, front, sky, bctx, fctx, sctx;
  let running = false;
  let raf = 0;
  let ring = FRONT;
  let target = FRONT;
  let lastDraw = 0;
  let W = 0, H = 0, CX = 0, CY = 0, R = 0, RY = 0;
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
  const LIGHT = (() => { const l = [-0.55, -0.45, 0.7]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
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
    // Ring dust in a few bands with a gap, like a gas giant's rings.
    for (let k = 0; k < 700; k++) {
      let rad = 0.7 + r() * 0.55;
      if (rad > 0.92 && rad < 0.98) rad += 0.07;
      dust.push({ a: r() * TAU, rad, c: DUST_COLORS[Math.floor(r() * DUST_COLORS.length)], size: r() < 0.12 ? 2 : 1, alpha: 0.5 + r() * 0.5 });
    }
    // The disc track itself, as an evenly dotted line.
    for (let k = 0; k < 120; k++) dust.push({ a: (k / 120) * TAU, rad: 1, c: DUST_COLORS[0], size: 1, alpha: 0.6 });

    new ResizeObserver(() => { if (running) measure(); }).observe(glass);
    window.addEventListener("resize", () => { if (running) measure(); }, { passive: true });
  }

  function measure() {
    const rect = glass.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    CX = W / 2;
    CY = H * 0.5;
    R = Math.min(W * 0.43, H * 1.2);
    RY = R * 0.26;
    [back, front].forEach((c) => { c.width = Math.max(1, Math.ceil(W / SCALE)); c.height = Math.max(1, Math.ceil(H / SCALE)); });

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

  function layout(a) {
    items.forEach((li, i) => {
      const ang = a + i * STEP;
      const sn = Math.sin(ang);
      const depth = (sn + 1) / 2;
      const x = CX + Math.cos(ang) * R;
      const y = CY + sn * RY;
      const s = 0.46 + 0.54 * depth;
      li.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      // Back half goes under the planet canvas (z 5), front half over it.
      li.style.zIndex = sn < 0 ? String(1 + Math.round(depth * 3)) : String(6 + Math.round(depth * 10));
      li.style.filter = `brightness(${(0.4 + 0.6 * depth).toFixed(2)})`;
    });
  }

  function drawPlanet(t) {
    const pr = Math.max(4, Math.round((R * 0.34) / SCALE));
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
      const x = Math.floor((CX + Math.cos(phi) * R * p.rad) / SCALE);
      const y = Math.floor((CY + sn * RY * p.rad) / SCALE);
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
