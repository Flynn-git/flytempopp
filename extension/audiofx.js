// Audio FX: routes the YouTube Music player through a Web Audio chain so the
// popup can apply filter, flanger, phaser, echo and reverb to the track.
// Everything runs locally in the page. Nothing is recorded or sent anywhere.
//
// Chain: media → filter → flanger → phaser → echo → reverb → limiter → speakers.
// Each stage has a dry path, so an effect that's off passes audio untouched.

(() => {
  const SMOOTH = 0.03; // seconds; ramps parameter changes so they don't click

  let ctx = null;
  let chain = null;
  const sources = new WeakMap(); // media element → MediaElementAudioSourceNode
  let routedEl = null;

  // Current settings, owned here; the popup reads and writes them by message.
  const state = {
    filter: { on: false, amount: 0 },     // -1 (low-pass) … +1 (high-pass)
    flanger: { on: false, amount: 0.5 },
    phaser: { on: false, amount: 0.5 },
    echo: { on: false, amount: 0.4 },
    reverb: { on: false, amount: 0.35 },
    bpm: null, // adjusted BPM from the popup, used to sync the echo
  };

  const set = (param, value) => param.setTargetAtTime(value, ctx.currentTime, SMOOTH);

  // Wraps an effect with a dry/wet mix: input → dry → output, input → fx → wet → output.
  function mixStage(buildFx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0;
    input.connect(dry).connect(output);
    const fx = buildFx(input);
    fx.out.connect(wet).connect(output);
    return { input, output, dry, wet, ...fx };
  }

  function impulseResponse(seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return ir;
  }

  function buildChain() {
    // DJ-style filter: one knob, low-pass to the left, high-pass to the right.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 22000;
    lp.Q.value = 1.2;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 10;
    hp.Q.value = 1.2;
    lp.connect(hp);

    const flanger = mixStage((input) => {
      const delay = ctx.createDelay(0.02);
      delay.delayTime.value = 0.003;
      const feedback = ctx.createGain();
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.25;
      depth.gain.value = 0.002;
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      input.connect(delay);
      delay.connect(feedback).connect(delay);
      return { out: delay, feedback, depth };
    });

    const phaser = mixStage((input) => {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.5;
      depth.gain.value = 600;
      lfo.connect(depth);
      lfo.start();
      let node = input;
      for (let i = 0; i < 4; i++) {
        const ap = ctx.createBiquadFilter();
        ap.type = "allpass";
        ap.frequency.value = 900;
        ap.Q.value = 0.7;
        depth.connect(ap.frequency);
        node.connect(ap);
        node = ap;
      }
      return { out: node, rate: lfo.frequency };
    });

    const echo = mixStage((input) => {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.375;
      const feedback = ctx.createGain();
      const tone = ctx.createBiquadFilter(); // darkens each repeat
      tone.type = "lowpass";
      tone.frequency.value = 3500;
      input.connect(delay);
      delay.connect(tone).connect(feedback).connect(delay);
      return { out: delay, delay, feedback };
    });

    const reverb = mixStage((input) => {
      const conv = ctx.createConvolver();
      conv.buffer = impulseResponse(2.8, 2.5);
      input.connect(conv);
      return { out: conv };
    });

    hp.connect(flanger.input);
    flanger.output.connect(phaser.input);
    phaser.output.connect(echo.input);
    echo.output.connect(reverb.input);
    // Safety limiter: stacked effects can push loud masters past 0 dBFS.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    // The Web Audio compressor adds automatic make-up gain of
    // (1 / gain at 0 dBFS) ^ 0.6. Undo it so the dry signal stays at unity.
    const makeup = ctx.createGain();
    makeup.gain.value = Math.pow(10, (-(2 - 2 / 20) * 0.6) / 20);
    reverb.output.connect(limiter).connect(makeup).connect(ctx.destination);

    return { input: lp, lp, hp, flanger, phaser, echo, reverb };
  }

  function applyState() {
    if (!chain) return;
    const { filter, flanger, phaser, echo, reverb } = state;

    // Filter: exponential sweep so the knob feels even across its range.
    const f = filter.on ? filter.amount : 0;
    set(chain.lp.frequency, f < 0 ? 22000 * Math.pow(200 / 22000, -f) : 22000);
    set(chain.hp.frequency, f > 0 ? 10 * Math.pow(6000 / 10, f) : 10);

    set(chain.flanger.wet.gain, flanger.on ? 0.7 : 0);
    set(chain.flanger.feedback.gain, flanger.on ? 0.3 + 0.55 * flanger.amount : 0);
    set(chain.flanger.depth.gain, 0.0005 + 0.0025 * flanger.amount);

    set(chain.phaser.wet.gain, phaser.on ? 0.8 : 0);
    set(chain.phaser.rate, 0.1 + 1.4 * phaser.amount);

    // Echo syncs to half a beat when a BPM is known, otherwise 375 ms.
    const beat = state.bpm ? 60 / state.bpm : 0.75;
    set(chain.echo.delay.delayTime, Math.min(1.9, beat / 2));
    set(chain.echo.wet.gain, echo.on ? 0.25 + 0.5 * echo.amount : 0);
    set(chain.echo.feedback.gain, echo.on ? 0.2 + 0.5 * echo.amount : 0);

    // Reverb: dry dips a little as the reverb rises, to keep loudness steady.
    set(chain.reverb.wet.gain, reverb.on ? 1.2 * reverb.amount : 0);
    set(chain.reverb.dry.gain, reverb.on ? 1 - 0.35 * reverb.amount : 1);
  }

  function findMedia() {
    return document.querySelector("video.html5-main-video") || document.querySelector("video, audio");
  }

  // Connects the player to the chain on first use. The media element's audio
  // is only routed once the AudioContext is actually running. Routing into a
  // suspended context would silence the track.
  async function ensureRouted() {
    const el = findMedia();
    if (!el) return { ok: false, error: "No track loaded yet — press play once." };
    if (!ctx) ctx = new AudioContext();
    if (ctx.state !== "running") {
      try { await ctx.resume(); } catch {}
    }
    if (ctx.state !== "running") {
      return { ok: false, error: "Click anywhere on the YouTube Music page, then try again." };
    }
    if (!chain) chain = buildChain();
    if (routedEl !== el) {
      let src = sources.get(el);
      if (!src) {
        src = ctx.createMediaElementSource(el);
        sources.set(el, src);
      }
      src.connect(chain.input);
      routedEl = el;
    }
    return { ok: true };
  }

  const anyOn = () => ["filter", "flanger", "phaser", "echo", "reverb"].some((k) => state[k].on);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("ytm-fx-")) return;

    if (msg.type === "ytm-fx-get") {
      sendResponse({ ok: true, state });
      return;
    }

    if (msg.type === "ytm-fx-set") {
      (async () => {
        const { name, on, amount, bpm } = msg;
        if (bpm !== undefined) state.bpm = bpm || null;
        if (name && state[name]) {
          if (typeof on === "boolean") state[name].on = on;
          if (typeof amount === "number") state[name].amount = amount;
        }
        if (anyOn() || chain) {
          const routed = await ensureRouted();
          if (!routed.ok) {
            if (name && state[name]) state[name].on = false;
            sendResponse({ ...routed, state });
            return;
          }
        }
        applyState();
        sendResponse({ ok: true, state });
      })();
      return true; // async response
    }

    if (msg.type === "ytm-fx-reset") {
      for (const k of ["filter", "flanger", "phaser", "echo", "reverb"]) state[k].on = false;
      state.filter.amount = 0;
      applyState();
      sendResponse({ ok: true, state });
    }
  });
})();
