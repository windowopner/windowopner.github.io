// The player: six discs, one clamp, one display.
const DISCS = [
  {
    title: "StudyOS",
    kind: "Web app",
    stack: "Next.js, Supabase, Tailwind",
    text: "One place for a student's week: assignments, notes, flashcards, a to-do list, and an AI tutor.",
    url: null,
  },
  {
    title: "Undertone",
    kind: "macOS app",
    stack: "Swift",
    text: "A desktop background that moves with whatever music is playing, built on system audio capture.",
    url: null,
  },
  {
    title: "Folio",
    kind: "Website",
    stack: "HTML, CSS, JavaScript",
    text: "A place to publish letters, essays, and poems, shared by link or @handle.",
    url: "https://project-km7wz.vercel.app",
  },
  {
    title: "Y-Not Saloon",
    kind: "Website",
    stack: "HTML, CSS, JavaScript",
    text: "Website for a hair salon, in English, Malay, and Chinese.",
    url: "https://project-4g5vb.vercel.app",
  },
  {
    title: "Workspace Connector",
    kind: "MCP server",
    stack: "Python, FastAPI",
    text: "Lets Claude read my Classroom assignments and make Docs, Slides, and Drive files. Handles its own OAuth.",
    url: null,
  },
  {
    title: "WebGL Ripple",
    kind: "Experiment",
    stack: "Three.js, GLSL",
    text: "A water surface simulated on the GPU with the 2D wave equation. Move your cursor through it.",
    url: "ripple/",
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

// Build discs and the 1-6 indicator on the display.
const discButtons = DISCS.map((d, i) => {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "disc";
  btn.type = "button";
  btn.setAttribute("aria-label", `Disc ${i + 1}: ${d.title}`);
  btn.innerHTML = `
    <span class="disc-face">
      <span class="disc-label"><img alt="" width="56" height="56"></span>
      <span class="disc-hub"></span>
    </span>
    <span class="disc-num">${pad(i + 1)}</span>`;
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

function select(i) {
  index = (i + DISCS.length) % DISCS.length;
  const d = DISCS[index];

  discButtons.forEach((b, k) => b.setAttribute("aria-current", k === index ? "true" : "false"));
  [...slots.children].forEach((s, k) => s.classList.toggle("on", k === index));
  moveClamp();

  clearTimeout(scrambleTimer);
  $("track").textContent = pad(index + 1);
  writeDisplay($("title"), d.title.toUpperCase());
  $("kind").textContent = d.kind;
  $("desc").textContent = d.text;
  $("stack").textContent = d.stack;

  if (d.url) {
    play.href = d.url;
    play.removeAttribute("aria-disabled");
    play.setAttribute("aria-label", `Open ${d.title}`);
    play.innerHTML = '<i class="ph ph-play" aria-hidden="true"></i>';
    playLabel.textContent = "Play";
  } else {
    play.removeAttribute("href");
    play.setAttribute("aria-disabled", "true");
    play.setAttribute("aria-label", `${d.title} is private for now`);
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
}

$("prev").addEventListener("click", () => select(index - 1));
$("next").addEventListener("click", () => select(index + 1));

// Keyboard: arrows step, 1-6 jump straight to a disc, Enter plays.
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); select(index + 1); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); select(index - 1); }
  else if (/^[1-6]$/.test(e.key)) select(Number(e.key) - 1);
  else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) openCurrent();
});

// Wheel steps one disc per gesture on screens where the page itself does not scroll.
const fixedLayout = window.matchMedia("(min-width: 900px) and (min-height: 700px)");
let wheelSum = 0;
let wheelAt = 0;
let wheelIdle = 0;
window.addEventListener("wheel", (e) => {
  if (!fixedLayout.matches) return;
  e.preventDefault();
  wheelSum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => { wheelSum = 0; }, 180);
  const now = performance.now();
  if (Math.abs(wheelSum) > 40 && now - wheelAt > 300) {
    select(index + Math.sign(wheelSum));
    wheelSum = 0;
    wheelAt = now;
  }
}, { passive: false });

// Horizontal swipe on the deck.
let swipeX = null;
const deck = $("deck");
deck.addEventListener("pointerdown", (e) => { swipeX = e.clientX; });
deck.addEventListener("pointerup", (e) => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX;
  swipeX = null;
  if (Math.abs(dx) > 50) select(index + (dx < 0 ? 1 : -1));
});

new ResizeObserver(moveClamp).observe(glass);

// Date stamp, like an old digital camera.
const now = new Date();
$("stamp").textContent = `'${String(now.getFullYear()).slice(2)} ${pad(now.getMonth() + 1)} ${pad(now.getDate())}`;

select(0);
if (hasIcons) Icons.start({ reducedMotion });
