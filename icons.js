// Pixel 3D icons: low-res render, toon shading, inverted-hull outlines, stepped animation.
// Each icon is a THREE.Group with an update(t) method.
window.Icons = (() => {
  const RES = 100;      // stage render size before upscaling
  const THUMB = 56;     // disc label render size
  const FPS = 15;       // stepped like stop motion

  const PAL = {
    ink: 0x1d1410, cream: 0xefe2cc, amber: 0xf2a541, terracotta: 0xc8553d, olive: 0x7d8b4a,
    blue: 0x5b84a6, teal: 0x3f7f86, silver: 0xcdc8c0, gold: 0xd9a943, dark: 0x3a302a, green: 0x2f5d50,
  };

  let renderer, scene, camera, gradient, outlineMat;
  const icons = [];
  let current = null;
  let switchedAt = 0;

  function toon(color, extra = {}) {
    return new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra });
  }

  // A mesh plus a slightly larger back-face copy, which reads as a 1px ink outline once pixelated.
  function part(geo, color, { outline = 1.08, mat } = {}) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat || toon(color));
    g.add(m);
    if (outline) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.setScalar(outline);
      g.add(o);
    }
    g.userData.mesh = m;
    return g;
  }

  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

  // 01 StudyOS: a stack of books with a pencil on top.
  function books() {
    const g = new THREE.Group();
    const colors = [PAL.blue, PAL.olive, PAL.terracotta];
    const turns = [0.12, -0.18, 0.06];
    colors.forEach((c, k) => {
      const b = new THREE.Group();
      const cover = part(box(1.45, 0.3, 1.0), c);
      cover.position.x = -0.04;
      const pages = part(box(1.38, 0.2, 0.92), PAL.cream, { outline: 0 });
      pages.position.x = 0.1;
      b.add(cover, pages);
      b.position.y = -0.6 + k * 0.32;
      b.rotation.y = turns[k];
      g.add(b);
    });
    const pencil = new THREE.Group();
    const body = part(cyl(0.11, 0.11, 1.3, 6), PAL.amber, { outline: 1.15 });
    body.rotation.z = Math.PI / 2;
    const tip = part(new THREE.ConeGeometry(0.11, 0.3, 6), PAL.cream, { outline: 1.15 });
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.8;
    pencil.add(body, tip);
    pencil.position.y = 0.2;
    pencil.rotation.y = 0.7;
    g.add(pencil);
    g.update = (t) => {
      g.rotation.y = t * 0.6;
      g.position.y = Math.sin(t * 1.6) * 0.06;
      pencil.position.y = 0.2 + Math.max(0, Math.sin(t * 3.2)) * 0.12;
    };
    return g;
  }

  // 02 Undertone: equalizer bars dancing on a plinth.
  function equalizer() {
    const g = new THREE.Group();
    const base = part(box(2.3, 0.16, 0.9), PAL.dark);
    base.position.y = -0.85;
    g.add(base);
    const colors = [PAL.terracotta, PAL.amber, PAL.gold, PAL.amber, PAL.terracotta];
    const bars = colors.map((c, k) => {
      const geo = box(0.3, 1, 0.3);
      geo.translate(0, 0.5, 0);
      const bar = part(geo, c, { outline: 1.1 });
      bar.position.set(-0.84 + k * 0.42, -0.77, 0);
      g.add(bar);
      return bar;
    });
    g.update = (t) => {
      bars.forEach((bar, k) => {
        const beat = Math.abs(Math.sin(t * 2.4 + k * 0.9)) * (0.65 + 0.35 * Math.sin(t * 0.8 + k * 1.7));
        bar.scale.y = 0.2 + beat * 1.5;
      });
      g.rotation.y = -0.35 + Math.sin(t * 0.5) * 0.5;
    };
    return g;
  }

  // 03 Folio: a fountain pen writing on a sheet of paper.
  function pen() {
    const g = new THREE.Group();
    const paper = part(box(1.7, 0.05, 2.1), PAL.cream);
    paper.position.y = -0.8;
    paper.rotation.y = 0.3;
    for (let k = 0; k < 3; k++) {
      const line = part(box(k === 2 ? 0.7 : 1.1, 0.055, 0.05), PAL.dark, { outline: 0 });
      line.position.set(-0.05 - (k === 2 ? 0.2 : 0), 0.01, -0.55 + k * 0.32);
      paper.add(line);
    }
    g.add(paper);

    const p = new THREE.Group();
    const barrel = part(cyl(0.15, 0.15, 1.3, 8), PAL.green, { outline: 1.12 });
    barrel.position.y = 0.15;
    const band = part(cyl(0.16, 0.16, 0.1, 8), PAL.gold, { outline: 0 });
    band.position.y = 0.4;
    const capEnd = part(new THREE.SphereGeometry(0.15, 8, 6), PAL.green, { outline: 1.12 });
    capEnd.position.y = 0.8;
    const grip = part(cyl(0.12, 0.09, 0.35, 8), PAL.dark, { outline: 1.12 });
    grip.position.y = -0.67;
    const nib = part(new THREE.ConeGeometry(0.09, 0.34, 4), PAL.silver, { outline: 1.15 });
    nib.rotation.x = Math.PI;
    nib.position.y = -1.0;
    p.add(barrel, band, capEnd, grip, nib);
    p.rotation.z = 0.55;
    g.add(p);

    g.update = (t) => {
      p.position.x = 0.15 + Math.sin(t * 1.8) * 0.3;
      p.position.y = 0.42 + Math.abs(Math.sin(t * 5.4)) * 0.08;
      g.rotation.y = -0.5 + Math.sin(t * 0.4) * 0.35;
    };
    return g;
  }

  // 04 Y-Not Saloon: scissors snipping.
  function scissors() {
    const g = new THREE.Group();
    const half = (side) => {
      const h = new THREE.Group();
      const bladeGeo = cyl(0.03, 0.22, 1.5, 4);
      const blade = part(bladeGeo, PAL.silver, { outline: 1.12 });
      blade.scale.z = 0.3;
      blade.position.y = 0.75;
      const shank = part(box(0.1, 0.42, 0.07), PAL.gold, { outline: 1.15 });
      shank.position.set(side * 0.05, -0.22, 0);
      shank.rotation.z = side * 0.25;
      const ring = part(new THREE.TorusGeometry(0.27, 0.075, 6, 14), PAL.gold, { outline: 1.1 });
      ring.position.set(side * 0.2, -0.68, 0);
      h.add(blade, shank, ring);
      return h;
    };
    const a = half(1);
    const b = half(-1);
    const screw = part(cyl(0.08, 0.08, 0.16, 8), PAL.dark, { outline: 1.1 });
    screw.rotation.x = Math.PI / 2;
    g.add(a, b, screw);
    g.position.y = -0.1;
    g.update = (t) => {
      const snip = 0.1 + 0.28 * (0.5 + 0.5 * Math.sin(t * 4.5));
      a.rotation.z = snip;
      b.rotation.z = -snip;
      g.rotation.y = Math.sin(t * 0.6) * 0.6;
      g.rotation.x = -0.25;
    };
    return g;
  }

  // 05 Workspace Connector: a plug that keeps connecting to a socket.
  function plug() {
    const g = new THREE.Group();
    const socket = part(box(1.4, 1.4, 0.22), PAL.cream);
    socket.position.z = -0.9;
    [-0.25, 0.25].forEach((x) => {
      const slot = part(box(0.12, 0.42, 0.04), PAL.ink, { outline: 0 });
      slot.position.set(x, 0, 0.11);
      socket.add(slot);
    });
    const ledMat = toon(PAL.dark);
    const led = part(new THREE.SphereGeometry(0.08, 6, 4), 0, { outline: 0, mat: ledMat });
    led.position.set(0.5, 0.5, 0.13);
    socket.add(led);
    g.add(socket);

    const p = new THREE.Group();
    const body = part(box(1.0, 1.0, 0.7), PAL.terracotta);
    [-0.25, 0.25].forEach((x) => {
      const prong = part(box(0.1, 0.36, 0.5), PAL.silver, { outline: 1.15 });
      prong.position.set(x, 0, -0.58);
      p.add(prong);
    });
    const cable = part(cyl(0.13, 0.13, 1.1, 8), PAL.dark, { outline: 1.12 });
    cable.rotation.x = Math.PI / 2;
    cable.position.z = 0.9;
    p.add(body, cable);
    g.add(p);

    g.rotation.y = -0.45;
    g.update = (t) => {
      const cycle = (t * 0.55) % 1;
      // Out, slide in, hold connected, slide out.
      const inT = cycle < 0.35 ? cycle / 0.35 : cycle < 0.7 ? 1 : 1 - (cycle - 0.7) / 0.3;
      const eased = inT * inT * (3 - 2 * inT);
      p.position.z = 0.85 - eased * 0.85;
      ledMat.color.setHex(eased > 0.97 ? PAL.amber : PAL.dark);
      g.rotation.y = -0.45 + Math.sin(t * 0.4) * 0.2;
    };
    return g;
  }

  // 06 WebGL Ripple: a drop falls and rings spread out.
  function drop() {
    const g = new THREE.Group();
    const pool = part(cyl(1.5, 1.5, 0.08, 20), PAL.teal);
    pool.position.y = -0.95;
    g.add(pool);

    const pts = [];
    for (let i = 10; i >= 0; i--) {
      const a = (i / 10) * Math.PI;
      pts.push(new THREE.Vector2(Math.sin(a) * Math.pow(Math.sin(a / 2), 1.2) * 0.42, Math.cos(a) * 0.5));
    }
    const dropMesh = part(new THREE.LatheGeometry(pts, 8), PAL.blue, { outline: 1.12 });
    g.add(dropMesh);

    const rings = [0, 1, 2].map(() => {
      const mat = toon(PAL.cream, { transparent: true });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 4, 28), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.89;
      g.add(ring);
      return ring;
    });

    g.update = (t) => {
      const p = (t * 0.5) % 1;
      const fall = Math.min(p / 0.5, 1);
      dropMesh.visible = p < 0.5;
      dropMesh.position.y = 1.15 - fall * fall * 1.95;
      rings.forEach((ring, k) => {
        const age = (p - 0.5 - k * 0.1 + 1) % 1;
        const live = age < 0.75;
        ring.visible = live;
        ring.scale.setScalar(0.2 + age * 2.6);
        ring.material.opacity = live ? 1 - age / 0.75 : 0;
      });
      g.rotation.y = t * 0.2;
    };
    return g;
  }

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);

    const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
    outlineMat = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });

    scene = new THREE.Scene();
    const s = 1.75;
    camera = new THREE.OrthographicCamera(-s, s, s, -s, 0.1, 50);
    camera.position.set(3.2, 2.6, 4.2);
    camera.lookAt(0, -0.1, 0);

    scene.add(new THREE.AmbientLight(0xffe6c8, 0.45));
    const key = new THREE.DirectionalLight(0xfff0dc, 0.9);
    key.position.set(-2, 4, 3);
    scene.add(key);

    [books, equalizer, pen, scissors, plug, drop].forEach((make) => icons.push(make()));
  }

  // Render every icon once at thumbnail size for the disc labels.
  function thumbs() {
    renderer.setSize(THUMB, THUMB, false);
    const urls = icons.map((icon) => {
      scene.add(icon);
      icon.update(1.2);
      renderer.render(scene, camera);
      scene.remove(icon);
      return renderer.domElement.toDataURL("image/png");
    });
    renderer.setSize(RES, RES, false);
    return urls;
  }

  function show(index) {
    if (current) scene.remove(current);
    current = icons[index];
    scene.add(current);
    switchedAt = performance.now();
    // Draw one frame right away so the stage is never empty, even in a background tab.
    current.update(1.2);
    current.scale.setScalar(0.7);
    renderer.render(scene, camera);
  }

  let last = 0;
  let still = false;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!current || document.hidden) return;
    if (now - last < 1000 / FPS) return;
    last = now;
    const t = still ? 1.2 : Math.floor(now / (1000 / FPS)) / FPS;
    current.update(t);
    // Pop in after a switch: a damped spring from 70% up to full size.
    const k = Math.min((now - switchedAt) / 600, 1);
    const pop = k < 1 ? 1 - 0.3 * Math.exp(-6 * k) * Math.cos(k * Math.PI * 3) : 1;
    current.scale.setScalar(pop);
    renderer.render(scene, camera);
  }

  function start({ reducedMotion }) {
    still = reducedMotion;
    requestAnimationFrame(loop);
  }

  return { init, thumbs, show, start, count: () => icons.length };
})();
