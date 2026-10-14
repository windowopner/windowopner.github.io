// The disc carousel. Each project is a real-feeling CD: a mirrored data layer with a
// thin-film (iridescent) sheen, a clear polycarbonate hub, and a printed label in ink.
// Reflections come from a small studio of strip lights baked into an environment map,
// which is what makes the colours sweep across the disc as it turns.
//
// create(canvas, opts) -> { setIndex, setLabel, intro, dispose }
//   opts.count           number of discs
//   opts.label(i, ctx)   draws disc i's label onto a 1024px canvas
//   opts.onSelect(i)     a disc was chosen by dragging or clicking a neighbour
//   opts.onActivate()    the front disc was clicked
//   opts.holdIntro       wait for intro() before the discs rise into place

import * as THREE from "three";

const TAU = Math.PI * 2;
const SPACING = 2.45;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A pale studio, like the page around it, with bright softboxes and a few black flags.
// The flags are what give the mirror its dark bands; the thin-film sheen shows up as
// colour where those bands meet the light. Baked once into a PMREM environment.
function studio(renderer) {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0xc4cad3, side: THREE.BackSide }),
  ));
  const panel = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(16, 2.4, 0xffffff, 7, [0, 9, 5]);        // long overhead strip
  panel(3.2, 11, 0xffffff, 5, [-10, 2, 4]);      // tall left
  panel(3.2, 11, 0xe6eeff, 4, [10, -1, 5]);      // tall right, a touch cool
  panel(10, 1.4, 0xfff1e6, 3, [0, -9, 6]);       // floor bounce, a touch warm
  panel(5, 12, 0x0b0c0f, 1, [-5, 0, 11]);        // black flag behind the camera, left
  panel(3, 12, 0x0b0c0f, 1, [6, 1, 10]);         // black flag behind the camera, right
  panel(18, 2, 0x0b0c0f, 1, [0, -4, -12]);       // dark horizon line behind the discs
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.015).texture;
  pmrem.dispose();
  return env;
}

// Fine concentric grooves, used as a bump map so highlights break into rings.
function grooves() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  for (let r = 150; r < size / 2; r += 1.6) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, TAU);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// How thick the thin film is, varying around the disc. A real CD splits light into two
// rainbow fans on opposite sides; feeding this into the iridescence thickness makes the
// colour change with angle, so the rainbow turns as the disc spins.
function filmThickness() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g.createConicGradient) return null;
  const grad = g.createConicGradient(0.4, size / 2, size / 2);
  const stops = [0.15, 0.85, 0.35, 1, 0.1, 0.8, 0.3, 0.95, 0.15];
  stops.forEach((v, k) => grad.addColorStop(k / (stops.length - 1), `rgb(${v * 255},${v * 255},${v * 255})`));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// A flat annulus with a little thickness, facing +Z. UVs map the disc onto a square.
function annulus(inner, outer, depth) {
  const shape = new THREE.Shape().absarc(0, 0, outer, 0, TAU, false);
  shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, TAU, true));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments: 128, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: 0.004, bevelSegments: 2,
  });
  geo.translate(0, 0, -depth / 2);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2 + 0.5, pos.getY(i) / 2 + 0.5);
  return geo;
}

export function create(canvas, { count, label, onSelect, onActivate, holdIntro = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = studio(renderer);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0, 7.4);

  const groove = grooves();
  const DEPTH = 0.024;
  const dataGeo = annulus(0.3, 1, DEPTH);
  const hubGeo = annulus(0.075, 0.3, DEPTH * 0.9);
  // RingGeometry's UVs already map the ring onto a square, so a square label canvas fits.
  const labelGeo = new THREE.RingGeometry(0.315, 0.985, 160, 1);

  const dataMat = new THREE.MeshPhysicalMaterial({
    color: 0xd9dee6,
    metalness: 1,
    roughness: 0.1,
    iridescence: 1,
    iridescenceIOR: 2.1,
    iridescenceThicknessRange: [120, 1200],
    iridescenceThicknessMap: filmThickness(),
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    bumpMap: groove,
    bumpScale: 0.06,
    envMapIntensity: 1.35,
  });
  // Clear polycarbonate. Plain transparency rather than transmission: the canvas is
  // see-through, and transmission would only refract an empty buffer.
  const hubMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef2f7,
    metalness: 0,
    roughness: 0.04,
    transparent: true,
    opacity: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
  });

  const discs = [];
  const labelCanvases = [];
  for (let i = 0; i < count; i++) {
    const group = new THREE.Group();
    const spin = new THREE.Group(); // spins about the disc's own axis
    group.add(spin);

    spin.add(new THREE.Mesh(dataGeo, dataMat));
    spin.add(new THREE.Mesh(hubGeo, hubMat));

    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    labelCanvases.push(c);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const ink = new THREE.Mesh(labelGeo, new THREE.MeshPhysicalMaterial({
      map: tex,
      transparent: true,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.6,
      depthWrite: false,
    }));
    // Sits just above the top face, including the bevel (a quarter of the depth).
    ink.position.z = DEPTH * 0.75 + 0.003;
    spin.add(ink);

    group.userData = { i, spin, tex, angle: Math.random() * TAU };
    scene.add(group);
    discs.push(group);
    drawLabel(i);
  }

  function drawLabel(i) {
    const c = labelCanvases[i];
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    label(i, ctx, c.width);
    discs[i].userData.tex.needsUpdate = true;
  }

  // ── State ───────────────────────────────────────────────────────────
  let target = 0;        // selected index
  let pos = 0;           // where the carousel actually is (float), springs to target
  let vel = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let dragMoved = 0;
  // Entrance: discs rise into place. Held at the start while the opening card is up.
  let introT = reduceMotion ? 1 : 0;
  let introPlaying = !holdIntro;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  function layout() {
    for (const d of discs) {
      const { i, spin } = d.userData;
      const k = i - pos;                       // distance from the front, in discs
      const a = Math.min(1, Math.abs(k));
      const e = 1 - (1 - introT) ** 3;
      d.position.set(k * SPACING, -0.04 * k * k + (1 - e) * -1.4, -Math.abs(k) * 1.15);
      const s = (1 - a * 0.3) * (0.82 + 0.18 * e);
      d.scale.setScalar(s);
      // A24-style tilt: the disc leans back and turns toward the centre.
      d.rotation.set(
        -0.62 + tilt.y * 0.16 + (1 - e) * -0.9,
        -0.32 * Math.sign(k) * a + 0.18 + tilt.x * 0.22,
        0.06,
      );
      if (!reduceMotion) {
        const speed = Math.abs(k) < 0.5 ? 0.35 : 0.12;
        d.userData.angle = (d.userData.angle + speed * 0.016) % TAU;
      }
      spin.rotation.z = d.userData.angle;
      d.visible = Math.abs(k) < 3.2;
    }
  }

  // ── Render loop (stops when hidden or off-screen) ───────────────────
  let frame = 0;
  let running = false;
  let visible = true;
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) {
      // Critically damped spring toward the selected disc.
      const k = 90;
      const c = 2 * Math.sqrt(k);
      vel += (k * (target - pos) - c * vel) * dt;
      pos += vel * dt;
      if (Math.abs(target - pos) < 0.0005 && Math.abs(vel) < 0.0005) { pos = target; vel = 0; }
    }
    if (introPlaying && introT < 1) introT = Math.min(1, introT + dt / 1.6);
    tilt.x += (tilt.tx - tilt.x) * 0.06;
    tilt.y += (tilt.ty - tilt.y) * 0.06;
    layout();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the front disc about the same size whether the stage is wide or tall.
    camera.position.z = 7.4 * Math.max(1, 1.05 / camera.aspect);
    camera.updateProjectionMatrix();
    if (!running) { layout(); renderer.render(scene, camera); }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start(); else stop();
  });
  io.observe(canvas);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);

  // ── Pointer: tilt on hover, drag to scrub, click to pick ────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(event) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(discs, true)[0];
    let o = hit?.object;
    while (o && !discs.includes(o)) o = o.parent;
    return o ? o.userData.i : -1;
  }

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (dragging) {
      const dx = (e.clientX - dragStartX) / r.width;
      dragMoved = Math.max(dragMoved, Math.abs(e.clientX - dragStartX));
      pos = Math.max(-0.4, Math.min(count - 0.6, dragStartPos - dx * 2.2));
    } else if (e.pointerType === "mouse") {
      canvas.style.cursor = pick(e) >= 0 ? "pointer" : "grab";
    }
  });
  canvas.addEventListener("pointerleave", () => { tilt.tx = 0; tilt.ty = 0; });
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartPos = pos;
    dragMoved = 0;
    vel = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
    if (dragMoved < 6) {
      const i = pick(e);
      if (i === target) onActivate?.();
      else if (i >= 0) onSelect?.(i);
      return;
    }
    const next = Math.max(0, Math.min(count - 1, Math.round(pos)));
    if (next !== target) onSelect?.(next);
    else target = next;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  start();

  return {
    setIndex(i) { target = i; if (reduceMotion) { pos = i; vel = 0; } },
    setLabel: drawLabel,
    intro() { introPlaying = true; },
    dispose() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.dispose();
    },
  };
}
