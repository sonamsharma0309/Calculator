const $ = (s) => document.querySelector(s);

const expressionEl = $("#expression");
const resultEl = $("#result");
const statusEl = $("#status");

const historyList = $("#historyList");
const historyCount = $("#historyCount");

const toggleThemeBtn = $("#toggleTheme");
const clearHistoryBtn = $("#clearHistory");
const modeBtn = $("#modeBtn");
const modeLabel = $("#modeLabel");
const sciKeys = $("#sciKeys");

const kpiTotal = $("#kpiTotal");
const kpiLast = $("#kpiLast");
const kpiStatus = $("#kpiStatus");

const keys = document.querySelectorAll(".k");
const sciBtns = document.querySelectorAll(".s");

const tiltCard = $("#tiltCard");
const glare = $("#glare");

const LS_THEME = "calc_ui_theme_ld_v3";
const LS_MODE = "calc_mode_v3";
const LS_COLORLOCK = "calc_color_lock_v3";
const LS_COLORINDEX = "calc_color_index_v3";

let expr = "";
let lastWasResult = false;
let mode = localStorage.getItem(LS_MODE) || "standard";

/* ====== WOW palettes ====== */
const palettes = [
  { a:[124,92,255], b:[0,209,255] },
  { a:[255,65,108], b:[255,203,113] },
  { a:[46,229,157], b:[0,163,255] },
  { a:[255,91,248], b:[119,255,245] },
  { a:[255,180,0], b:[255,61,87] },
  { a:[140,255,0], b:[0,255,170] },
  { a:[0,200,255], b:[140,92,255] },
];

let colorIndex = Number(localStorage.getItem(LS_COLORINDEX) || "0");
let colorLocked = (localStorage.getItem(LS_COLORLOCK) || "0") === "1";
let colorTimer = null;

function setAccent(rgbA, rgbB){
  const root = document.documentElement.style;
  root.setProperty("--accent", `${rgbA[0]} ${rgbA[1]} ${rgbA[2]}`);
  root.setProperty("--accent2", `${rgbB[0]} ${rgbB[1]} ${rgbB[2]}`);
}

function applyPalette(i){
  const p = palettes[(i + palettes.length) % palettes.length];
  setAccent(p.a, p.b);
  localStorage.setItem(LS_COLORINDEX, String((i + palettes.length) % palettes.length));
}

function startAutoColors(){
  if(colorLocked) return;
  if(colorTimer) clearInterval(colorTimer);
  colorTimer = setInterval(() => {
    colorIndex = (colorIndex + 1) % palettes.length;
    applyPalette(colorIndex);
  }, 4200);
}

function toggleColorLock(){
  colorLocked = !colorLocked;
  localStorage.setItem(LS_COLORLOCK, colorLocked ? "1" : "0");
  setStatus(colorLocked ? "Colors frozen (Shift+L)" : "Dynamic colors ON (Shift+L)");
  if(colorLocked){
    if(colorTimer) clearInterval(colorTimer);
    colorTimer = null;
  }else{
    startAutoColors();
  }
}

/* ===== helpers ===== */
function prettify(s){
  return (s || "").replaceAll("*","×").replaceAll("/","÷").replaceAll("-","−");
}
function setStatus(msg=""){
  statusEl.textContent = msg;
  kpiStatus.textContent = msg || "Ready";
}
function flashShake(){
  const screen = document.querySelector(".screen");
  screen.classList.remove("shake");
  void screen.offsetWidth;
  screen.classList.add("shake");
}
function updateScreen(){ expressionEl.textContent = prettify(expr); }
function setResult(v){ resultEl.textContent = v; }

/* ===== Mode ===== */
function applyMode(m){
  mode = m;
  localStorage.setItem(LS_MODE, mode);
  modeLabel.textContent = mode === "scientific" ? "Scientific" : "Standard";
  sciKeys.classList.toggle("show", mode === "scientific");
}

/* ===== Input ===== */
function appendValue(v){
  if (lastWasResult && /[0-9.]/.test(v)) expr = "";
  lastWasResult = false;

  if (/[+\-*/]/.test(v)){
    if (!expr){
      if (v === "-") expr = "-";
      updateScreen();
      return;
    }
    if (/[+\-*/]$/.test(expr)) expr = expr.slice(0,-1) + v;
    else expr += v;
  } else {
    expr += v;
  }
  updateScreen();
}
function backspace(){
  if(!expr) return;
  expr = expr.slice(0,-1);
  updateScreen();
}
function clearAll(){
  expr = "";
  lastWasResult = false;
  updateScreen();
  setResult("0");
  setStatus("");
}

/* ===== Backend ===== */
async function loadStats(){
  const res = await fetch("/api/stats");
  const data = await res.json();
  if(!data.ok) return;
  kpiTotal.textContent = String(data.total);
  kpiLast.textContent = data.last || "—";
}

async function loadHistory(){
  const res = await fetch("/api/history");
  const data = await res.json();
  if(!data.ok) return;

  const items = data.items || [];
  historyCount.textContent = String(items.length);
  historyList.innerHTML = "";

  if(items.length === 0){
    const empty = document.createElement("div");
    empty.className = "item";
    empty.style.cursor = "default";
    empty.innerHTML = `<div class="ex">No history yet</div><div class="re">—</div>`;
    historyList.appendChild(empty);
    return;
  }

  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="ex">${prettify(it.expression)}</div>
      <div class="re">${it.result}</div>
      <div class="meta">Mode: ${it.mode} • ${it.created_at}</div>
    `;
    div.addEventListener("click", () => {
      expr = it.expression;
      lastWasResult = false;
      updateScreen();
      setResult(it.result);
      setStatus("Loaded");
      setTimeout(()=>setStatus(""),700);
    });
    historyList.appendChild(div);
  });
}

async function doEquals(){
  if(!expr) return;

  setStatus("Calculating...");
  const res = await fetch("/api/eval", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ expression: expr, mode })
  });

  const data = await res.json();

  if(!res.ok || !data.ok){
    setStatus(data.error || "Invalid");
    flashShake();
    return;
  }

  setResult(data.result);
  setStatus("OK");
  lastWasResult = true;
  await loadHistory();
  await loadStats();
}

/* ===== Buttons ===== */
function handleKey(btn){
  const action = btn.dataset.action;
  const value = btn.dataset.value;

  if(action === "ac") return clearAll();
  if(action === "del") return backspace();
  if(action === "eq") return doEquals();
  if(value) return appendValue(value);
}

keys.forEach(k => k.addEventListener("click", ()=>handleKey(k)));

sciBtns.forEach(b=>{
  b.addEventListener("click", ()=>{
    const fn = b.dataset.fn;
    const c = b.dataset.const;
    const v = b.dataset.value;
    if(fn) return appendValue(fn);
    if(c) return appendValue(c);
    if(v) return appendValue(v);
  });
});

/* ===== Theme toggle ===== */
function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(LS_THEME, theme);
  toggleThemeBtn.querySelector(".icon").textContent = theme === "light" ? "☀️" : "🌙";
}
toggleThemeBtn.addEventListener("click", ()=>{
  const current = document.documentElement.dataset.theme || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

/* ===== Mode + History ===== */
clearHistoryBtn.addEventListener("click", async ()=>{
  await fetch("/api/history/clear", { method: "POST" });
  setStatus("History cleared");
  setTimeout(()=>setStatus(""),900);
  await loadHistory();
  await loadStats();
});

modeBtn.addEventListener("click", ()=>{
  applyMode(mode === "standard" ? "scientific" : "standard");
  setStatus(mode === "scientific" ? "Scientific mode ON" : "Standard mode ON");
  setTimeout(()=>setStatus(""),900);
});

/* ===== 3D TILT (WOW) ===== */
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function onTiltMove(e){
  const r = tiltCard.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;   // 0..1
  const y = (e.clientY - r.top) / r.height;   // 0..1

  const rotY = (x - 0.5) * 18; // deg
  const rotX = (0.5 - y) * 14;

  tiltCard.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(0)`;
  glare.style.opacity = "1";

  const gx = clamp(x * 100, 0, 100);
  const gy = clamp(y * 100, 0, 100);
  glare.style.background = `radial-gradient(700px 520px at ${gx}% ${gy}%, rgba(255,255,255,.26), transparent 55%)`;
}

function onTiltLeave(){
  tiltCard.style.transform = `rotateX(0deg) rotateY(0deg)`;
  glare.style.opacity = "0";
}

tiltCard.addEventListener("mousemove", onTiltMove);
tiltCard.addEventListener("mouseleave", onTiltLeave);

/* ===== Shortcuts =====
Shift+T : next palette
Shift+L : lock/unlock
*/
window.addEventListener("keydown", (e)=>{
  const key = e.key;

  if(key === "Escape") return clearAll();
  if(key === "Backspace") return backspace();
  if(key === "Enter" || key === "=") return doEquals();

  if(/^[0-9]$/.test(key)) return appendValue(key);
  if(key === ".") return appendValue(".");
  if(["+","-","*","/"].includes(key)) return appendValue(key);
  if(key === "%") return appendValue("%");

  if(e.shiftKey && (key === "T" || key === "t")){
    colorIndex = (colorIndex + 1) % palettes.length;
    applyPalette(colorIndex);
    setStatus("Palette changed (Shift+T)");
    setTimeout(()=>setStatus(""),900);
  }
  if(e.shiftKey && (key === "L" || key === "l")){
    toggleColorLock();
    setTimeout(()=>setStatus(""),900);
  }
});

/* ===== init ===== */
(function init(){
  applyTheme(localStorage.getItem(LS_THEME) || "dark");
  applyMode(mode);

  applyPalette(colorIndex);
  startAutoColors();

  updateScreen();
  setResult("0");
  loadHistory();
  loadStats();

  setStatus(colorLocked ? "Colors frozen (Shift+L)" : "Dynamic colors ON (Shift+L)");
  setTimeout(()=>setStatus(""),1200);
})();
