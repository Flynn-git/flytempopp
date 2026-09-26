// Web Audio generators for the "DJ Tools" folder. Each takes an AudioContext
// and a destination node (e.g. the effects gain node) and schedules itself now.

function envelope(ctx, dest, attack, hold, release, peak = 1) {
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.setValueAtTime(peak, t + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  gain.connect(dest);
  return { gain, end: t + attack + hold + release };
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const GENERATORS = {
  airhorn(ctx, dest) {
    // Three short blasts of detuned sawtooths.
    [0, 0.22, 0.44].forEach((offset, i) => {
      const length = i === 2 ? 0.6 : 0.16;
      const gain = ctx.createGain();
      const t = ctx.currentTime + offset;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
      gain.gain.setValueAtTime(0.35, t + length);
      gain.gain.linearRampToValueAtTime(0, t + length + 0.05);
      gain.connect(dest);
      [466, 470, 587].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq * 0.97, t);
        osc.frequency.linearRampToValueAtTime(freq, t + 0.04);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + length + 0.06);
      });
    });
  },

  siren(ctx, dest) {
    const { gain, end } = envelope(ctx, dest, 0.02, 1.4, 0.3, 0.3);
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 700;
    lfo.frequency.value = 4;
    depth.gain.value = 250;
    lfo.connect(depth).connect(osc.frequency);
    osc.connect(gain);
    osc.start();
    lfo.start();
    osc.stop(end);
    lfo.stop(end);
  },

  riser(ctx, dest) {
    const seconds = 2.5;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(300, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(9000, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + seconds - 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    src.connect(filter).connect(gain).connect(dest);
    src.start();
  },

  rewind(ctx, dest) {
    const { gain, end } = envelope(ctx, dest, 0.01, 0.6, 0.2, 0.35);
    const osc = ctx.createOscillator();
    const wobble = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, end);
    wobble.frequency.value = 18;
    depth.gain.value = 120;
    wobble.connect(depth).connect(osc.frequency);
    osc.connect(gain);
    osc.start();
    wobble.start();
    osc.stop(end);
    wobble.stop(end);
  },

  laser(ctx, dest) {
    const { gain, end } = envelope(ctx, dest, 0.005, 0.05, 0.25, 0.3);
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(2400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, end);
    osc.connect(gain);
    osc.start();
    osc.stop(end);
  },

  "sub-drop"(ctx, dest) {
    const { gain, end } = envelope(ctx, dest, 0.01, 0.2, 1.2, 0.8);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, end);
    osc.connect(gain);
    osc.start();
    osc.stop(end);
  },
};

export function playSynth(id, ctx, dest) {
  const generate = GENERATORS[id];
  if (!generate) throw new Error(`Unknown synth effect: ${id}`);
  generate(ctx, dest);
}
