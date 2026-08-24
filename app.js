console.log("Novel Translator PWA v0.1 loaded");

const MODEL_PRIMARY = "gemini-3.5-flash-lite";
const MODEL_FALLBACK = "gemini-3.1-flash-lite";
const MODEL_QUALITY = "gemini-3.6-flash";
const CHUNK_TARGET = 4300;
const CHUNK_MAX = 5400;
const CONTEXT_CHARS = 450;

const CONTRACT = `Translate the following novel text completely into polished, natural Thai prose.
Do not omit, summarize, invent, censor, or alter meaning.
Preserve tone, dialogue intent, character attitude, names, terminology, relationships, and paragraph flow.
Preserve every number, quantity, measurement, price, date, age, weight, distance, and unit exactly in meaning.
Numeric formatting may be natural Thai, but the quantitative value and unit must not change.
Never invent, substitute, reinterpret, or silently convert a measurement unit.
Use natural professionally edited Thai fiction.
Avoid stiff, literal, awkward, or machine-like Thai.
Do not add translator notes, brackets, explanations, corrections, alternatives, reasoning, or commentary.
Return only the finished Thai novel translation.`;

const DEFAULT_GLOSSARY = `Yang Bin = หยางปิน
Lu Nan = หลู่หนาน
Binzi = ปินจื่อ
black sea bream = ปลากระพงดำ
gillnet = อวนติดตา
pound = ปอนด์
pounds = ปอนด์`;

const $ = id => document.getElementById(id);
const els = {
  source: $("sourceText"), result: $("resultText"), original: $("originalView"),
  api: $("apiKey"), instruction: $("instruction"), novel: $("novelName"),
  glossary: $("sourceOfTruth"), style: $("styleMemory"), feedback: $("feedback"),
  status: $("status"), feedbackStatus: $("feedbackStatus"), progress: $("progress"),
  bar: $("bar"), translate: $("translateBtn"), reader: $("readerCard"),
  originalBtn: $("originalBtn"), thaiBtn: $("thaiBtn"), online: $("onlinePill")
};

let activeController = null;
let translating = false;

init();

async function init() {
  loadSettings();
  updateOnline();
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);

  $("saveSettingsBtn").onclick = saveSettings;
  $("translateBtn").onclick = translate;
  $("cancelBtn").onclick = cancelTranslation;
  $("pasteBtn").onclick = pasteText;
  $("clearBtn").onclick = () => { els.source.value = ""; };
  $("copyBtn").onclick = copyThai;
  $("originalBtn").onclick = () => showView("original");
  $("thaiBtn").onclick = () => showView("thai");
  $("rememberBtn").onclick = rememberFeedback;
  $("clearCacheBtn").onclick = clearCache;

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch(e) { console.warn(e); }
  }
}

function updateOnline() {
  els.online.textContent = navigator.onLine ? "Online" : "Offline";
}

function loadSettings() {
  els.api.value = localStorage.getItem("nt_apiKey") || "";
  els.instruction.value = localStorage.getItem("nt_instruction") || "";
  els.novel.value = localStorage.getItem("nt_novel") || "Default";
  els.glossary.value = localStorage.getItem(profileKey("glossary")) || DEFAULT_GLOSSARY;
  els.style.value = localStorage.getItem(profileKey("style")) || "";
}

function profileKey(type, novel = null) {
  const name = (novel ?? els.novel?.value ?? "Default").trim() || "Default";
  return `nt_${type}_${name.toLowerCase()}`;
}

function saveSettings() {
  localStorage.setItem("nt_apiKey", els.api.value.trim());
  localStorage.setItem("nt_instruction", els.instruction.value.trim());
  localStorage.setItem("nt_novel", els.novel.value.trim() || "Default");
  localStorage.setItem(profileKey("glossary"), normalizeGlossary(els.glossary.value));
  localStorage.setItem(profileKey("style"), normalizeLines(els.style.value));
  els.status.textContent = "Settings saved";
}

els.novel.addEventListener("change", () => {
  localStorage.setItem("nt_novel", els.novel.value.trim() || "Default");
  els.glossary.value = localStorage.getItem(profileKey("glossary")) || DEFAULT_GLOSSARY;
  els.style.value = localStorage.getItem(profileKey("style")) || "";
});

async function pasteText() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) els.source.value = text;
  } catch {
    els.status.textContent = "Safari ไม่อนุญาตให้อ่าน Clipboard อัตโนมัติ — แตะช่องแล้ว Paste ได้ตามปกติ";
  }
}

async function copyThai() {
  try {
    await navigator.clipboard.writeText(els.result.textContent || "");
    els.status.textContent = "Copied Thai translation";
  } catch {
    els.status.textContent = "เลือกข้อความแล้ว Copy ได้ตามปกติ";
  }
}

function showView(view) {
  const original = view === "original";
  els.original.classList.toggle("hidden", !original);
  els.result.classList.toggle("hidden", original);
  els.originalBtn.classList.toggle("active", original);
  els.thaiBtn.classList.toggle("active", !original);
}

function cancelTranslation() {
  if (activeController) activeController.abort();
}

async function translate() {
  if (translating) return;
  const source = els.source.value.trim();
  const apiKey = els.api.value.trim();

  if (!source) return alert("วางต้นฉบับนิยายก่อน");
  if (!apiKey) return alert("ใส่ Gemini API Key ใน Advanced ก่อน");

  saveSettings();
  translating = true;
  activeController = new AbortController();
  els.translate.disabled = true;
  els.reader.classList.remove("hidden");
  els.original.textContent = source;
  els.result.textContent = "";
  showView("thai");
  els.progress.style.display = "block";
  els.bar.style.width = "0%";

  const chunks = buildChunks(source);
  let completed = 0;
  const outputs = new Array(chunks.length);

  try {
    let next = 0;
    const workers = Array.from({length: Math.min(2, chunks.length)}, async () => {
      while (true) {
        const i = next++;
        if (i >= chunks.length) return;
        if (activeController.signal.aborted) throw new DOMException("Aborted", "AbortError");

        const chunk = chunks[i];
        els.status.textContent = `Translating ${completed}/${chunks.length} · Gemini`;
        outputs[i] = await translateChunk(chunk, apiKey, activeController.signal);
        completed++;
        els.bar.style.width = `${Math.round(completed / chunks.length * 100)}%`;

        let visible = [];
        for (let j = 0; j < outputs.length; j++) {
          if (!outputs[j]) break;
          visible.push(outputs[j]);
        }
        els.result.textContent = visible.join("\n\n");
      }
    });

    await Promise.all(workers);
    els.result.textContent = outputs.join("\n\n");
    els.bar.style.width = "100%";
    els.status.textContent = "Translation complete";
  } catch (e) {
    if (e?.name === "AbortError") els.status.textContent = "Translation cancelled";
    else els.status.textContent = `Translation failed · ${e?.message || e}`;
  } finally {
    translating = false;
    activeController = null;
    els.translate.disabled = false;
    setTimeout(() => { if (!translating) els.progress.style.display = "none"; }, 900);
  }
}

async function translateChunk(chunk, apiKey, signal) {
  const prompt = buildPrompt(chunk);
  const hash = await sha256(`${MODEL_PRIMARY}\n${prompt}`);
  const cached = await cacheGet(hash);
  if (cached) return cached;

  let lastError;
  for (const model of [MODEL_PRIMARY, MODEL_FALLBACK, MODEL_QUALITY]) {
    try {
      const result = await callGemini(model, prompt, apiKey, signal);
      if (!result || result.trim().length < Math.max(30, chunk.text.length * 0.20)) {
        throw new Error("Output too short");
      }
      await cachePut(hash, result.trim());
      return result.trim();
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      lastError = e;
      if (e?.status === 401 || e?.status === 403) throw e;
    }
  }
  throw lastError || new Error("All models failed");
}

function buildPrompt(chunk) {
  const glossary = relevantGlossary(els.glossary.value, `${chunk.context}\n${chunk.text}`);
  const style = els.style.value.trim();
  const instruction = els.instruction.value.trim();

  return `${CONTRACT}

SOURCE OF TRUTH — mandatory exact mappings when relevant:
${glossary || "(none)"}

NOVEL STYLE MEMORY:
${style || "(none)"}

CURRENT USER INSTRUCTION:
${instruction || "(none)"}

MICRO-CONTEXT — context only, do not translate or repeat:
${chunk.context || "(none)"}

SOURCE TO TRANSLATE:
${chunk.text}`;
}

async function callGemini(model, prompt, apiKey, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json","x-goog-api-key":apiKey},
    body: JSON.stringify({
      contents: [{role:"user", parts:[{text:prompt}]}],
      generationConfig: {temperature:0.35}
    }),
    signal
  });

  if (!r.ok) {
    const err = new Error(`Gemini ${model}: HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("").trim();
  if (!text) throw new Error(`Gemini ${model}: empty response`);
  return text;
}

function buildChunks(source) {
  const paras = source.replace(/\r/g,"").split(/\n\s*\n|\n+/).map(x=>x.trim()).filter(Boolean);
  const chunks = [];
  let current = [];
  let len = 0;

  const flush = () => {
    if (!current.length) return;
    const text = current.join("\n\n");
    const previous = chunks.length ? chunks[chunks.length - 1].text : "";
    const context = previous ? previous.slice(-CONTEXT_CHARS) : "";
    chunks.push({text, context});
    current = []; len = 0;
  };

  for (const p of paras) {
    if (p.length > CHUNK_MAX) {
      flush();
      for (let i=0; i<p.length; i+=CHUNK_TARGET) {
        const text = p.slice(i, i+CHUNK_TARGET);
        const previous = chunks.length ? chunks[chunks.length - 1].text : "";
        chunks.push({text, context:previous.slice(-CONTEXT_CHARS)});
      }
      continue;
    }
    if (len && len + p.length + 2 > CHUNK_MAX) flush();
    current.push(p); len += p.length + 2;
    if (len >= CHUNK_TARGET) flush();
  }
  flush();
  return chunks;
}

function parseGlossary(text) {
  const out = [];
  for (const line of String(text||"").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const source = line.slice(0,i).trim();
    const target = line.slice(i+1).trim();
    if (source && target) out.push({source,target});
  }
  return out;
}

function relevantGlossary(text, haystack) {
  const h = haystack.toLocaleLowerCase();
  return parseGlossary(text)
    .filter(x => h.includes(x.source.toLocaleLowerCase()))
    .map(x => `${x.source} = ${x.target}`)
    .join("\n");
}

function normalizeGlossary(text) {
  const map = new Map();
  for (const x of parseGlossary(text)) map.set(x.source.toLocaleLowerCase(), x);
  return [...map.values()].map(x=>`${x.source} = ${x.target}`).join("\n");
}

function normalizeLines(text) {
  const seen = new Set(), out = [];
  for (const line of String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean)) {
    const k = line.toLocaleLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(line); }
  }
  return out.join("\n");
}

function rememberFeedback() {
  const raw = els.feedback.value.trim();
  if (!raw) return;
  const mappings = [], styles = [];
  for (const rawLine of raw.split(/\r?\n+/).map(x=>x.trim()).filter(Boolean)) {
    const m = parseNaturalMapping(rawLine);
    if (m) mappings.push(m); else styles.push(cleanStyle(rawLine));
  }

  const current = parseGlossary(els.glossary.value);
  const map = new Map(current.map(x=>[x.source.toLocaleLowerCase(),x]));
  mappings.forEach(x=>map.set(x.source.toLocaleLowerCase(),x));
  els.glossary.value = [...map.values()].map(x=>`${x.source} = ${x.target}`).join("\n");

  const styleLines = normalizeLines(`${els.style.value}\n${styles.filter(Boolean).join("\n")}`);
  els.style.value = styleLines;
  saveSettings();

  els.feedback.value = "";
  els.feedbackStatus.textContent = `Remembered · ${mappings.length} term · ${styles.filter(Boolean).length} style`;
}

function parseNaturalMapping(line) {
  line = line.replace(/^[\-\*•]+\s*/,"").replace(/\s+/g," ").trim();
  let m = line.match(/^(.+?)\s*(?:=|=>|->|→)\s*(.+)$/);
  if (m) return makeMapping(m[1],m[2]);
  m = line.match(/^(?:ต่อไป(?:นี้)?\s*)?(?:ให้\s*)?เปลี่ยน(?:คำว่า|ชื่อ|คำเรียก)?\s+(.+?)\s+(?:เป็น|มาเป็น)\s+(.+)$/i);
  if (m) return makeMapping(m[1],m[2]);
  m = line.match(/^(?:ต่อไป(?:นี้)?\s*)?(?:คำว่า|ชื่อ|คำเรียก|ศัพท์)?\s*(.+?)\s+(?:ให้ใช้|ใช้เป็น|ใช้)\s+(.+)$/i);
  if (m) return makeMapping(m[1],m[2]);
  m = line.match(/^(?:ต่อไป(?:นี้)?\s*)?(?:ให้\s*)?ใช้\s+(.+?)\s+แทน\s+(.+)$/i);
  if (m) return makeMapping(m[2],m[1]);
  m = line.match(/^(?:ต่อไป(?:นี้)?\s*)?(?:คำว่า|ชื่อ|ศัพท์)?\s*(.+?)\s+(?:ให้แปลว่า|แปลว่า|ให้แปลเป็น|แปลเป็น)\s+(.+)$/i);
  if (m) return makeMapping(m[1],m[2]);
  return null;
}

function makeMapping(a,b) {
  a = cleanSide(a); b = cleanSide(b);
  if (!a || !b || a === b || a.length > 120 || b.length > 120) return null;
  return {source:a,target:b};
}
function cleanSide(s) {
  return String(s||"").trim().replace(/^(?:คำว่า|ชื่อ|คำเรียก|ศัพท์)\s+/i,"")
    .replace(/^["'“‘`]|["'”’`]$/g,"").replace(/[。.!！?？]+$/,"").trim();
}
function cleanStyle(s) {
  return String(s||"").trim()
    .replace(/^(?:ต่อไป(?:นี้)?|จากนี้|หลังจากนี้)\s*/i,"")
    .replace(/^(?:ช่วย|ขอให้|อยากให้|ให้)\s*/i,"").slice(0,300).trim();
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

const DB_NAME = "NovelTranslatorPWA", STORE = "translations";
function openDB() {
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => {
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function cacheGet(key) {
  const db=await openDB();
  return new Promise(resolve=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(key);
    req.onsuccess=()=>resolve(req.result?.text||null);
    req.onerror=()=>resolve(null);
  });
}
async function cachePut(key,text) {
  const db=await openDB();
  return new Promise(resolve=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put({text,at:Date.now()},key);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>resolve();
  });
}
async function clearCache() {
  const db=await openDB();
  await new Promise(resolve=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete=()=>resolve(); tx.onerror=()=>resolve();
  });
  els.status.textContent="Cache cleared";
}
