// The archive: five discs, one in front. Every disc except Undertone is sealed: its title
// and description are filler text drawn as a mosaic, so the real wording never ships in
// the page source. Sealed discs carry no link at all; the real ones live encrypted in
// locks.json and only appear after the keypad code decrypts them.
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
    status: "archived",
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

const VERSION = new URL(import.meta.url).searchParams.get("v") || "";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const code = (i) => `DSC_${pad(i + 1)}`;
const kindOf = (d) => (d.status ? `${d.kind}, ${d.status}` : d.kind);

let index = 0;
let scene = null;

// ── Index list (left column; a row of codes on phones) ───────────────
const indexList = $("index-list");
const indexButtons = DISCS.map((d, i) => {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "index-item";
  btn.innerHTML = `<span class="index-code">${code(i)}</span><span class="index-kind"></span>`;
  btn.addEventListener("click", () => select(i));
  li.appendChild(btn);
  indexList.appendChild(li);
  return btn;
});

function refreshIndex() {
  indexButtons.forEach((btn, i) => {
    const d = DISCS[i];
    btn.querySelector(".index-kind").textContent = d.redacted ? d.kind : `${d.title}, ${d.kind}`;
    btn.setAttribute("aria-label", d.redacted ? `${code(i)}, sealed ${d.kind}` : `${code(i)}, ${d.title}`);
    btn.setAttribute("aria-current", i === index ? "true" : "false");
  });
}

// ── Dial: a ring of ticks around the disc. It turns so the selected disc's mark
//    sits under the pointer at the top. ────────────────────────────────
const dial = $("dial");
const SVG = "http://www.w3.org/2000/svg";
const dialRing = document.createElementNS(SVG, "g");
dialRing.setAttribute("class", "dial-ring");
for (let deg = 0; deg < 360; deg += 2) {
  const major = deg % 30 === 0;
  const t = document.createElementNS(SVG, "line");
  t.setAttribute("x1", "0");
  t.setAttribute("x2", "0");
  t.setAttribute("y1", String(-94));
  t.setAttribute("y2", String(major ? -89 : -91.5));
  t.setAttribute("class", major ? "tick tick-major" : "tick");
  t.setAttribute("transform", `rotate(${deg})`);
  dialRing.appendChild(t);
}
const STEP = 360 / DISCS.length;
const dialMarks = DISCS.map((d, i) => {
  const g = document.createElementNS(SVG, "g");
  g.setAttribute("transform", `rotate(${i * STEP})`);
  const line = document.createElementNS(SVG, "line");
  line.setAttribute("x1", "0");
  line.setAttribute("x2", "0");
  line.setAttribute("y1", "-96");
  line.setAttribute("y2", "-86");
  line.setAttribute("class", "dial-mark");
  const label = document.createElementNS(SVG, "text");
  label.setAttribute("x", "0");
  label.setAttribute("y", "-80");
  label.setAttribute("class", "mark-num");
  label.textContent = pad(i + 1);
  g.append(line, label);
  dialRing.appendChild(g);
  return g;
});
const pointer = document.createElementNS(SVG, "path");
pointer.setAttribute("d", "M -2.4 -99.5 L 2.4 -99.5 L 0 -95.5 Z");
pointer.setAttribute("class", "pointer");
dial.append(dialRing, pointer);
let dialAngle = 0;

function turnDial() {
  dialMarks.forEach((g, i) => g.classList.toggle("on", i === index));
  if (scene) return; // the 3D view drives the dial frame by frame (see onFrame)
  // Take the short way round.
  const goal = -index * STEP;
  const delta = ((goal - dialAngle) % 360 + 540) % 360 - 180;
  dialAngle += delta;
  dialRing.style.transform = `rotate(${dialAngle}deg)`;
  placePlayhead(index);
}

// Called every frame by the 3D view with the carousel's actual position.
function onFrame(p) {
  dialRing.style.transform = `rotate(${-p * STEP}deg)`;
  placePlayhead(p);
  markLoaded(1);
}

// ── Timeline: the discs laid out on a track, with a playhead that follows the carousel.
//    Drag along it to scrub; release and it settles on the nearest disc. ───────────
const track = $("track");
const needle = $("needle");
const trackSlots = DISCS.map((d, i) => {
  const li = document.createElement("li");
  li.style.setProperty("--at", DISCS.length > 1 ? i / (DISCS.length - 1) : 0.5);
  li.innerHTML = `<span class="slot-disc"></span><span class="slot-code">${pad(i + 1)}</span>`;
  $("track-slots").appendChild(li);
  return li;
});

function placePlayhead(p) {
  const at = Math.max(0, Math.min(1, p / (DISCS.length - 1)));
  needle.style.setProperty("--at", at);
}

let scrubbing = false;
function trackValue(e) {
  const r = track.getBoundingClientRect();
  const inset = parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const x = (e.clientX - r.left - inset) / Math.max(1, r.width - inset * 2);
  return Math.max(0, Math.min(1, x)) * (DISCS.length - 1);
}
track.addEventListener("pointerdown", (e) => {
  scrubbing = true;
  track.setPointerCapture(e.pointerId);
  track.classList.add("scrubbing");
  if (scene) scene.scrub(trackValue(e));
  else select(Math.round(trackValue(e)));
});
track.addEventListener("pointermove", (e) => {
  if (!scrubbing) return;
  if (scene) scene.scrub(trackValue(e));
  else select(Math.round(trackValue(e)));
});
const endScrub = () => {
  if (!scrubbing) return;
  scrubbing = false;
  track.classList.remove("scrubbing");
  scene?.endScrub();
};
track.addEventListener("pointerup", endScrub);
track.addEventListener("pointercancel", endScrub);

// ── Mosaic: draw text, shrink it, scale it back up with hard edges ───
function mosaic(el, text, block, singleLine) {
  const cs = getComputedStyle(el);
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const size = parseFloat(cs.fontSize);
  const lineHeight = parseFloat(cs.lineHeight) || size * 1.3;
  const maxWidth = singleLine ? Infinity : el.clientWidth || 360;

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
  label.textContent = "Sealed";
  el.replaceChildren(small, label);
}

// ── Disc labels: ink printed on the mirrored face ────────────────────
const INK = "#16181d";
const ACCENT = "#e0442d";
function drawLabel(i, ctx, size) {
  const d = DISCS[i];
  const c = size / 2;
  const R = (r) => (r / 0.985) * c; // disc units to canvas pixels
  ctx.save();
  ctx.translate(c, c);

  // Rings
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  [R(0.86), R(0.36)].forEach((r) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });

  // Text running round the rim
  const rim = `SABU ARCHIVE   ${code(i)}   ${kindOf(d).toUpperCase()}   `;
  const repeated = rim.repeat(3);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = INK;
  ctx.font = `500 ${Math.round(size * 0.022)}px "Geist Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const rr = R(0.92);
  const per = (Math.PI * 2) / repeated.length;
  [...repeated].forEach((ch, k) => {
    ctx.save();
    ctx.rotate(k * per - Math.PI / 2);
    ctx.translate(0, -rr);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });

  // Code, large, above the hole
  ctx.globalAlpha = 0.92;
  ctx.font = `600 ${Math.round(size * 0.1)}px "Geist", ui-sans-serif, sans-serif`;
  ctx.fillText(code(i), 0, -R(0.6));

  // Title below the hole, or a redaction bar
  if (d.redacted) {
    const w = Math.min(R(1.05), d.title.length * size * 0.026);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-w / 2, R(0.52), w, size * 0.05);
  } else {
    ctx.font = `500 ${Math.round(size * 0.058)}px "Geist", ui-sans-serif, sans-serif`;
    ctx.fillText(d.title, 0, R(0.56));
  }
  ctx.globalAlpha = 0.7;
  ctx.font = `400 ${Math.round(size * 0.026)}px "Geist Mono", ui-monospace, monospace`;
  ctx.fillText(d.locked ? "SEALED" : d.url ? "OPEN" : "PRIVATE", 0, R(0.71));

  // One red index mark at twelve o'clock
  ctx.globalAlpha = 1;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(-size * 0.006, -R(0.86) - size * 0.03, size * 0.012, size * 0.03);
  ctx.restore();
}

// ── Reveal: the title rises letter by letter, the text darkens word by word ──
function revealLetters(el, text) {
  // Spaces stay plain text so long titles can still wrap between words.
  el.replaceChildren(...[...text].map((ch, k) => {
    if (ch === " ") return document.createTextNode(" ");
    const span = document.createElement("span");
    span.className = "ch";
    span.style.setProperty("--i", k);
    span.textContent = ch;
    return span;
  }));
  el.setAttribute("aria-label", text);
}

function revealWords(el, text) {
  const words = text.split(" ");
  el.replaceChildren(...words.flatMap((w, k) => {
    const span = document.createElement("span");
    span.className = "wd";
    span.style.setProperty("--i", k);
    span.textContent = w;
    return k < words.length - 1 ? [span, " "] : [span];
  }));
}

// ── The sheet on the right ───────────────────────────────────────────
const action = $("action");
const actionLabel = $("action-label");

function select(i) {
  index = (i + DISCS.length) % DISCS.length;
  const d = DISCS[index];
  refreshIndex();
  turnDial();
  scene?.setIndex(index);
  fallbackSpin();

  $("code").textContent = code(index);
  if (d.redacted) {
    mosaic($("title"), d.title, 7, true);
    mosaic($("text"), d.text, 5, false);
  } else {
    revealLetters($("title"), d.title);
    revealWords($("text"), d.text);
  }
  track.setAttribute("aria-valuenow", String(index + 1));
  track.setAttribute("aria-valuetext", d.redacted ? `${code(index)}, sealed` : `${code(index)}, ${d.title}`);
  trackSlots.forEach((li, k) => li.classList.toggle("on", k === index));
  $("kind").textContent = kindOf(d);
  $("stack").textContent = d.stack;
  $("access").textContent = d.url ? "Open" : d.locked ? "Sealed, needs a code" : "Private";

  action.classList.toggle("is-locked", Boolean(d.locked));
  if (d.url) {
    action.disabled = false;
    actionLabel.textContent = "Open project";
    action.setAttribute("aria-label", `Open ${d.title} in a new tab`);
  } else if (d.locked) {
    action.disabled = false;
    actionLabel.textContent = "Enter code";
    action.setAttribute("aria-label", `${code(index)} is sealed. Enter the code`);
  } else {
    action.disabled = true;
    actionLabel.textContent = "Private for now";
    action.removeAttribute("aria-label");
  }
}

function activate() {
  const d = DISCS[index];
  if (d.url) window.open(d.url, "_blank", "noopener");
  else if (d.locked) openPad();
}

action.addEventListener("click", activate);
$("prev").addEventListener("click", () => select(index - 1));
$("next").addEventListener("click", () => select(index + 1));

// ── Keypad. One code opens every sealed disc: locks.json holds their real title,
//    text, and link, encrypted (PBKDF2-SHA256 + AES-GCM) by tools/lock.mjs. A wrong
//    code simply fails to decrypt; nothing secret is in the page. ─────────
const keypad = $("keypad");
const okKey = keypad.querySelector('[data-k="OK"]');
const MAX_CODE = 12;
let entry = "";
let locks = null;
let busy = false;
let failures = 0;
let waitUntil = 0;

fetch(`locks.json?v=${VERSION}`)
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => { locks = data; showCode(); })
  .catch(() => { locks = null; });

function padStatus(left, right) {
  $("pad-status").textContent = left;
  $("pad-code").textContent = right;
}

function showCode() {
  const shown = "*".repeat(Math.min(entry.length, 8)) + (entry.length > 8 ? "+" : "");
  padStatus(locks ? "Code" : "Unavailable", entry ? shown.padEnd(8, "-") : "--------");
  okKey.disabled = !locks || busy || entry.length < 4;
}

function openPad() {
  entry = "";
  showCode();
  keypad.showModal();
}

function closePad() {
  if (keypad.open) keypad.close();
}

const b64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
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

function applyUnlock(payload) {
  Object.entries(payload).forEach(([k, real]) => {
    const i = Number(k);
    if (!DISCS[i]) return;
    DISCS[i] = { ...DISCS[i], ...real, redacted: false, locked: false };
    scene?.setLabel(i);
  });
  if (info.open) fillInfo();
}

async function submitCode() {
  if (!locks || busy || entry.length < 4) return;
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
    const payload = await decrypt(entry);
    clearInterval(reading);
    try { sessionStorage.setItem("unlocked-v2", JSON.stringify(payload)); } catch (err) { /* storage blocked */ }
    padStatus("Open", "      ok");
    failures = 0;
    setTimeout(() => {
      busy = false;
      closePad();
      applyUnlock(payload);
      select(index);
    }, 420);
  } catch (err) {
    clearInterval(reading);
    busy = false;
    failures++;
    // Back off after a few misses: 1s, 2s, 4s, ... up to 30s.
    if (failures >= 3) waitUntil = Date.now() + Math.min(30000, 1000 * 2 ** (failures - 3));
    entry = "";
    padStatus("Wrong", "    code");
    keypad.classList.remove("shake");
    void keypad.offsetWidth;
    keypad.classList.add("shake");
    setTimeout(showCode, 900);
  }
}

function pressPad(k) {
  if (busy) return;
  if (k === "OK") { submitCode(); return; }
  if (k === "C") entry = "";
  else if (/^\d$/.test(k) && entry.length < MAX_CODE) entry += k;
  showCode();
}

function flashKey(k) {
  const key = keypad.querySelector(`[data-k="${k}"]`);
  if (!key) return;
  key.classList.add("pressed");
  setTimeout(() => key.classList.remove("pressed"), 120);
}

$("pad-grid").addEventListener("click", (e) => {
  const key = e.target.closest(".pad-key");
  if (key && !key.disabled) pressPad(key.dataset.k);
});
$("keypad-close").addEventListener("click", closePad);
keypad.addEventListener("click", (e) => { if (e.target === keypad) closePad(); });

// Already unlocked earlier in this tab: restore quietly.
try {
  const saved = sessionStorage.getItem("unlocked-v2");
  if (saved) applyUnlock(JSON.parse(saved));
} catch (err) { /* storage blocked or bad data */ }

// ── Info panel ───────────────────────────────────────────────────────
const info = $("info");
function fillInfo() {
  $("info-list").replaceChildren(...DISCS.map((d, i) => {
    const li = document.createElement("li");
    const c = document.createElement("span");
    c.className = "info-code";
    c.textContent = code(i);
    const name = document.createElement("span");
    name.textContent = d.redacted ? "Sealed" : d.title;
    if (d.redacted) name.className = "info-sealed";
    const kind = document.createElement("span");
    kind.className = "info-kind";
    kind.textContent = d.kind;
    li.append(c, name, kind);
    return li;
  }));
}
function openInfo() { fillInfo(); info.showModal(); }
$("info-btn").addEventListener("click", openInfo);
$("info-close").addEventListener("click", () => info.close());
info.addEventListener("click", (e) => { if (e.target === info) info.close(); });
// Old links to the liner notes (#notes) land on Info.
if (location.hash === "#info" || location.hash === "#notes") requestAnimationFrame(openInfo);

// ── Keyboard: arrows step, number keys jump, Enter opens ─────────────
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (keypad.open) {
    if (/^\d$/.test(e.key)) { pressPad(e.key); flashKey(e.key); return; }
    if (e.key === "Backspace") { entry = entry.slice(0, -1); showCode(); return; }
    if (e.key === "Enter") { e.preventDefault(); pressPad("OK"); flashKey("OK"); }
    return;
  }
  if (info.open || document.documentElement.classList.contains("opening")) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); select(index + 1); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); select(index - 1); }
  else if (/^[1-9]$/.test(e.key) && Number(e.key) <= DISCS.length) select(Number(e.key) - 1);
  else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) activate();
});

// ── Wheel: one disc per gesture where the page itself doesn't scroll ──
// A trackpad flick keeps sending fading inertial events for a second or so; those are
// swallowed. A new push shows up as deltas climbing again after they had clearly faded
// (or as a reversal), and each mouse-wheel notch arrives after a pause.
const fixedLayout = window.matchMedia("(min-width: 900px) and (min-height: 640px)");
let wheelSum = 0;
let wheelLocked = false;
let wheelPeak = 0;
let wheelTrough = 0;
let wheelIdle = 0;
window.addEventListener("wheel", (e) => {
  if (!fixedLayout.matches || keypad.open || info.open) return;
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

// ── No WebGL: a flat iridescent disc stands in ───────────────────────
const fallback = $("fallback-disc");
function fallbackSpin() {
  if (scene || reducedMotion) return;
  fallback.classList.remove("swap");
  void fallback.offsetWidth;
  fallback.classList.add("swap");
}

// Loading progress, 0 to 1, shown as the counter on the opening card.
let loaded = 0;
function markLoaded(v) { loaded = Math.max(loaded, v); }

async function startScene() {
  try {
    markLoaded(0.08);
    await Promise.race([
      Promise.all([document.fonts.load('600 40px "Geist"'), document.fonts.load('500 20px "Geist Mono"')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    markLoaded(0.3);
    const { create } = await import(`./scene.js?v=${VERSION}`);
    markLoaded(0.6);
    scene = create($("scene"), {
      count: DISCS.length,
      label: drawLabel,
      onSelect: select,
      onActivate: activate,
      onFrame,
      onProgress: markLoaded,
      holdIntro: document.documentElement.classList.contains("opening"),
    });
    scene.setIndex(index);
    document.documentElement.classList.add("has-scene");
    return true;
  } catch (err) {
    console.warn("3D view unavailable, showing a flat disc instead.", err);
    document.documentElement.classList.add("no-scene");
    markLoaded(1);
    return false;
  }
}

// ── Opening: a dark title card that draws the name, then lifts away ──
function runOpening() {
  const root = document.documentElement;
  const opening = $("opening");
  if (!root.classList.contains("opening")) { opening.remove(); return Promise.resolve(); }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { localStorage.setItem("opening-seen", "1"); } catch (err) { /* storage blocked */ }
      opening.classList.add("leave");
      root.classList.remove("opening");
      resolve();
      setTimeout(() => opening.remove(), 900);
    };
    $("opening-skip").addEventListener("click", finish);
    opening.addEventListener("click", finish);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Enter") finish(); }, { once: true });
    // The counter climbs with real loading progress. The card lifts once the name has
    // drawn (2.3s) and loading is done, or after 7s whatever happens.
    const counter = $("opening-count");
    const started = performance.now();
    let shown = 0;
    let last = started;
    const count = (now) => {
      if (done) return;
      // Follow real progress, but never faster than about 2 seconds for the full count.
      const dt = (now - last) / 1000;
      last = now;
      shown = Math.min(loaded * 100, shown + dt * 52);
      counter.textContent = String(Math.floor(shown)).padStart(3, "0");
      const elapsed = now - started;
      if ((elapsed > 2300 && shown >= 99.5) || elapsed > 7000) { counter.textContent = "100"; finish(); return; }
      requestAnimationFrame(count);
    };
    document.fonts.ready.then(() => {
      opening.classList.add("run");
      requestAnimationFrame(count);
    });
  });
}

select(0);
const sceneReady = startScene();
runOpening().then(async () => {
  if (await sceneReady) scene.intro();
});
