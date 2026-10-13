// Space theme: the discs ride a tilted ring around a pixel planet.
// The planet hangs off the left edge of the screen and the ring sweeps across it,
// so only some discs are in frame at once. Selecting a disc turns the ring until
// that disc reaches the front slot, low and just left of centre.
// The ring can also be grabbed and spun; on release it coasts and settles on the
// nearest disc. Planet, ring dust, and stars are drawn at a third of the size and
// scaled up pixelated.
window.Orbit = (() => {
  const TAU = Math.PI * 2;
  let STEP = TAU / 6; // set from the number of discs on first start
  const FRONT = (62 * Math.PI) / 180; // ring angle of the selected slot
  // Disc i sits at ring - i * STEP, so the next disc waits to the right of the front slot.

  // Composition, as fractions of the stage: planet off the left edge, a wide ring tilted up to the right.
  const PLANET_X = 0.045; // of viewport width
  const PLANET_Y = 0.52;  // of stage height
  const PLANET_R = 0.62;  // of stage height
  const RING_R = 0.86;    // of viewport width
  const RING_FLAT = 0.14; // ring height as a share of its width
  const RING_TILT = (-4 * Math.PI) / 180;
  let SCALE = 3;       // canvas pixels are SCALE css pixels wide; set by quality
  let smooth = 0;      // 0..1, how far toward the cinematic look (no dithering, depth of field)
  const PLANET_MS = 1000 / 12; // the planet turns slowly, so it redraws less often
  const SKY_MS = 1000 / 15;

  // Ring spring: slightly under-damped, so it settles with a hint of overshoot.
  const STIFFNESS = 38;
  const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.82;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  let glass, items, back, front, sky, bctx, fctx, sctx, planetCanvas, pctx;
  let running = false;
  let raf = 0;
  let ring = FRONT;
  let target = FRONT;
  let velocity = 0;
  let lastFrame = 0;
  let lastPlanet = -Infinity;
  let lastSky = -Infinity;
  // Positions are worked out across the whole page ("band": full width, full height),
  // so the planet can run off the screen edge and sit behind the header and console.
  // Disc positions are shifted back into the stage's own coordinates.
  let BW = 0, BH = 0, H = 0, bandLeft = 0, bandTop = 0, CX = 0, CY = 0, R = 0, RY = 0, PR = 0;
  const COS_T = Math.cos(RING_TILT);
  const SIN_T = Math.sin(RING_TILT);
  const dust = [];
  let stars = [];

  // Pointer parallax, eased toward where the pointer is.
  const par = { x: 0, y: 0, tx: 0, ty: 0 };

  // Dragging the ring.
  const drag = { active: false, id: null, startX: 0, startRing: 0, lastX: 0, lastT: 0, vel: 0, moved: false };

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
  const RIM = hex("#ffe2b8");
  const LIGHT = (() => { const l = [0.62, -0.42, 0.66]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
  const DUST_COLORS = ["255, 226, 184", "227, 163, 92", "200, 120, 80", "240, 236, 224"];

  function init() {
    glass = document.querySelector(".glass");
    items = [...document.querySelectorAll("#discs > li")];
    STEP = TAU / items.length;
    back = document.getElementById("orbit-back");
    front = document.getElementById("orbit-front");
    sky = document.getElementById("sky");
    bctx = back.getContext("2d");
    fctx = front.getContext("2d");
    sctx = sky.getContext("2d");
    planetCanvas = document.createElement("canvas");
    pctx = planetCanvas.getContext("2d");

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

    if (finePointer && !reduced) {
      window.addEventListener("pointermove", (e) => {
        par.tx = (e.clientX / window.innerWidth) * 2 - 1;
        par.ty = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });
    }

    glass.addEventListener("pointerdown", onDown);
    glass.addEventListener("pointermove", onMove);
    glass.addEventListener("pointerup", onUp);
    glass.addEventListener("pointercancel", onUp);
    // A drag should not also count as a click on the disc under the pointer.
    glass.addEventListener("click", (e) => {
      if (drag.moved) { e.stopPropagation(); e.preventDefault(); drag.moved = false; }
    }, true);
  }

  function measure() {
    // Measure without the parallax offset, so it never leaks into the layout.
    const rect = glass.getBoundingClientRect();
    BW = document.documentElement.clientWidth;
    H = rect.height;
    bandLeft = rect.left - par.x * 12;
    bandTop = rect.top + window.scrollY - par.y * 8;
    BH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    CX = BW * PLANET_X;
    CY = bandTop + H * PLANET_Y;
    PR = Math.min(H * PLANET_R, BW * 0.32);
    R = BW * RING_R;
    RY = Math.min(R * RING_FLAT, H * 0.34); // flatten further when the stage is short
    [back, front].forEach((c) => {
      c.width = Math.max(1, Math.ceil(BW / SCALE));
      c.height = Math.max(1, Math.ceil(BH / SCALE));
      c.style.left = `${-bandLeft}px`;
      c.style.top = `${-bandTop}px`;
      c.style.width = `${BW}px`;
      c.style.height = `${BH}px`;
    });

    const pr = Math.max(4, Math.round(PR / SCALE));
    planetCanvas.width = planetCanvas.height = pr * 2 + 1;
    lastPlanet = -Infinity;

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
    lastSky = -Infinity;
  }

  function focus(i, instant) {
    const desired = FRONT + i * STEP;
    let d = (((desired - target) % TAU) + TAU) % TAU;
    if (d > Math.PI) d -= TAU;
    target += d;
    if (instant || reduced) { ring = target; velocity = 0; }
  }

  // A point on the tilted ring, in band coordinates.
  function ringPoint(ang, scale = 1) {
    const lx = Math.cos(ang) * R * scale;
    const ly = Math.sin(ang) * RY * scale;
    return [CX + lx * COS_T - ly * SIN_T, CY + lx * SIN_T + ly * COS_T];
  }

  function layout(a) {
    items.forEach((li, i) => {
      const ang = a - i * STEP;
      const sn = Math.sin(ang);
      const depth = (sn + 1) / 2;
      const [bx, by] = ringPoint(ang);
      const x = bx - bandLeft;
      const y = by - bandTop;
      const s = 0.46 + 0.54 * depth;
      li.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      // Back half goes under the planet canvas (z 5), front half over it.
      li.style.zIndex = sn < 0 ? String(1 + Math.round(depth * 3)) : String(6 + Math.round(depth * 10));
      li.style.setProperty("--shade", (0.6 * (1 - depth)).toFixed(3));
      // Cinematic depth of field: discs at the back go soft.
      const blur = smooth > 0 ? (1 - depth) * 3.2 * smooth : 0;
      li.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : "";
    });
  }

  // Planet into its own small canvas; it is blitted onto the front layer every frame.
  function paintPlanet(t) {
    const pr = (planetCanvas.width - 1) / 2;
    const size = planetCanvas.width;
    const img = pctx.createImageData(size, size);
    const d = img.data;
    const rot = reduced ? 0 : t * 0.00022;
    const rimIn = (pr - 1.6) * (pr - 1.6);
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
        let col, f;
        if (smooth > 0.5) {
          // Cinematic: continuous falloff into the night side, no dither.
          col = BANDS[band];
          f = Math.min(1, 0.06 + lit * 1.05);
        } else {
          const v = lit + BAYER[((py + pr) & 3) * 4 + ((px + pr) & 3)] * 0.22;
          col = v < 0.12 ? NIGHT : BANDS[band];
          f = v < 0.12 ? 1 : v < 0.42 ? 0.5 : v < 0.7 ? 0.78 : 1;
        }
        // Thin atmosphere: a bright rim along the lit edge.
        if (rr > rimIn && lit > 0.18) { col = RIM; f = 0.55 + lit * 0.45; }
        const o = ((py + pr) * size + (px + pr)) * 4;
        d[o] = col[0] * f;
        d[o + 1] = col[1] * f;
        d[o + 2] = col[2] * f;
        d[o + 3] = 255;
      }
    }
    pctx.putImageData(img, 0, 0);
  }

  let dustSize = 1;
  function drawDust(a, t) {
    const spin = reduced ? 0 : t * 0.00004;
    dust.forEach((p) => {
      const phi = p.a + a + spin;
      const sn = Math.sin(phi);
      const ctx = sn < 0 ? bctx : fctx;
      const [bx, by] = ringPoint(phi, p.rad);
      ctx.globalAlpha = p.alpha * (0.55 + 0.45 * (sn + 1) / 2);
      ctx.fillStyle = `rgb(${p.c})`;
      const size = p.size * dustSize;
      ctx.fillRect(Math.floor(bx / SCALE), Math.floor(by / SCALE), size, size);
    });
    bctx.globalAlpha = 1;
    fctx.globalAlpha = 1;
  }

  let comet = null;
  function drawSky(t) {
    sctx.clearRect(0, 0, sky.width, sky.height);
    stars.forEach((s) => {
      const a = s.twinkle && !reduced ? s.b * (0.45 + 0.55 * Math.sin(t * 0.003 + s.phase)) : s.b;
      sctx.fillStyle = s.warm ? `rgba(255, 214, 170, ${a.toFixed(2)})` : `rgba(235, 240, 255, ${a.toFixed(2)})`;
      sctx.fillRect(s.x, s.y, dustSize, dustSize);
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
    if (t - lastPlanet >= PLANET_MS) { lastPlanet = t; paintPlanet(t); }
    bctx.clearRect(0, 0, back.width, back.height);
    fctx.clearRect(0, 0, front.width, front.height);
    const pr = (planetCanvas.width - 1) / 2;
    fctx.drawImage(planetCanvas, Math.round(CX / SCALE) - pr, Math.round(CY / SCALE) - pr);
    drawDust(a, t);
    if (t - lastSky >= SKY_MS) { lastSky = t; drawSky(t); }
  }

  function step(now) {
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    if (!drag.active) {
      // Time-based spring toward the target angle.
      const accel = STIFFNESS * (target - ring) - DAMPING * velocity;
      velocity += accel * dt;
      ring += velocity * dt;
      if (Math.abs(target - ring) < 0.0004 && Math.abs(velocity) < 0.0004) { ring = target; velocity = 0; }
    }
    if (finePointer && !reduced) {
      const k = Math.min(1, dt * 3);
      par.x += (par.tx - par.x) * k;
      par.y += (par.ty - par.y) * k;
      glass.style.setProperty("--par-x", `${(-par.x * 12).toFixed(2)}px`);
      glass.style.setProperty("--par-y", `${(-par.y * 8).toFixed(2)}px`);
      sky.style.setProperty("--sky-x", `${(-par.x * 5).toFixed(2)}px`);
      sky.style.setProperty("--sky-y", `${(-par.y * 3).toFixed(2)}px`);
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) { lastFrame = 0; return; }
    step(now);
    const a = ring + (reduced ? 0 : Math.sin(now / 3800) * 0.03);
    layout(a);
    draw(now, a);
  }

  // Dragging: horizontal pointer travel turns the ring under the pointer.
  function angleFor(dx) {
    // Near the front slot a disc moves about R * sin(FRONT) pixels per radian.
    return -dx / (R * Math.sin(FRONT));
  }

  function onDown(e) {
    if (!running || e.button > 0) return;
    drag.active = false;
    drag.id = e.pointerId;
    drag.startX = drag.lastX = e.clientX;
    drag.startRing = ring;
    drag.lastT = performance.now();
    drag.vel = 0;
    drag.moved = false;
  }

  function onMove(e) {
    if (drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) < 6) return;
      drag.active = true;
      drag.moved = true;
      drag.startX = e.clientX;
      drag.startRing = ring;
      velocity = 0;
      glass.setPointerCapture(e.pointerId);
      glass.classList.add("dragging");
      return;
    }
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT) / 1000;
    const nextRing = drag.startRing + angleFor(e.clientX - drag.startX);
    drag.vel = drag.vel * 0.6 + ((nextRing - ring) / dt) * 0.4;
    ring = target = nextRing;
    drag.lastX = e.clientX;
    drag.lastT = now;
  }

  function onUp(e) {
    if (drag.id !== e.pointerId) return;
    drag.id = null;
    if (!drag.active) return;
    drag.active = false;
    glass.classList.remove("dragging");
    // Carry the flick, project where it would coast to, and settle on the nearest disc.
    velocity = Math.max(-12, Math.min(12, drag.vel));
    const projected = ring + velocity * 0.22;
    const n = Math.round((projected - FRONT) / STEP);
    const count = items.length;
    const i = ((n % count) + count) % count;
    target = FRONT + n * STEP;
    if (api.onSelect) api.onSelect(i);
  }

  function start(i) {
    if (!glass) init();
    running = true;
    measure();
    focus(i, true);
    lastFrame = 0;
    layout(ring);
    draw(performance.now(), ring);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!glass) return;
    running = false;
    cancelAnimationFrame(raf);
    items.forEach((li) => { li.style.transform = ""; li.style.zIndex = ""; li.style.filter = ""; li.style.removeProperty("--shade"); });
    glass.style.removeProperty("--par-x");
    glass.style.removeProperty("--par-y");
    [bctx, fctx, sctx].forEach((ctx) => ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height));
  }

  const api = {
    start,
    stop,
    focus: (i) => { if (running) focus(i); },
    // Throw the ring back by part of a turn so the spring sweeps it in (used by the intro).
    kick: (turns) => { if (running && !reduced) { ring -= TAU * turns; velocity = 0; } },
    // 0 = chunky pixels, 0.4 = the original look, 1 = smooth and cinematic.
    setQuality: (q) => {
      const next = q <= 0.4 ? 6 - 3 * (q / 0.4) : 3 - 1.75 * ((q - 0.4) / 0.6);
      SCALE = Math.round(next * 4) / 4;
      smooth = Math.max(0, (q - 0.6) / 0.4);
      dustSize = Math.max(1, Math.round(3 / SCALE));
      if (running) { measure(); lastPlanet = -Infinity; lastSky = -Infinity; }
    },
    onSelect: null,
  };
  return api;
})();
