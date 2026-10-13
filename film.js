// Film overlay: pixel grain, dust, the odd vertical scratch, and a slight flicker.
// Drawn at a third of the screen size and scaled up with pixelated rendering.
(() => {
  const canvas = document.getElementById("film");
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SCALE = 3;
  const FPS = 18;

  let w = 0;
  let h = 0;
  let grain = [];

  function makeGrain() {
    grain = [];
    for (let f = 0; f < 6; f++) {
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = Math.random();
        if (r < 0.5) continue; // leave half the pixels clear
        const light = r > 0.75;
        d[i] = light ? 255 : 20;
        d[i + 1] = light ? 236 : 10;
        d[i + 2] = light ? 205 : 4;
        d[i + 3] = (light ? 10 : 14) + Math.random() * (light ? 12 : 16);
      }
      grain.push(img);
    }
  }

  function resize() {
    w = Math.ceil(window.innerWidth / SCALE);
    h = Math.ceil(window.innerHeight / SCALE);
    canvas.width = w;
    canvas.height = h;
    makeGrain();
    if (reduced) ctx.putImageData(grain[0], 0, 0);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();
  if (reduced) return;

  const scratches = [];
  let frame = 0;
  let last = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden || now - last < 1000 / FPS) return;
    last = now;
    frame++;

    ctx.putImageData(grain[frame % grain.length], 0, 0);

    // Flicker: a faint warm wash that wobbles frame to frame.
    const flicker = Math.random() < 0.06 ? 0.07 : Math.random() * 0.025;
    ctx.fillStyle = `rgba(255, 214, 160, ${flicker})`;
    ctx.fillRect(0, 0, w, h);

    // Scratches: rare, thin, jittering vertical lines.
    if (Math.random() < 0.035) {
      scratches.push({ x: Math.random() * w, life: 4 + Math.random() * 14, light: Math.random() < 0.7, y0: Math.random() < 0.5 ? 0 : Math.random() * h * 0.5 });
    }
    for (let i = scratches.length - 1; i >= 0; i--) {
      const s = scratches[i];
      s.x += (Math.random() - 0.5) * 1.4;
      ctx.fillStyle = s.light ? "rgba(255, 240, 215, 0.32)" : "rgba(20, 10, 4, 0.4)";
      ctx.fillRect(Math.round(s.x), s.y0, 1, h - s.y0);
      if (--s.life <= 0) scratches.splice(i, 1);
    }

    // Dust: a few specks and the occasional hair.
    const specks = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0;
    for (let i = 0; i < specks; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255, 245, 225, 0.55)" : "rgba(15, 8, 3, 0.6)";
      const size = Math.random() < 0.8 ? 1 : 2;
      ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), size, size);
    }
    if (Math.random() < 0.01) {
      ctx.strokeStyle = "rgba(15, 8, 3, 0.45)";
      ctx.beginPath();
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 6 - Math.random() * 12, y + 6, x + 10 - Math.random() * 20, y + 10 + Math.random() * 8);
      ctx.stroke();
    }
  }

  requestAnimationFrame(tick);
})();
