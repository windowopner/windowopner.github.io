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
import { Reflector } from "three/addons/objects/Reflector.js";

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

// The floor the discs float over: a faint mirror plus a perspective grid, both fading out
// toward the horizon. Reflector supplies the mirrored render; this shader decides how much
// of it shows and draws the grid on top.
const FloorShader = {
  name: "ArchiveFloor",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    ink: { value: new THREE.Color(0x16181d) },
    // Where a disc last landed (xz) and how long ago, in seconds.
    ripple: { value: new THREE.Vector3(0, 0, 99) },
    // Where the pointer meets the floor (xz), and how present it is (0-1).
    pointer: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform vec3 ink;
    uniform vec3 ripple;
    uniform vec3 pointer;
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    float gridLine(vec2 p) {
      vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      #include <logdepthbuf_fragment>
      // Strongest under the front disc, gone by the horizon and toward the camera.
      float d = length(vWorld.xz * vec2(0.6, 1.0));
      float fade = (1.0 - smoothstep(1.2, 7.5, d)) * (1.0 - smoothstep(0.4, 2.4, vWorld.z));
      // A ring runs out across the grid when a disc lands, and the grid wakes up near the pointer.
      float r = length(vWorld.xz - ripple.xy);
      float front = ripple.z * 3.4;
      float ring = exp(-pow((r - front) / 0.22, 2.0)) * exp(-ripple.z * 1.6);
      float glow = exp(-pow(length(vWorld.xz - pointer.xy) / 1.1, 2.0)) * pointer.z;
      float boost = 1.0 + ring * 3.0 + glow * 1.6;
      float line = gridLine(vWorld.xz * 1.6) * 0.11 * fade * boost + ring * 0.05 * fade;
      vec4 mirror = texture2DProj(tDiffuse, vUv);
      float m = mirror.a * 0.26 * fade;
      vec3 rgb = mix(ink, mirror.rgb, m / max(m + line, 1e-4));
      gl_FragColor = vec4(rgb, clamp(m + line, 0.0, 1.0));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// A soft round shadow, drawn once and laid on the floor under each disc.
function shadowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(22,24,29,0.55)");
  grad.addColorStop(0.45, "rgba(22,24,29,0.22)");
  grad.addColorStop(1, "rgba(22,24,29,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
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

export function create(canvas, { count, label, onSelect, onActivate, onFrame, onProgress, onDetent, onGrab, holdIntro = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = studio(renderer);
  // Discs further back fade into the paper colour, which reads as depth.
  scene.fog = new THREE.Fog(0xeef1f4, 8, 14.5);
  onProgress?.(0.85);
  const CAMERA_Z = 6.3;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

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

  const floor = new Reflector(new THREE.PlaneGeometry(40, 40), {
    shader: FloorShader,
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    multisample: 0,
  });
  floor.material.transparent = true;
  floor.material.depthWrite = false;
  floor.material.extensions = { derivatives: true };
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.92;
  scene.add(floor);

  // Contact shadows sit just above the floor. They're hidden while the mirror renders,
  // so the floor doesn't reflect its own shadows.
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, fog: false });
  const shadowGeo = new THREE.PlaneGeometry(2.6, 2.6);
  const shadows = [];
  const mirrorRender = floor.onBeforeRender;
  floor.onBeforeRender = (...args) => {
    shadows.forEach((sh) => { sh.visible = false; });
    mirrorRender(...args);
    shadows.forEach((sh) => { sh.visible = true; });
  };

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

    const shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;
    scene.add(shadow);
    shadows.push(shadow);

    group.userData = { i, spin, tex, shadow, angle: Math.random() * TAU, spinV: 0.2 };
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
  let dragVel = 0;       // carousel units per second while dragging, for the flick
  let lastDragX = 0;
  let lastDragT = 0;
  let envDrift = 0;
  let speed = 0;         // smoothed carousel velocity, for leaning into the turn
  let lastDetent = 0;    // last whole disc the carousel passed, for haptic ticks
  let rippleT = 99;
  const ripple = floor.material.uniforms.ripple.value;
  const pointerFloor = floor.material.uniforms.pointer.value;
  // Press and hold the front disc to grab it like a record.
  let holdTimer = 0;
  let grabbed = false;
  let grabAngle = 0;
  let grabVel = 0;
  let grabT = 0;

  // Effects on the front disc. Each eases toward its target.
  const fx = { hover: 0, hoverT: 0, flip: 0, flipT: 0, push: 0, pushT: 0, wobble: 0, press: 0, pressT: 0 };
  let pushTimer = 0;
  const ease = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));

  function layout(dt = 0.016, time = 0) {
    for (const d of discs) {
      const { i, spin, shadow } = d.userData;
      const k = i - pos;                       // distance from the front, in discs
      const a = Math.min(1, Math.abs(k));
      const e = 1 - (1 - introT) ** 3;
      const front = i === target;
      const lift = front ? fx.hover * 0.08 + fx.push * 0.12 - fx.press * 0.05 : 0;
      const z = -Math.abs(k) * 1.15 + (front ? fx.push * 1.1 : 0);
      d.position.set(k * SPACING, -0.04 * k * k + (1 - e) * -1.4 + lift, z);
      const s = (1 - a * 0.3) * (0.82 + 0.18 * e);
      d.scale.setScalar(s);
      // A24-style tilt: the disc leans back and turns toward the centre. A sealed disc
      // flips over to show its data side; a refused code makes it shudder.
      // Discs lean into the turn while the carousel moves, like they have weight.
      const lean = Math.max(-1, Math.min(1, speed / 6));
      d.rotation.set(
        -0.62 + tilt.y * 0.16 + (1 - e) * -0.9 + (front ? fx.flip : 0) + Math.abs(lean) * 0.08,
        -0.32 * Math.sign(k) * a + 0.18 + tilt.x * 0.22 - lean * 0.28,
        0.06 + (front ? Math.sin(time * 0.03) * fx.wobble * 0.14 : 0) + lean * 0.1,
      );
      if (front && grabbed) {
        // Held: the disc turns only with your hand.
      } else if (!reduceMotion) {
        // Spin relaxes back to a slow idle after a burst.
        const idle = Math.abs(k) < 0.5 ? 0.35 : 0.12;
        d.userData.spinV = ease(d.userData.spinV, idle, 1.1, dt);
        d.userData.angle = (d.userData.angle + d.userData.spinV * dt) % TAU;
      }
      spin.rotation.z = d.userData.angle;
      d.visible = Math.abs(k) < 3.2;

      // Shadow: under the disc, softer and wider the higher it floats.
      const height = d.position.y - floor.position.y;
      shadow.position.set(d.position.x, floor.position.y + 0.004, d.position.z);
      shadow.scale.setScalar(s * (0.9 + height * 0.35));
      shadow.material.opacity = (front ? 0.85 : 0.55) * (1 - a * 0.4) * e / (0.6 + height * 0.8);
      shadow.visible = d.visible;
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
    fx.hover = ease(fx.hover, fx.hoverT, 8, dt);
    fx.flip = ease(fx.flip, fx.flipT, 7, dt);
    fx.push = ease(fx.push, fx.pushT, 9, dt);
    fx.wobble = ease(fx.wobble, 0, 3.5, dt);
    fx.press = ease(fx.press, fx.pressT, 12, dt);
    speed = ease(speed, dragging ? dragVel : vel, 10, dt);
    rippleT += dt;
    ripple.z = rippleT;
    // One tick each time the carousel passes a disc.
    const detent = Math.round(pos);
    if (detent !== lastDetent) {
      lastDetent = detent;
      if (detent >= 0 && detent < count) onDetent?.(detent);
    }
    // The light sweeps across the mirror as the pointer moves, and drifts slowly on its own.
    if (!reduceMotion) envDrift += dt * 0.05;
    scene.environmentRotation.set(tilt.y * 0.35, tilt.x * 0.9 + envDrift, 0);
    layout(dt, now);
    renderer.render(scene, camera);
    onFrame?.(pos, speed);
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
    const dpr = renderer.getPixelRatio();
    floor.getRenderTarget().setSize(Math.round(w * dpr * 0.6), Math.round(h * dpr * 0.6));
    camera.aspect = w / h;
    // Keep the front disc about the same size whether the stage is wide or tall.
    camera.position.z = CAMERA_Z * Math.max(1, 1.05 / camera.aspect);
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

  // How a drag feels: soft notches at each disc, and a rubber band past either end.
  function feel(raw) {
    const notched = raw - (Math.sin(raw * TAU) / TAU) * 0.32;
    const band = (over) => 0.45 * (1 - Math.exp(-over / 0.45));
    if (notched < 0) return -band(-notched);
    if (notched > count - 1) return count - 1 + band(notched - (count - 1));
    return notched;
  }

  // Screen position of the front disc's centre, for grabbing it.
  const centre = new THREE.Vector3();
  function discCentre() {
    const r = canvas.getBoundingClientRect();
    centre.copy(discs[target].position).project(camera);
    return { x: r.left + (centre.x + 1) / 2 * r.width, y: r.top + (1 - centre.y) / 2 * r.height };
  }
  const angleAt = (e, c) => Math.atan2(-(e.clientY - c.y), e.clientX - c.x);

  // Where the pointer meets the floor, so the grid can light up there.
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.92);
  const floorHit = new THREE.Vector3();

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
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(floorPlane, floorHit)) pointerFloor.set(floorHit.x, floorHit.z, 1);
    if (grabbed) {
      const c = discCentre();
      const a = angleAt(e, c);
      let delta = a - grabAngle;
      delta = ((delta + Math.PI) % TAU + TAU) % TAU - Math.PI;
      grabAngle = a;
      const d = discs[target].userData;
      d.angle += delta;
      const now = performance.now();
      const dtMove = Math.max(8, now - grabT) / 1000;
      grabVel = grabVel * 0.5 + (delta / dtMove) * 0.5;
      grabT = now;
      return;
    }
    if (dragging && holdTimer && Math.abs(e.clientX - dragStartX) > 6) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
    if (dragging) {
      const dx = (e.clientX - dragStartX) / r.width;
      dragMoved = Math.max(dragMoved, Math.abs(e.clientX - dragStartX));
      pos = feel(dragStartPos - dx * 2.2);
      const now = performance.now();
      const dtMove = Math.max(1, now - lastDragT) / 1000;
      const v = (-(e.clientX - lastDragX) / r.width) * 2.2 / dtMove;
      dragVel = dragVel * 0.6 + v * 0.4;
      lastDragX = e.clientX;
      lastDragT = now;
    } else if (e.pointerType === "mouse") {
      const over = pick(e);
      canvas.style.cursor = over >= 0 ? "pointer" : "grab";
      fx.hoverT = over === target ? 1 : 0;
    }
  });
  canvas.addEventListener("pointerleave", () => { tilt.tx = 0; tilt.ty = 0; fx.hoverT = 0; pointerFloor.z = 0; });
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartPos = pos;
    dragMoved = 0;
    vel = 0;
    dragVel = 0;
    lastDragX = e.clientX;
    lastDragT = performance.now();
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    clearTimeout(holdTimer);
    holdTimer = 0;
    if (!reduceMotion && pick(e) === target && fx.flipT === 0) {
      // Hold still for a moment on the front disc and you've got it in your hand.
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        grabbed = true;
        dragging = false;
        pos = target;
        vel = 0;
        fx.pressT = 1;
        grabVel = 0;
        grabT = performance.now();
        grabAngle = angleAt(e, discCentre());
        onGrab?.(true);
      }, 220);
    }
  });
  const release = (e) => {
    clearTimeout(holdTimer);
    holdTimer = 0;
    if (grabbed) {
      // Let go: it keeps the spin you gave it, then winds down to idle.
      grabbed = false;
      fx.pressT = 0;
      discs[target].userData.spinV = Math.max(-40, Math.min(40, grabVel));
      canvas.style.cursor = "grab";
      onGrab?.(false);
      return;
    }
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
    if (dragMoved < 6) {
      const i = pick(e);
      if (i === target) onActivate?.();
      else if (i >= 0) onSelect?.(i);
      return;
    }
    // A flick carries on a little past where the finger let go.
    const thrown = performance.now() - lastDragT < 80 ? dragVel * 0.22 : 0;
    const next = Math.max(0, Math.min(count - 1, Math.round(pos + thrown)));
    vel = dragVel * 0.5;
    if (next !== target) onSelect?.(next);
    else target = next;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  start();

  return {
    setIndex(i) { target = i; if (reduceMotion) { pos = i; vel = 0; } },
    // Scrubbing from outside (the timeline): follow the finger, then settle on the nearest disc.
    scrub(p) {
      dragging = true;
      vel = 0;
      pos = feel(p);
    },
    endScrub() {
      if (!dragging) return;
      dragging = false;
      const next = Math.max(0, Math.min(count - 1, Math.round(pos)));
      if (next !== target) onSelect?.(next);
    },
    setLabel: drawLabel,
    // Physical feedback on the front disc: "select" spins it up, "open" throws it toward
    // you, "seal" flips it to the data side, "unseal" flips it back, "deny" shakes it,
    // "unlock" flips back with a fast spin.
    pulse(kind) {
      if (reduceMotion) return;
      const d = discs[target];
      if (kind === "select") { d.userData.spinV = 7; ripple.x = 0; ripple.y = 0; rippleT = 0.12; }
      if (kind === "open") {
        d.userData.spinV = 22;
        fx.pushT = 1;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => { fx.pushT = 0; }, 420);
      }
      if (kind === "seal") fx.flipT = Math.PI;
      if (kind === "unseal") fx.flipT = 0;
      if (kind === "deny") fx.wobble = 1;
      if (kind === "unlock") { fx.flipT = 0; d.userData.spinV = 16; rippleT = 0; }
    },
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
