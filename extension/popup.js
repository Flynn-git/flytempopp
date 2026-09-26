const STORAGE_KEYS = {
  rate: "tempoRate",
  preservePitch: "preservePitch",
  lastDetection: "lastDetection",
  fxVolume: "fxVolume",
};

const semitonesInput = document.getElementById("semitones");
const rateLabel = document.getElementById("rateLabel");
const semiLabel = document.getElementById("semiLabel");
const preserveInput = document.getElementById("preservePitch");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const actualRateEl = document.getElementById("actualRate");

const trackInfoEl = document.getElementById("trackInfo");
const statsEl = document.getElementById("stats");
const origBpmEl = document.getElementById("origBpm");
const adjBpmEl = document.getElementById("adjBpm");
const origKeyEl = document.getElementById("origKey");
const adjKeyEl = document.getElementById("adjKey");
const detectBtn = document.getElementById("detectBtn");
const detectStatusEl = document.getElementById("detectStatus");
const progressEl = document.getElementById("progress");
const progressBar = progressEl.querySelector("div");

const supportEl = document.getElementById("support");
const supportArtistsEl = document.getElementById("supportArtists");
const supportStoresEl = document.getElementById("supportStores");

const fxFilterInput = document.getElementById("fx-filter");
const fxRows = document.querySelectorAll(".audiofx .fx-row[data-fx]");
const fxResetBtn = document.getElementById("fxResetBtn");
const fxStatusEl = document.getElementById("fxStatus");

const fxGridEl = document.getElementById("fxGrid");
const fxVolumeInput = document.getElementById("fxVolume");

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let currentTrack = { title: null, artist: null };
let lastDetection = null;
let isAnalyzing = false;
let detectionContext = null;

// ---- Tempo / pitch ----

function semitonesToRate(st) {
  return Math.pow(2, st / 12);
}

function formatRate(r) {
  return `${Number(r).toFixed(2)}×`;
}

function formatSemis(st) {
  const oct = st / 12;
  const sign = st > 0 ? "+" : "";
  // Whole octaves get the nicer "+1 oct" form; in-between values show both units.
  if (st !== 0 && st % 12 === 0) return `${sign}${oct} oct`;
  return `${sign}${st} st (${oct >= 0 ? "+" : ""}${oct.toFixed(2)} oct)`;
}

function setSemitonesUI(st) {
  const clamped = Math.max(-24, Math.min(12, Math.round(st)));
  semitonesInput.value = String(clamped);
  const rate = semitonesToRate(clamped);
  rateLabel.textContent = formatRate(rate);
  semiLabel.textContent = clamped === 0 ? "0 st · 0 oct" : formatSemis(clamped);
  renderAdjusted();
}

function currentRate() {
  return semitonesToRate(Number(semitonesInput.value));
}

function save() {
  chrome.storage.local.set({
    [STORAGE_KEYS.rate]: currentRate(),
    [STORAGE_KEYS.preservePitch]: preserveInput.checked,
  });
  syncFxBpm();
}

// ---- Popup helpers ----

async function getActiveYTMusicTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith("https://music.youtube.com")) return null;
  return tab;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function renderTrack() {
  if (currentTrack.title) {
    trackInfoEl.innerHTML = `<div>${escapeHtml(currentTrack.title)}</div>
      <div class="artist">${escapeHtml(currentTrack.artist || "")}</div>`;
  } else {
    trackInfoEl.innerHTML =
      `<span class="empty">Couldn't read track name (detection still works).</span>`;
  }
  renderSupport();
}

function renderSupport() {
  const { artists, track } = Support.links(currentTrack);
  supportEl.hidden = artists.length === 0 && track.length === 0;
  supportArtistsEl.replaceChildren(
    ...artists.map((a) => supportLink(a.url, `${a.name} on Bandcamp`))
  );
  supportStoresEl.replaceChildren(
    ...(track.length ? [document.createTextNode("This track: ")] : []),
    ...track.map((t) => supportLink(t.url, t.store))
  );
}

function supportLink(url, text) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  return a;
}

function renderAdjusted() {
  if (!lastDetection) {
    statsEl.hidden = true;
    return;
  }
  statsEl.hidden = false;
  const rate = currentRate();
  const preserve = preserveInput.checked;

  origBpmEl.textContent = lastDetection.bpm ? String(lastDetection.bpm) : "—";
  adjBpmEl.textContent = lastDetection.bpm ? (lastDetection.bpm * rate).toFixed(1) : "—";

  if (lastDetection.key) {
    origKeyEl.textContent = lastDetection.key.name;
    if (preserve) {
      adjKeyEl.textContent = lastDetection.key.name;
    } else {
      const semis = Number(semitonesInput.value);
      const shifted = shiftKey(lastDetection.key, semis);
      adjKeyEl.textContent = `${shifted}`;
    }
  } else {
    origKeyEl.textContent = "—";
    adjKeyEl.textContent = "—";
  }
}

function shiftKey(key, semitones) {
  const rounded = Math.round(semitones);
  const newRoot = ((key.root + rounded) % 12 + 12) % 12;
  return `${KEY_NAMES[newRoot]} ${key.mode}`;
}

async function refreshLiveState() {
  const tab = await getActiveYTMusicTab();
  if (!tab) {
    statusEl.textContent = "Open music.youtube.com to control playback.";
    actualRateEl.textContent = "";
    detectBtn.disabled = true;
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "ytm-tempo-get-state" });
    if (resp && resp.hasMedia) {
      statusEl.textContent = resp.isPlaying
        ? "Connected — changes apply instantly."
        : "Connected — press play to hear changes.";
      actualRateEl.textContent = `actual ${formatRate(resp.actualRate)}`;
      detectBtn.disabled = isAnalyzing || !resp.isPlaying;
      detectBtn.title = resp.isPlaying ? "" : "Start playback first — detection captures live audio.";

      const newTrack = { title: resp.title || null, artist: resp.artist || null };
      const changed =
        newTrack.title !== currentTrack.title || newTrack.artist !== currentTrack.artist;
      currentTrack = newTrack;
      if (changed) {
        renderTrack();
        if (
          newTrack.title &&
          lastDetection &&
          (lastDetection.title !== newTrack.title || lastDetection.artist !== newTrack.artist)
        ) {
          lastDetection = null;
          renderAdjusted();
          detectStatusEl.textContent = "Track changed — detect again to refresh.";
        }
      }
    } else {
      statusEl.textContent = "No track loaded yet — press play once.";
      actualRateEl.textContent = "";
      detectBtn.disabled = true;
      detectBtn.title = "Open YouTube Music and press play first.";
    }
  } catch {
    statusEl.textContent = "Reload the YouTube Music tab after installing.";
    actualRateEl.textContent = "";
    detectBtn.disabled = true;
  }
}

// ---- BPM/key detection ----

async function startDetection() {
  const tab = await getActiveYTMusicTab();
  if (!tab) {
    detectStatusEl.textContent = "Not on a YouTube Music tab.";
    return;
  }

  // Audio capture & offscreen are optional permissions — request them only when
  // the user actually wants detection. Must be in the user-gesture context of
  // this click, so we ask before changing any UI.
  const needed = { permissions: ["tabCapture", "offscreen"] };
  const alreadyHas = await chrome.permissions.contains(needed);
  if (!alreadyHas) {
    let granted = false;
    try {
      granted = await chrome.permissions.request(needed);
    } catch (e) {
      detectStatusEl.textContent = `Couldn't request permission: ${e.message}`;
      return;
    }
    if (!granted) {
      detectStatusEl.textContent =
        "Detection needs audio-capture permission. Grant it to enable BPM/key analysis.";
      return;
    }
  }

  isAnalyzing = true;
  detectBtn.disabled = true;
  detectBtn.textContent = "Listening…";
  detectStatusEl.textContent = "Capturing audio — keep this popup open.";
  progressEl.classList.add("active");
  progressBar.style.width = "0%";

  const snapshot = { ...currentTrack };

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "ytm-analyze-start",
      tabId: tab.id,
      duration: 12000,
    });
    if (!resp || !resp.ok) throw new Error(resp?.error || "failed to start");
  } catch (e) {
    finishDetectionUI();
    detectStatusEl.textContent = `Couldn't start: ${e.message}`;
    return;
  }

  detectionContext = { snapshot };
}

function finishDetectionUI() {
  isAnalyzing = false;
  detectBtn.disabled = false;
  detectBtn.textContent = "Detect BPM & key (~12 s)";
  progressEl.classList.remove("active");
  progressBar.style.width = "0%";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "ytm-analyze-progress") {
    progressBar.style.width = `${Math.round((msg.progress || 0) * 100)}%`;
    return;
  }
  if (msg.type === "ytm-analyze-done") {
    finishDetectionUI();
    const snap = detectionContext?.snapshot || currentTrack;
    lastDetection = {
      title: snap.title,
      artist: snap.artist,
      bpm: msg.bpm,
      key: msg.key,
      at: Date.now(),
    };
    chrome.storage.local.set({ [STORAGE_KEYS.lastDetection]: lastDetection });
    detectStatusEl.textContent = msg.bpm
      ? `Detected · confidence ${msg.key?.confidence ?? "—"}`
      : "Couldn't lock onto a beat — try again on a more rhythmic section.";
    renderAdjusted();
    syncFxBpm();
    return;
  }
  if (msg.type === "ytm-analyze-error") {
    finishDetectionUI();
    detectStatusEl.textContent = `Error: ${msg.error}`;
    return;
  }
});

// ---- Audio FX (filter, reverb, echo, flanger, phaser) ----

// The effects run in the YouTube Music tab (audiofx.js), which owns the state;
// the popup just mirrors it.

function renderFx(state) {
  if (!state) return;
  fxFilterInput.value = String(state.filter.on ? state.filter.amount : 0);
  fxRows.forEach((row) => {
    const fx = state[row.dataset.fx];
    row.querySelector("button").classList.toggle("on", fx.on);
    row.querySelector("input").value = String(fx.amount);
  });
}

// Tempo-adjusted BPM, so the echo stays in time with the track.
function adjustedBpm() {
  return lastDetection?.bpm ? lastDetection.bpm * currentRate() : null;
}

async function sendFx(msg) {
  const tab = await getActiveYTMusicTab();
  if (!tab) {
    fxStatusEl.textContent = "Open music.youtube.com to use audio effects.";
    return null;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { bpm: adjustedBpm(), ...msg });
    if (resp) {
      renderFx(resp.state);
      fxStatusEl.textContent = resp.ok ? "" : resp.error;
    }
    return resp;
  } catch {
    fxStatusEl.textContent = "Reload the YouTube Music tab to enable audio effects.";
    return null;
  }
}

function syncFxBpm() {
  sendFx({ type: "ytm-fx-set" });
}

async function loadFx() {
  const tab = await getActiveYTMusicTab();
  if (!tab) return;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "ytm-fx-get" });
    if (resp?.ok) renderFx(resp.state);
  } catch {}
}

fxFilterInput.addEventListener("input", () => {
  const amount = Number(fxFilterInput.value);
  sendFx({ type: "ytm-fx-set", name: "filter", on: amount !== 0, amount });
});
fxFilterInput.addEventListener("dblclick", () => {
  fxFilterInput.value = "0";
  sendFx({ type: "ytm-fx-set", name: "filter", on: false, amount: 0 });
});

fxRows.forEach((row) => {
  const name = row.dataset.fx;
  const btn = row.querySelector("button");
  const slider = row.querySelector("input");
  btn.addEventListener("click", () => {
    sendFx({ type: "ytm-fx-set", name, on: !btn.classList.contains("on"), amount: Number(slider.value) });
  });
  slider.addEventListener("input", () => {
    sendFx({ type: "ytm-fx-set", name, amount: Number(slider.value) });
  });
});

fxResetBtn.addEventListener("click", () => sendFx({ type: "ytm-fx-reset" }));

// ---- Sound pads ----

function buildFxGrid() {
  fxGridEl.innerHTML = "";
  for (const fx of Effects.list) {
    const btn = document.createElement("button");
    btn.textContent = fx.label;
    btn.addEventListener("click", () => {
      try {
        fx.play();
      } catch (e) {
        console.error("[Tempo Fly] effect failed:", e);
      }
    });
    fxGridEl.appendChild(btn);
  }
}

// ---- Init & events ----

chrome.storage.local.get(
  [
    STORAGE_KEYS.rate,
    STORAGE_KEYS.preservePitch,
    STORAGE_KEYS.lastDetection,
    STORAGE_KEYS.fxVolume,
  ],
  (res) => {
    const rate = typeof res[STORAGE_KEYS.rate] === "number" ? res[STORAGE_KEYS.rate] : 1.0;
    const preserve =
      typeof res[STORAGE_KEYS.preservePitch] === "boolean" ? res[STORAGE_KEYS.preservePitch] : true;
    preserveInput.checked = preserve;
    if (res[STORAGE_KEYS.lastDetection]) lastDetection = res[STORAGE_KEYS.lastDetection];

    // Convert any persisted rate back to nearest semitone for the slider UI;
    // the underlying playback rate the content script sees is still continuous.
    const st = Math.round(12 * Math.log2(rate));
    setSemitonesUI(st);
    renderAdjusted();
    refreshLiveState();

    const vol = typeof res[STORAGE_KEYS.fxVolume] === "number" ? res[STORAGE_KEYS.fxVolume] : 0.8;
    fxVolumeInput.value = String(vol);
    Effects.setVolume(vol);
  }
);

semitonesInput.addEventListener("input", () => {
  setSemitonesUI(Number(semitonesInput.value));
  save();
});

preserveInput.addEventListener("change", () => {
  renderAdjusted();
  save();
});

resetBtn.addEventListener("click", () => {
  setSemitonesUI(0);
  save();
});

document.querySelectorAll(".presets button[data-semi]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const delta = Number(btn.getAttribute("data-semi"));
    // 0 = absolute reset; everything else is relative to current.
    const next = delta === 0 ? 0 : Number(semitonesInput.value) + delta;
    setSemitonesUI(next);
    save();
  });
});

fxVolumeInput.addEventListener("input", () => {
  const v = Number(fxVolumeInput.value);
  Effects.setVolume(v);
  chrome.storage.local.set({ [STORAGE_KEYS.fxVolume]: v });
});

detectBtn.addEventListener("click", startDetection);

buildFxGrid();
loadFx();
setInterval(refreshLiveState, 1500);
