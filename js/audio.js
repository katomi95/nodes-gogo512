/* =========================================================================
 * audio.js  —  Web Audio による環境音（音声ファイル不要）
 *   ・低いドローン（うなりのある持続音）
 *   ・雨のようなノイズ
 *   ・ときどき遠くを通る電車のようなうねり
 *   ・接続／重ね／切断のごく小さな倍音（操作ごとに音色を変える）
 *  既定はOFF。右上のボタンで切り替える。
 * ========================================================================= */
(function (global) {
  'use strict';

  let ctx = null, master = null, started = false, enabled = false;
  let droneGain = null, rainGain = null, trainTimer = null;
  let tension = 0;

  function makeNoiseBuffer(c, sec) {
    const len = c.sampleRate * sec;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  function build() {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.6;
    droneGain.connect(lp); lp.connect(master);

    [55, 55.35, 82.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(g); g.connect(droneGain);
      o.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lg = ctx.createGain(); lg.gain.value = 0.18;
      lfo.connect(lg); lg.connect(g.gain);
      lfo.start();
    });

    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 4);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 500;
    rainGain = ctx.createGain(); rainGain.gain.value = 0.05;
    src.connect(bp); bp.connect(hp); hp.connect(rainGain); rainGain.connect(master);
    src.start();

    return true;
  }

  function train() {
    if (!ctx || !enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 180; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 2.2);
    g.gain.linearRampToValueAtTime(0, t + 6.5);
    f.frequency.setValueAtTime(120, t);
    f.frequency.linearRampToValueAtTime(240, t + 3);
    f.frequency.linearRampToValueAtTime(90, t + 6.5);
    src.start(t); src.stop(t + 7);
    schedule();
  }
  function schedule() {
    clearTimeout(trainTimer);
    trainTimer = setTimeout(train, 40000 + Math.random() * 70000);
  }

  function blip(freq, dur, vol, type) {
    if (!ctx || !enabled) return;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const API = {
    get enabled() { return enabled; },

    toggle() {
      if (!started) { if (!build()) return false; started = true; schedule(); }
      if (ctx.state === 'suspended') ctx.resume();
      enabled = !enabled;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(enabled ? 0.55 : 0.0, t + (enabled ? 3.0 : 1.2));
      return enabled;
    },

    setTension(v) {
      tension = Math.max(0, Math.min(1, v));
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      droneGain.gain.linearRampToValueAtTime(0.16 + tension * 0.12, t + 8);
      rainGain.gain.linearRampToValueAtTime(0.05 - tension * 0.03, t + 8);
    },

    /* 接続＝澄んだ音／重ね＝低くこもった音。耳でも区別がつくようにする */
    connect()  { blip(392 + Math.random() * 8, 1.6, 0.05, 'sine'); },
    merge()    { blip(174.6, 1.5, 0.06, 'triangle'); setTimeout(() => blip(233.1, 1.2, 0.035, 'triangle'), 130); },
    born()     { blip(523.25, 2.4, 0.055, 'sine'); setTimeout(() => blip(659.25, 2.0, 0.03, 'sine'), 240); },
    open()     { blip(880, 1.2, 0.03, 'sine'); },
    cutSound() { blip(150, 0.5, 0.05, 'triangle'); },
    erase()    { blip(87, 1.8, 0.07, 'triangle'); },
    deny()     { blip(196, 0.35, 0.025, 'sine'); },
    /* 置きかたが違う、という合図。否定より少しだけ含みのある二音 */
    nudge()    { blip(261.6, 0.5, 0.03, 'sine'); setTimeout(() => blip(311.1, 0.9, 0.028, 'sine'), 180); },
    toll()     { blip(65.4, 5.5, 0.10, 'sine'); }
  };

  global.GameAudio = API;
})(window);
