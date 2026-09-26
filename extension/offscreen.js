// Offscreen document: captures tab audio via getUserMedia, records ~12s, then
// runs BPM and key analysis on the decoded buffer.

let activeStream = null;
let activeCtx = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "ytm-offscreen-start") {
    runAnalysis(msg.streamId, msg.duration).catch((e) => {
      chrome.runtime.sendMessage({
        type: "ytm-analyze-error",
        error: String(e.message || e),
      });
      cleanup();
    });
  }
});

function cleanup() {
  try { activeStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { activeCtx?.close(); } catch {}
  activeStream = null;
  activeCtx = null;
}

async function runAnalysis(streamId, duration) {
  // Acquire the captured tab stream.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });
  activeStream = stream;

  // Route captured audio back to the speakers (tabCapture mutes the source tab
  // otherwise — playback through this AudioContext restores audibility).
  const ctx = new AudioContext();
  activeCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  src.connect(ctx.destination);

  // Record the stream to a Blob for offline decoding.
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start();

  const startedAt = performance.now();
  const tick = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    chrome.runtime.sendMessage({
      type: "ytm-analyze-progress",
      progress: Math.min(1, elapsed / duration),
    }).catch(() => {});
  }, 250);

  await new Promise((r) => setTimeout(r, duration));
  recorder.stop();
  await stopped;
  clearInterval(tick);

  // Decode.
  const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new AudioContext();
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  decodeCtx.close();

  // Analyze.
  const bpm = await detectBPM(audioBuffer);
  const key = detectKey(audioBuffer);

  chrome.runtime.sendMessage({
    type: "ytm-analyze-done",
    bpm,
    key,
    duration,
  });
  cleanup();
}

// ---------- BPM: low-pass + peak histogram (Joe Sullivan style) ----------

async function detectBPM(audioBuffer) {
  const offline = new OfflineAudioContext(
    1,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;

  const lp = offline.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 150;

  const hp = offline.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 40;

  src.connect(hp).connect(lp).connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const data = rendered.getChannelData(0);
  const sr = rendered.sampleRate;

  // Peak picking: walk the signal in 0.5s windows, take samples above 0.85 *
  // local max, then enforce a min spacing of 200ms (300 BPM ceiling).
  const win = Math.floor(sr * 0.5);
  const minGap = Math.floor(sr * 0.2);
  const peaks = [];
  let lastPeak = -Infinity;

  for (let start = 0; start < data.length; start += win) {
    const end = Math.min(start + win, data.length);
    let localMax = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > localMax) localMax = v;
    }
    const thresh = 0.85 * localMax;
    if (thresh <= 0.001) continue;
    for (let i = start; i < end; i++) {
      if (Math.abs(data[i]) >= thresh && i - lastPeak > minGap) {
        peaks.push(i);
        lastPeak = i;
      }
    }
  }

  if (peaks.length < 4) return null;

  // Histogram of intervals (between successive peaks within 10 hops),
  // folded into 70..180 BPM range.
  const counts = new Map();
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < Math.min(i + 10, peaks.length); j++) {
      const intervalSec = (peaks[j] - peaks[i]) / sr;
      if (intervalSec <= 0) continue;
      let bpm = 60 / intervalSec;
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      // Soft binning: increment the rounded BPM and neighbours.
      const r = Math.round(bpm * 2) / 2; // half-BPM bins
      counts.set(r, (counts.get(r) || 0) + 1);
    }
  }

  let best = 0;
  let bestCount = 0;
  for (const [bpm, c] of counts) {
    if (c > bestCount) {
      best = bpm;
      bestCount = c;
    }
  }
  return Math.round(best);
}

// ---------- Key: chromagram + Krumhansl-Schmuckler correlation ----------

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function detectKey(audioBuffer) {
  const sr = audioBuffer.sampleRate;
  // Use channel 0; for stereo this is fine for the dominant-tonality estimate.
  const samples = audioBuffer.getChannelData(0);

  const FFT_SIZE = 4096;
  const HOP = 2048;

  // Hann window
  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }

  // Precompute bin → pitch class. Limit to A1..C7 (~55–2093 Hz).
  const half = FFT_SIZE / 2;
  const binPC = new Int8Array(half);
  for (let bin = 1; bin < half; bin++) {
    const freq = (bin * sr) / FFT_SIZE;
    if (freq < 55 || freq > 2100) {
      binPC[bin] = -1;
      continue;
    }
    const midi = 12 * Math.log2(freq / 440) + 69;
    binPC[bin] = ((Math.round(midi) % 12) + 12) % 12;
  }

  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const chroma = new Float64Array(12);

  for (let start = 0; start + FFT_SIZE <= samples.length; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[start + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let bin = 1; bin < half; bin++) {
      const pc = binPC[bin];
      if (pc < 0) continue;
      const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
      chroma[pc] += mag;
    }
  }

  // Normalise.
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i];
  if (sum <= 0) return null;
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  // Correlate against all 24 keys. Pearson correlation between the rotated
  // chroma and each profile.
  let bestScore = -Infinity;
  let bestRoot = 0;
  let bestMode = "maj";

  for (let root = 0; root < 12; root++) {
    const major = pearson(chroma, KS_MAJOR, root);
    if (major > bestScore) {
      bestScore = major;
      bestRoot = root;
      bestMode = "maj";
    }
    const minor = pearson(chroma, KS_MINOR, root);
    if (minor > bestScore) {
      bestScore = minor;
      bestRoot = root;
      bestMode = "min";
    }
  }

  return {
    root: bestRoot,
    mode: bestMode,
    name: `${KEY_NAMES[bestRoot]} ${bestMode}`,
    confidence: Number(bestScore.toFixed(3)),
  };
}

function pearson(chroma, profile, root) {
  let sumP = 0;
  let sumC = 0;
  for (let i = 0; i < 12; i++) {
    sumP += profile[i];
    sumC += chroma[(i + root) % 12];
  }
  const meanP = sumP / 12;
  const meanC = sumC / 12;
  let num = 0;
  let dp2 = 0;
  let dc2 = 0;
  for (let i = 0; i < 12; i++) {
    const dp = profile[i] - meanP;
    const dc = chroma[(i + root) % 12] - meanC;
    num += dp * dc;
    dp2 += dp * dp;
    dc2 += dc * dc;
  }
  const denom = Math.sqrt(dp2 * dc2);
  return denom === 0 ? 0 : num / denom;
}

// In-place Cooley-Tukey radix-2 FFT. n must be a power of two.
function fft(re, im) {
  const n = re.length;
  // bit-reverse permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const ang = step * k;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const xr = re[i + k + half];
        const xi = im[i + k + half];
        const tr = xr * wr - xi * wi;
        const ti = xr * wi + xi * wr;
        re[i + k + half] = re[i + k] - tr;
        im[i + k + half] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
      }
    }
  }
}
