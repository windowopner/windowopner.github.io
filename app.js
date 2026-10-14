// The player: a row of discs (however many are in DISCS), one clamp, one display.
// Every disc except Undertone is redacted: the title and description are filler text
// drawn as a mosaic, so the real wording never ships in the page source.
// Locked discs carry no link at all, so there is nothing behind the password prompt to break into.
const DISCS = [
  {
    title: "Velorum",
    kind: "Web app",
    stack: "Next.js, Supabase, Tailwind",
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut.",
    url: null,
    redacted: true,
    locked: true,
  },
  {
    title: "Undertone",
    kind: "macOS app",
    stack: "Swift",
    text: "A desktop background that moves with whatever music is playing, built on system audio capture.",
    url: null,
  },
  {
    title: "Arcus",
    kind: "Website",
    stack: "HTML, CSS, JavaScript",
    text: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi.",
    url: null,
    redacted: true,
    locked: true,
  },
  {
    title: "Tempor Incididunt U",
    kind: "MCP server",
    status: "archived", // shown next to the kind on the display, not in the narrow track list
    stack: "Python, FastAPI",
    text: "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est.",
    url: null,
    redacted: true,
    locked: true,
  },
  {
    title: "Magna Aliqua",
    kind: "Experiment",
    stack: "Three.js, GLSL",
    text: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque lau.",
    url: null,
    redacted: true,
    locked: true,
  },
];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const discList = $("discs");
const slots = $("slots");
const glass = discList.parentElement;
const clamp = $("clamp");
const play = $("play");
const playLabel = $("play-label");
const stageWrap = $("stage-wrap");

let index = 0;
let hasIcons = false;

const pad = (n) => String(n).padStart(2, "0");

// Build discs and the 1-N indicator on the display.
discList.style.setProperty("--n", DISCS.length);
const discButtons = DISCS.map((d, i) => {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "disc";
  btn.type = "button";
  btn.setAttribute("aria-label", d.redacted ? `Disc ${i + 1}` : `Disc ${i + 1}: ${d.title}`);
  btn.innerHTML = `
    <span class="disc-face">
      <span class="disc-label"><img alt="" width="56" height="56"></span>
      <span class="disc-hub"></span>
    </span>
    <span class="disc-num">${pad(i + 1)}</span>`;
  btn.style.setProperty("--i", i);
  btn.addEventListener("click", () => select(i));
  btn.addEventListener("dblclick", openCurrent);
  li.appendChild(btn);
  discList.appendChild(li);

  const slot = document.createElement("li");
  slot.textContent = i + 1;
  slots.appendChild(slot);
  return btn;
});

// Pixel icons on the labels and on the stage.
try {
  if (window.THREE && window.Icons) {
    Icons.init($("stage"));
    Icons.thumbs().forEach((src, i) => { discButtons[i].querySelector("img").src = src; });
    hasIcons = true;
  }
} catch (err) {
  hasIcons = false;
}

function moveClamp() {
  const btn = discButtons[index];
  const g = glass.getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  clamp.style.setProperty("--x", `${b.left - g.left + b.width / 2}px`);
  clamp.style.setProperty("--disc-now", `${b.width}px`);
}

// Room theme: the clamp lifts off the disc, slides along the rail, then sets down.
// Rapid changes keep it in the air until the last one lands.
let landTimer = 0;
let clampX = null;
function travelClamp() {
  const before = clampX;
  moveClamp();
  clampX = clamp.style.getPropertyValue("--x");
  if (reducedMotion || before === null || before === clampX) return;
  clamp.classList.add("lifted");
  clearTimeout(landTimer);
  landTimer = setTimeout(() => clamp.classList.remove("lifted"), 860);
}

// Disc spin with inertia: the selected disc spins up once it is clamped (or straight
// away in space), and a disc that loses focus coasts to a stop instead of snapping back.
const faces = discButtons.map((b) => b.querySelector(".disc-face"));
const spins = DISCS.map(() => ({ angle: 0, speed: 0 }));
const SPIN_SPEED = 140; // degrees per second
let spinLast = 0;
function spinLoop(now) {
  requestAnimationFrame(spinLoop);
  const dt = Math.min(0.05, (now - (spinLast || now)) / 1000);
  spinLast = now;
  if (reducedMotion || document.hidden) return;
  const held = document.documentElement.dataset.theme !== "space" && clamp.classList.contains("lifted");
  spins.forEach((s, i) => {
    const goal = i === index && !held ? SPIN_SPEED : 0;
    if (s.speed === 0 && goal === 0) return;
    const rate = goal > s.speed ? 1.4 : 0.8; // spin up quicker than it winds down
    s.speed += (goal - s.speed) * Math.min(1, dt * rate);
    if (goal === 0 && s.speed < 1) s.speed = 0;
    s.angle = (s.angle + s.speed * dt) % 360;
    faces[i].style.transform = `rotate(${s.angle.toFixed(2)}deg)`;
  });
}
requestAnimationFrame(spinLoop);

// The display scrambles briefly before settling, like a VFD redrawing.
const GLYPHS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789#*+";
let scrambleTimer = 0;
function writeDisplay(el, text) {
  if (reducedMotion) { el.textContent = text; return; }
  let step = 0;
  const steps = 6;
  const run = () => {
    step++;
    el.textContent = [...text].map((ch, k) => {
      if (ch === " " || k < (step / steps) * text.length) return ch;
      return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }).join("");
    if (step < steps) scrambleTimer = setTimeout(run, 40);
  };
  run();
}

// Draw text at full size, shrink it so neighbouring pixels average out, then scale it
// back up with hard edges. Alpha is boosted so thin strokes still read as solid blocks.
function mosaic(el, text, block, singleLine) {
  const cs = getComputedStyle(el);
  const font = `${cs.fontSize} ${cs.fontFamily}`;
  const size = parseFloat(cs.fontSize);
  const lineHeight = parseFloat(cs.lineHeight) || size * 1.3;
  const maxWidth = singleLine ? Infinity : el.clientWidth || 420;

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;
  const lines = [];
  let line = "";
  text.split(" ").forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (measure.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  });
  lines.push(line);

  const w = Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width))) + 2;
  const h = Math.ceil(lines.length * lineHeight);
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const f = full.getContext("2d");
  f.font = font;
  f.fillStyle = cs.color;
  f.textBaseline = "middle";
  lines.forEach((l, k) => f.fillText(l, 0, k * lineHeight + lineHeight / 2));

  const small = document.createElement("canvas");
  small.width = Math.ceil(w / block);
  small.height = Math.ceil(h / block);
  const s = small.getContext("2d");
  s.imageSmoothingEnabled = true;
  s.drawImage(full, 0, 0, small.width, small.height);
  const img = s.getImageData(0, 0, small.width, small.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.min(255, img.data[i] * 2.4);
  s.putImageData(img, 0, 0);

  small.className = "mosaic";
  small.style.width = `${small.width * block}px`;
  small.style.height = `${small.height * block}px`;
  small.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "sr-only";
  label.textContent = "Redacted";
  el.replaceChildren(small, label);
}

function select(i) {
  index = (i + DISCS.length) % DISCS.length;
  const d = DISCS[index];

  discButtons.forEach((b, k) => b.setAttribute("aria-current", k === index ? "true" : "false"));
  [...slots.children].forEach((s, k) => s.classList.toggle("on", k === index));
  travelClamp();

  clearTimeout(scrambleTimer);
  $("track").textContent = pad(index + 1);
  $("kind").textContent = d.status ? `${d.kind} · ${d.status}` : d.kind;
  if (d.redacted) {
    mosaic($("title"), d.title.toUpperCase(), 6, true);
    mosaic($("desc"), d.text, 5, false);
  } else {
    writeDisplay($("title"), d.title.toUpperCase());
    $("desc").textContent = d.text;
  }
  $("stack").textContent = d.stack;

  closePad();
  if (window.Orbit) Orbit.focus(index);
  play.classList.toggle("locked", Boolean(d.locked));
  if (!d.locked) play.removeAttribute("aria-expanded");
  if (d.url) {
    play.removeAttribute("aria-disabled");
    play.setAttribute("aria-label", `Open ${d.title}`);
    play.innerHTML = '<i class="ph ph-play" aria-hidden="true"></i>';
    playLabel.textContent = "Play";
  } else if (d.locked) {
    play.removeAttribute("aria-disabled");
    play.setAttribute("aria-label", `Disc ${index + 1} is locked. Open keypad`);
    play.setAttribute("aria-expanded", "false");
    play.innerHTML = '<i class="ph ph-play" aria-hidden="true"></i>';
    playLabel.textContent = "Locked";
  } else {
    play.setAttribute("aria-disabled", "true");
    play.setAttribute("aria-label", d.redacted ? `Disc ${index + 1} is private for now` : `${d.title} is private for now`);
    play.innerHTML = '<i class="ph ph-lock-simple" aria-hidden="true"></i>';
    playLabel.textContent = "Private";
  }

  if (hasIcons) {
    Icons.show(index);
    stageWrap.classList.remove("switching");
    void stageWrap.offsetWidth;
    stageWrap.classList.add("switching");
  }
}

function openCurrent() {
  const d = DISCS[index];
  if (d.url) window.open(d.url, "_blank", "noopener");
  else if (d.locked) openPad();
}

// Keypad for locked discs. One code opens every locked disc: locks.json holds their
// real title, text, and link, encrypted (PBKDF2-SHA256 + AES-GCM) with that code by
// tools/lock.mjs. A wrong code simply fails to decrypt; nothing secret is in the page.
const controls = $("controls");
const hatch = $("hatch");
const okKey = hatch.querySelector('[data-k="OK"]');
const MAX_CODE = 12;
let code = "";
let locks = null;     // encrypted blob, once fetched
let busy = false;     // decrypting
let failures = 0;
let waitUntil = 0;

fetch(`locks.json?v=${document.querySelector('script[src^="app.js"]').src.split("v=")[1] || ""}`)
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => { locks = data; showCode(); })
  .catch(() => { locks = null; });

function padStatus(left, right) {
  $("pad-disc").textContent = left;
  $("pad-code").textContent = right;
}

function showCode() {
  const shown = "*".repeat(Math.min(code.length, 8)) + (code.length > 8 ? "+" : "");
  padStatus(locks ? "Code" : "Locked", code ? shown.padEnd(8, "-") : "--------");
  okKey.disabled = !locks || busy || code.length < 4;
  okKey.setAttribute("aria-label", locks ? "Unlock" : "Unlock, not available");
}

function openPad() {
  if (controls.classList.contains("open")) return;
  code = "";
  showCode();
  controls.classList.add("open");
  hatch.inert = false;
  play.setAttribute("aria-expanded", "true");
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decrypt(pin) {
  const { subtle } = crypto;
  const base = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(locks.salt), iterations: locks.iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: b64(locks.iv) }, key, b64(locks.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

// Swap the redacted discs for the real ones.
function applyUnlock(payload) {
  Object.entries(payload).forEach(([k, real]) => {
    const i = Number(k);
    if (!DISCS[i]) return;
    DISCS[i] = { ...DISCS[i], ...real, redacted: false, locked: false };
    discButtons[i].setAttribute("aria-label", `Disc ${i + 1}: ${DISCS[i].title}`);
  });
  document.dispatchEvent(new Event("discs-unlocked"));
}

async function submitCode() {
  if (!locks || busy || code.length < 4) return;
  const now = Date.now();
  if (now < waitUntil) {
    padStatus("Wait", `${Math.ceil((waitUntil - now) / 1000)}s`.padStart(8, " "));
    return;
  }
  busy = true;
  showCode();
  let dots = 0;
  const reading = setInterval(() => padStatus("Reading", ".".repeat((dots++ % 3) + 1).padEnd(8, " ")), 160);
  try {
    const payload = await decrypt(code);
    clearInterval(reading);
    try { sessionStorage.setItem("unlocked-v2", JSON.stringify(payload)); } catch (err) { /* storage blocked */ }
    padStatus("Open", "  ok");
    failures = 0;
    setTimeout(() => {
      busy = false;
      closePad();
      peelSticker();
      applyUnlock(payload);
      setTimeout(() => select(index), reducedMotion ? 0 : 420);
    }, 380);
  } catch (err) {
    clearInterval(reading);
    busy = false;
    failures++;
    // Back off after a few misses: 1s, 2s, 4s, ... up to 30s.
    if (failures >= 3) waitUntil = Date.now() + Math.min(30000, 1000 * 2 ** (failures - 3));
    code = "";
    padStatus("Wrong", "  code");
    hatch.classList.remove("shake");
    void hatch.offsetWidth;
    hatch.classList.add("shake");
    setTimeout(showCode, 900);
  }
}

function peelSticker() {
  const sticker = $("sticker");
  if (reducedMotion) return;
  sticker.classList.remove("peel");
  void sticker.offsetWidth;
  sticker.classList.add("peel");
  setTimeout(() => sticker.classList.remove("peel"), 700);
}

// Already unlocked earlier in this tab: restore quietly.
try {
  const saved = sessionStorage.getItem("unlocked-v2");
  if (saved) applyUnlock(JSON.parse(saved));
} catch (err) { /* storage blocked or bad data */ }

function closePad() {
  if (!controls.classList.contains("open")) return;
  controls.classList.remove("open");
  hatch.inert = true;
  if (play.hasAttribute("aria-expanded")) play.setAttribute("aria-expanded", "false");
}

function pressPad(k) {
  if (busy) return;
  if (k === "OK") { submitCode(); return; }
  if (k === "C") code = "";
  else if (/^\d$/.test(k) && code.length < MAX_CODE) code += k;
  showCode();
}

play.addEventListener("click", () => {
  if (controls.classList.contains("open")) closePad();
  else openCurrent();
});
hatch.addEventListener("click", (e) => {
  const key = e.target.closest(".pad-key");
  if (key && !key.disabled) pressPad(key.dataset.k);
});

function flashKey(k) {
  const key = hatch.querySelector(`[data-k="${k}"]`);
  if (!key) return;
  key.classList.add("pressed");
  setTimeout(() => key.classList.remove("pressed"), 120);
}

$("prev").addEventListener("click", () => select(index - 1));
$("next").addEventListener("click", () => select(index + 1));

// Liner notes: a booklet that slides out of the case.
const liner = $("liner");
const tracklist = $("tracklist");

function fillTracklist() {
  tracklist.replaceChildren(...DISCS.map((d, i) => {
    const li = document.createElement("li");
    const num = document.createElement("span");
    num.className = "track-num";
    num.textContent = pad(i + 1);
    const name = document.createElement("span");
    if (d.redacted) {
      name.className = "redact";
      name.style.setProperty("--len", d.title.length);
      name.textContent = "Redacted";
    } else {
      name.textContent = d.title;
    }
    const kind = document.createElement("span");
    kind.className = "track-kind";
    kind.textContent = d.kind;
    li.append(num, name, kind);
    return li;
  }));
}

function openLiner() {
  fillTracklist();
  liner.showModal();
  requestAnimationFrame(() => liner.classList.add("in"));
}

function closeLiner() {
  if (!liner.open) return;
  liner.classList.remove("in");
  setTimeout(() => liner.close(), reducedMotion ? 0 : 280);
}

$("notes-btn").addEventListener("click", openLiner);
$("liner-close").addEventListener("click", closeLiner);
liner.addEventListener("cancel", (e) => { e.preventDefault(); closeLiner(); });
liner.addEventListener("click", (e) => { if (e.target === liner) closeLiner(); });
document.addEventListener("discs-unlocked", () => { if (liner.open) fillTracklist(); });
// Linking to #notes opens the booklet straight away.
if (location.hash === "#notes") requestAnimationFrame(openLiner);

// Keyboard: arrows step, number keys jump straight to a disc, Enter plays.
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || liner.open) return;
  if (e.target instanceof HTMLInputElement && e.target.name === "theme") return; // arrows move the theme switch
  // While the keypad is open, number keys type into it instead of changing disc.
  if (controls.classList.contains("open")) {
    if (/^\d$/.test(e.key)) { pressPad(e.key); flashKey(e.key); return; }
    if (e.key === "Backspace") { code = code.slice(0, -1); showCode(); return; }
    if (e.key === "Escape") { closePad(); play.focus(); return; }
    if (e.key === "Enter") { e.preventDefault(); pressPad("OK"); flashKey("OK"); return; }
  }
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); select(index + 1); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); select(index - 1); }
  else if (/^[1-9]$/.test(e.key) && Number(e.key) <= DISCS.length) select(Number(e.key) - 1);
  else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) openCurrent();
});

// Wheel: one disc per gesture on screens where the page itself does not scroll.
// A trackpad flick keeps sending fading inertial events for a second or so; those
// are swallowed. A new push shows up as deltas climbing again after they had
// clearly faded (or as a reversal),
// and each mouse-wheel notch arrives after a pause, so both count as new gestures.
const fixedLayout = window.matchMedia("(min-width: 900px) and (min-height: 700px)");
let wheelSum = 0;
let wheelLocked = false;
let wheelPeak = 0;   // biggest delta since the last step
let wheelTrough = 0; // smallest delta after that peak
let wheelIdle = 0;
window.addEventListener("wheel", (e) => {
  if (!fixedLayout.matches || controls.classList.contains("open") || liner.open) return;
  e.preventDefault();
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const size = Math.abs(delta);
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelLocked = false; wheelSum = 0; }, 140);
  if (wheelLocked) {
    if (size > wheelPeak) { wheelPeak = size; wheelTrough = size; }
    else wheelTrough = Math.min(wheelTrough, size);
    const reversed = Math.sign(delta) !== Math.sign(wheelSum) && size > 4;
    const faded = wheelTrough < wheelPeak * 0.5;
    const freshPush = faded && size > 12 && size > wheelTrough * 2.5;
    if (reversed || freshPush) { wheelLocked = false; wheelSum = 0; }
  }
  if (wheelLocked) return;
  wheelSum += delta;
  if (Math.abs(wheelSum) > 24) {
    select(index + Math.sign(wheelSum));
    wheelLocked = true;
    wheelPeak = wheelTrough = size;
    wheelSum = Math.sign(wheelSum) * 0.001;
  }
}, { passive: false });

// Horizontal swipe on the deck.
let swipeX = null;
const deck = $("deck");
deck.addEventListener("pointerdown", (e) => { swipeX = e.clientX; });
deck.addEventListener("pointerup", (e) => {
  if (swipeX === null || document.documentElement.dataset.theme === "space") { swipeX = null; return; }
  const dx = e.clientX - swipeX;
  swipeX = null;
  if (Math.abs(dx) > 50) select(index + (dx < 0 ? 1 : -1));
});

new ResizeObserver(() => { moveClamp(); clampX = clamp.style.getPropertyValue("--x"); }).observe(glass);

// Re-wrap the mosaic when the description column changes width.
let wrapWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  if (width !== wrapWidth && DISCS[index].redacted) mosaic($("desc"), DISCS[index].text, 5, false);
  wrapWidth = width;
}).observe($("desc"));

// Date stamp, like an old digital camera.
const now = new Date();
$("stamp").textContent = `'${String(now.getFullYear()).slice(2)} ${pad(now.getMonth() + 1)} ${pad(now.getDate())}`;

// Canvas text needs the web fonts, so wait for them before the first draw.
document.fonts.ready.then(() => {
  if (!document.documentElement.classList.contains("booting")) select(index);
});
// Themes. The choice is remembered per browser when storage is available.
const THEMES = ["room", "space"];
const themeSwitch = $("theme-switch");
const room = document.querySelector(".room");

function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : "room";
  document.documentElement.dataset.theme = theme;
  themeSwitch.style.setProperty("--i", THEMES.indexOf(theme));
  $(`theme-${theme}`).checked = true;
  closePad();
  if (theme === "space" && window.Orbit) Orbit.start(index);
  else if (window.Orbit) Orbit.stop();
  moveClamp();
  clampX = clamp.style.getPropertyValue("--x");
  try { localStorage.setItem("theme", theme); } catch (err) { /* storage blocked */ }
}

themeSwitch.addEventListener("change", (e) => {
  const next = e.target.value;
  if (reducedMotion) { applyTheme(next); return; }
  // Fade to black, swap reels, fade back up.
  const root = document.documentElement;
  root.classList.add("cut");
  setTimeout(() => {
    applyTheme(next);
    requestAnimationFrame(() => root.classList.remove("cut"));
  }, 320);
});

// ?theme=space in the address wins, so a theme can be linked directly.
let savedTheme = new URLSearchParams(location.search).get("theme");
if (!savedTheme) {
  try { savedTheme = localStorage.getItem("theme") || "room"; } catch (err) { savedTheme = "room"; }
}

// Dragging the ring in space hands the disc it settles on back to the player.
if (window.Orbit) Orbit.onSelect = (i) => { if (i !== index) select(i); };

select(0);
applyTheme(savedTheme);
if (hasIcons) Icons.start({ reducedMotion });

// Quality fader: pixel art on the left, the original look at 40, cinema on the right.
// Cheap visual changes (letterbox, grade, bloom) follow the fader live; re-rendering
// work waits for the fader to settle, and disc labels are redrawn on release.
const fader = $("quality");
let qualityTimer = 0;
function qualityName(q) {
  return q < 0.25 ? "pixel" : q > 0.7 ? "cinema" : "film";
}
function applyQuality(q, { heavy = true, labels = false } = {}) {
  const root = document.documentElement;
  const cine = Math.max(0, (q - 0.6) / 0.4);
  root.style.setProperty("--q", q.toFixed(3));
  root.style.setProperty("--cine", cine.toFixed(3));
  root.dataset.quality = qualityName(q);
  fader.style.setProperty("--fill", `${(q * 100).toFixed(1)}%`);
  fader.setAttribute("aria-valuetext", `${Math.round(q * 100)}, ${qualityName(q)}`);
  if (!heavy) return;
  clearTimeout(qualityTimer);
  qualityTimer = setTimeout(() => {
    if (hasIcons) Icons.setQuality(q);
    if (window.Orbit) Orbit.setQuality(q);
    if (window.Film) Film.setQuality(q);
    if (labels && hasIcons) Icons.thumbs().forEach((src, i) => { discButtons[i].querySelector("img").src = src; });
  }, 90);
}
fader.addEventListener("input", () => applyQuality(fader.value / 100));
fader.addEventListener("change", () => {
  const q = fader.value / 100;
  applyQuality(q, { labels: true });
  try { localStorage.setItem("quality", String(fader.value)); } catch (err) { /* storage blocked */ }
});
fader.addEventListener("keydown", (e) => e.stopPropagation()); // arrows move the fader, not the discs
{
  let saved = new URLSearchParams(location.search).get("quality");
  if (saved === null) { try { saved = localStorage.getItem("quality"); } catch (err) { saved = null; } }
  const v = Math.max(0, Math.min(100, Number(saved ?? 40)));
  fader.value = Number.isFinite(v) ? v : 40;
  applyQuality(fader.value / 100, { labels: true });
}

// Power-on intro, first visit only: lights come up, the display says hello,
// discs load one by one, and the clamp sets down on disc 1. Any key or click skips it.
(function boot() {
  const root = document.documentElement;
  let seen = false;
  try { seen = localStorage.getItem("booted") === "1"; } catch (err) { seen = false; }
  const params = new URLSearchParams(location.search);
  if ((seen && !params.has("intro")) || reducedMotion || params.has("nointro")) return;

  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  let done = false;

  root.classList.add("booting");
  clamp.classList.add("lifted");
  $("track").textContent = "--";
  $("title").textContent = "HELLO";
  $("kind").textContent = "";

  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    root.classList.remove("booting", "power");
    root.classList.add("loading");
    setTimeout(() => root.classList.remove("loading"), 1200);
    $("title").classList.remove("blink");
    select(index);
    setTimeout(() => clamp.classList.remove("lifted"), 260);
    window.removeEventListener("keydown", skip, true);
    window.removeEventListener("pointerdown", skip, true);
    try { localStorage.setItem("booted", "1"); } catch (err) { /* storage blocked */ }
  }
  function skip() { finish(); }

  at(250, () => { root.classList.add("power"); $("title").classList.add("blink"); });
  at(1250, () => { if (window.Orbit) Orbit.kick(0.35); });
  at(1250, finish);
  window.addEventListener("keydown", skip, true);
  window.addEventListener("pointerdown", skip, true);
})();
