// WebGL Ripple, adapted from my WebGLRipple experiment to live inside the hero panel.
// Height field on a ping-pong framebuffer, solved with the 2D wave equation.
(() => {
  const panel = document.getElementById("ripple");
  const canvas = document.getElementById("ripple-canvas");
  if (!panel || !canvas || !window.THREE) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  } catch (err) {
    return; // No WebGL: the panel keeps its static gradient.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const simRes = 384;
  const rtOptions = {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  let rt1 = new THREE.WebGLRenderTarget(simRes, simRes, rtOptions);
  let rt2 = new THREE.WebGLRenderTarget(simRes, simRes, rtOptions);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const texel = new THREE.Vector2(1 / simRes, 1 / simRes);

  const vertexShader = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
  `;

  const dropShader = `
    uniform sampler2D tMap;
    uniform vec2 u_mouse;
    uniform float u_radius;
    uniform float u_strength;
    uniform float u_aspect;
    varying vec2 vUv;
    void main() {
      vec4 info = texture2D(tMap, vUv);
      vec2 p = vUv - u_mouse;
      p.x *= u_aspect;
      float drop = max(0.0, 1.0 - length(p) / u_radius);
      drop = 0.5 - cos(drop * 3.14159) * 0.5;
      info.r += drop * u_strength;
      gl_FragColor = info;
    }
  `;

  const updateShader = `
    uniform sampler2D tMap;
    uniform vec2 u_delta;
    uniform float u_damping;
    varying vec2 vUv;
    void main() {
      vec4 info = texture2D(tMap, vUv);
      float up = texture2D(tMap, vUv + vec2(0.0, u_delta.y)).r;
      float down = texture2D(tMap, vUv - vec2(0.0, u_delta.y)).r;
      float left = texture2D(tMap, vUv - vec2(u_delta.x, 0.0)).r;
      float right = texture2D(tMap, vUv + vec2(u_delta.x, 0.0)).r;
      float next = (up + down + left + right) * 0.5 - info.g;
      next *= u_damping;
      gl_FragColor = vec4(next, info.r, 0.0, 1.0);
    }
  `;

  const renderShader = `
    uniform sampler2D tMap;
    uniform vec2 u_delta;
    uniform vec3 u_shadow;
    varying vec2 vUv;
    void main() {
      float h = texture2D(tMap, vUv).r;
      float up = texture2D(tMap, vUv + vec2(0.0, u_delta.y)).r;
      float down = texture2D(tMap, vUv - vec2(0.0, u_delta.y)).r;
      float left = texture2D(tMap, vUv - vec2(u_delta.x, 0.0)).r;
      float right = texture2D(tMap, vUv + vec2(u_delta.x, 0.0)).r;

      vec3 dx = vec3(u_delta.x * 300.0, 0.0, right - left);
      vec3 dy = vec3(0.0, u_delta.y * 300.0, up - down);
      vec3 normal = normalize(cross(dx, dy));

      vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
      vec3 halfVector = normalize(lightDir + vec3(0.0, 0.0, 1.0));
      float specular = pow(max(dot(normal, halfVector), 0.0), 100.0);
      float diffuse = max(dot(normal, lightDir), 0.0);

      float shade = (1.0 - diffuse) * 0.6;
      vec3 color = u_shadow * shade + vec3(1.0) * specular * 1.5;

      float slope = length(vec2(right - left, up - down)) * 20.0;
      float alpha = clamp(slope + specular * 2.0 + shade * slope, 0.0, 1.0);
      gl_FragColor = vec4(color, max(alpha, clamp(abs(h) * 1.5, 0.0, 0.02)));
    }
  `;

  const dropUniforms = {
    tMap: { value: null },
    u_mouse: { value: new THREE.Vector2() },
    u_radius: { value: 0.02 },
    u_strength: { value: 0.08 },
    u_aspect: { value: 4 / 3 },
  };
  const updateUniforms = {
    tMap: { value: null },
    u_delta: { value: texel },
    u_damping: { value: 0.985 },
  };
  const renderUniforms = {
    tMap: { value: null },
    u_delta: { value: texel },
    u_shadow: { value: new THREE.Color() },
  };

  const scene = (fragmentShader, uniforms, transparent = false) => {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent, depthWrite: false })));
    return s;
  };
  const dropScene = scene(dropShader, dropUniforms);
  const simScene = scene(updateShader, updateUniforms);
  const renderScene = scene(renderShader, renderUniforms, true);

  // Shadow tint follows the page accent, so the effect matches light and dark mode.
  const syncColor = () => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    renderUniforms.u_shadow.value.set(accent || "#2c4fe8");
  };
  syncColor();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncColor);

  const resize = () => {
    const { width, height } = panel.getBoundingClientRect();
    renderer.setSize(width, height, false);
    dropUniforms.u_aspect.value = width / height;
  };
  new ResizeObserver(resize).observe(panel);
  resize();

  const swap = () => { const t = rt1; rt1 = rt2; rt2 = t; };

  const drop = (x, y, radius, strength) => {
    dropUniforms.u_mouse.value.set(x, y);
    dropUniforms.u_radius.value = radius;
    dropUniforms.u_strength.value = strength;
    dropUniforms.tMap.value = rt1.texture;
    renderer.setRenderTarget(rt2);
    renderer.render(dropScene, camera);
    swap();
  };

  const mouse = new THREE.Vector2();
  const prev = new THREE.Vector2();
  let pointerActive = false;
  let lastPointer = 0;

  panel.addEventListener("pointermove", (e) => {
    const r = panel.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    if (!pointerActive) prev.copy(mouse);
    pointerActive = true;
    lastPointer = performance.now();
  }, { passive: true });
  panel.addEventListener("pointerleave", () => { pointerActive = false; });
  panel.addEventListener("pointerdown", (e) => {
    const r = panel.getBoundingClientRect();
    drop((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, 0.04, 0.5);
  });

  // Occasional raindrops while nobody is touching it, so it reads as alive on touch screens too.
  let nextRain = 0;
  const rain = (now) => {
    if (now - lastPointer < 2500 || now < nextRain) return;
    drop(0.1 + Math.random() * 0.8, 0.1 + Math.random() * 0.8, 0.025, 0.35);
    nextRain = now + 700 + Math.random() * 900;
  };

  let visible = true;
  let frame = 0;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) frame = requestAnimationFrame(tick);
  }).observe(panel);

  function tick(now) {
    frame = 0;
    if (!visible) return;

    if (pointerActive) {
      const dist = prev.distanceTo(mouse);
      if (dist > 0.004) {
        const steps = Math.min(Math.ceil(dist / 0.004), 20);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          drop(THREE.MathUtils.lerp(prev.x, mouse.x, t), THREE.MathUtils.lerp(prev.y, mouse.y, t), 0.018, 0.12);
        }
        prev.copy(mouse);
      }
    }
    rain(now);

    updateUniforms.tMap.value = rt1.texture;
    renderer.setRenderTarget(rt2);
    renderer.render(simScene, camera);
    swap();

    renderUniforms.tMap.value = rt1.texture;
    renderer.setRenderTarget(null);
    renderer.render(renderScene, camera);

    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);
})();
