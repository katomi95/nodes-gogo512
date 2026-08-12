/* =========================================================================
 * game.js  —  エンジン
 *   ノードの漂流／接続・切断・重ね・消す／章進行／セーブ／エンディング
 *   シナリオそのものは js/data/*.js 側にある。ここは触らなくても言葉は足せる。
 *
 *   操作の別（重要）
 *     接続  … 押す → もう一つ押す。線が残る。寒色で示す。
 *     重ね  … 掴んで相手の上ではなす。線は残らない。暖色で示す。
 *     ひらく… 点線で囲まれた言葉は、単独で押すだけで開く。
 *
 *   置きかたを取り違えたときは、線を引かずに crossHints を返す。
 *   （「組み合わせが外れた」ではなく「操作が違う」と伝えるため）
 * ========================================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const AUD = global.GameAudio;
  const SAVE_KEY = 'nanashi_save_v1';
  const SECRET_KEY = 'nanashi_secret';

  /* ───────── DOM ───────── */
  const $ = s => document.querySelector(s);
  const stage = $('#stage');
  const svg = $('#links');
  const layer = $('#nodes');
  const fx = $('#fx');
  const logEl = $('#log');
  const hintEl = $('#hint');
  const selTip = $('#seltip');
  const dragTip = $('#dragtip');

  /* ───────── データ索引 ───────── */
  const DEF = {};
  D.nodes.forEach(n => { DEF[n.id] = n; });

  const key2 = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  function index(list) {
    const m = {};
    list.forEach(r => { m[key2(r[0], r[1])] = r; });
    return m;
  }
  const R_CONNECT = index(D.recipes.connect);
  const R_OVERLAY = index(D.recipes.overlay);
  const R_CUT = index(D.recipes.cut);
  const R_END = index(D.recipes.endings);
  const R_WHIS = index(D.recipes.whispers);

  /* ───────── 世界 ───────── */
  let W = 1600, H = 1100;
  const cam = { x: 0, y: 0 };

  function sizeWorld() {
    W = Math.max(1500, innerWidth * 1.35);
    H = Math.max(1000, innerHeight * 1.35);
    fx.width = innerWidth; fx.height = innerHeight;
    clampCam();
  }
  function clampCam() {
    cam.x = Math.min(Math.max(cam.x, 0), Math.max(0, W - innerWidth));
    cam.y = Math.min(Math.max(cam.y, 0), Math.max(0, H - innerHeight));
  }

  /* ───────── 状態 ───────── */
  const S = {
    nodes: {},
    links: [],
    ever: new Set(),
    flags: new Set(),
    done: new Set(),
    inspected: new Set(),
    act: 1,
    ending: null
  };
  const SAPI = {
    get act() { return S.act; },
    has: id => !!S.nodes[id],
    ever: id => S.ever.has(id),
    flag: f => S.flags.has(f),
    countAny: list => list.reduce((n, id) => n + (S.ever.has(id) ? 1 : 0), 0)
  };

  let selected = null;
  let paused = true;

  /* ───────── ログ ───────── */
  function say(text, cls) {
    if (!text) return;
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    logEl.appendChild(d);
    setTimeout(() => d.remove(), 13000);
    while (logEl.children.length > 6) logEl.firstChild.remove();
  }
  function hint(text, ms) {
    hintEl.innerHTML = text || '';
    hintEl.style.opacity = text ? '1' : '0';
    if (ms) setTimeout(() => { if (hintEl.innerHTML === text) hintEl.style.opacity = '0'; }, ms);
  }

  /* ───────── ノード ───────── */
  function makeNode(id, x, y, label) {
    if (S.nodes[id]) return S.nodes[id];
    const def = DEF[id];
    if (!def) { console.warn('unknown node', id); return null; }

    const el = document.createElement('div');
    el.className = 'node ' + (def.size || 'md')
      + (def.uneasy ? ' uneasy' : '')
      + (def.locked ? ' locked' : '')
      + (def.inspect && !S.inspected.has(id) ? ' has-inspect' : '');
    el.dataset.id = id;
    const lbl = document.createElement('span');
    lbl.textContent = label || def.label;
    el.appendChild(lbl);
    layer.appendChild(el);

    const n = {
      id, def, el, lbl,
      label: label || def.label,
      x: x, y: y,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      fixed: !!def.fixed,
      locked: !!def.locked
    };
    S.nodes[id] = n;
    S.ever.add(id);
    place(n);
    measure(n);

    if (def.inspect && !S.inspected.has(id) && !S.flags.has('tip_inspect')) {
      S.flags.add('tip_inspect');
      setTimeout(() => say('点線で囲まれた言葉は、押すだけでひらく。'), 2600);
    }
    return n;
  }

  function freeSpot(cx, cy) {
    const m = 110;
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 110 + t * 6;
      const x = Math.min(W - m, Math.max(m, cx + Math.cos(a) * r));
      const y = Math.min(H - m, Math.max(m, cy + Math.sin(a) * r));
      let ok = true;
      for (const k in S.nodes) {
        const o = S.nodes[k];
        const rw = ((o.w || 90) / 2 + 110), rh = ((o.h || 26) / 2 + 34);
        if (Math.abs(o.x - x) < rw && Math.abs(o.y - y) < rh) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: cx + (Math.random() - .5) * 200, y: cy + (Math.random() - .5) * 200 };
  }

  function spawnNear(id, aId, bId, quiet) {
    if (S.nodes[id]) return null;
    const a = S.nodes[aId], b = S.nodes[bId];
    const cx = a && b ? (a.x + b.x) / 2 : (a ? a.x : W / 2);
    const cy = a && b ? (a.y + b.y) / 2 : (a ? a.y : H / 2);
    const p = freeSpot(cx, cy);
    const n = makeNode(id, p.x, p.y);
    if (n) {
      n.el.classList.add('newborn');
      if (!quiet && AUD) AUD.born();
    }
    return n;
  }

  function relabel(id, text) {
    const n = S.nodes[id];
    if (!n || n.label === text) return;
    const g = document.createElement('div');
    g.className = 'ghost';
    g.textContent = n.label;
    g.style.left = (n.x - cam.x) + 'px';
    g.style.top = (n.y - cam.y) + 'px';
    g.style.fontSize = getComputedStyle(n.el).fontSize;
    layer.appendChild(g);
    setTimeout(() => g.remove(), 1600);
    n.label = text;
    n.lbl.textContent = text;
  }

  function removeNode(id, silent) {
    const n = S.nodes[id];
    if (!n) return;
    if (selected === id) select(null);
    S.links = S.links.filter(l => {
      if (l.a === id || l.b === id) { l.el.remove(); return false; }
      return true;
    });
    n.el.classList.add('leaving');
    setTimeout(() => n.el.remove(), 1200);
    delete S.nodes[id];
    refreshHighlight();
    if (!silent) burst(n.x, n.y, 18);
  }

  /* ───────── 線 ───────── */
  function linkExists(a, b) {
    return S.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  }
  function addLink(a, b, instant) {
    if (linkExists(a, b) || a === b || !S.nodes[a] || !S.nodes[b]) return null;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'link-g');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'link-hit');
    const vis = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    vis.setAttribute('class', 'link-vis');
    g.appendChild(hit); g.appendChild(vis);
    svg.appendChild(g);
    const l = { a, b, el: g, vis, hit };
    S.links.push(l);
    drawLink(l);
    if (!instant) {
      const L = vis.getTotalLength() || 300;
      vis.style.strokeDasharray = L;
      vis.style.strokeDashoffset = L;
      vis.getBoundingClientRect();
      vis.style.transition = 'stroke-dashoffset .75s cubic-bezier(.2,.7,.3,1)';
      vis.style.strokeDashoffset = '0';
      setTimeout(() => { vis.style.strokeDasharray = 'none'; vis.style.transition = ''; }, 850);
    }
    hit.addEventListener('pointerdown', e => { e.stopPropagation(); });
    hit.addEventListener('pointerup', e => { e.stopPropagation(); });
    hit.addEventListener('click', e => { e.stopPropagation(); cutLink(l); });
    refreshHighlight();
    return l;
  }
  function drawLink(l) {
    const a = S.nodes[l.a], b = S.nodes[l.b];
    if (!a || !b) return;
    const d = `M${a.x - cam.x} ${a.y - cam.y} L${b.x - cam.x} ${b.y - cam.y}`;
    l.hit.setAttribute('d', d);
    l.vis.setAttribute('d', d);
  }

  function cutLink(l) {
    const a = S.nodes[l.a], b = S.nodes[l.b];
    S.links = S.links.filter(x => x !== l);
    l.el.remove();
    refreshHighlight();
    if (a && b) {
      const n = 16;
      for (let i = 0; i <= n; i++) {
        burst(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, 1);
      }
    }
    if (AUD) AUD.cutSound();

    const r = R_CUT[key2(l.a, l.b)];
    if (r) {
      applyEffect(r[4]);
      if (r[2] && !S.nodes[r[2]]) {
        spawnNear(r[2], l.a, l.b);
        say(r[3] || ('「' + DEF[r[2]].label + '」'));
      } else if (r[3]) say(r[3]);
    } else {
      say('切った。線があった場所だけが残る。');
    }
    after();
  }

  /* ───────── 粒子 ───────── */
  const ctx2 = fx.getContext('2d');
  const parts = [];
  function burst(wx, wy, n, warm) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.2 + Math.random() * 0.9;
      parts.push({ x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.15, life: 1, warm: !!warm });
    }
  }
  function drawParts() {
    ctx2.clearRect(0, 0, fx.width, fx.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.006; p.life -= 0.011;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx2.fillStyle = (p.warm ? 'rgba(216,189,136,' : 'rgba(180,192,214,') + (p.life * 0.7).toFixed(3) + ')';
      ctx2.fillRect(p.x - cam.x, p.y - cam.y, 1.4, 1.4);
    }
  }

  /* ───────── 効果 ───────── */
  function applyEffect(eff) {
    if (!eff) return;
    if (eff.relabel) eff.relabel.forEach(([id, t]) => relabel(id, t));
    if (eff.flag) S.flags.add(eff.flag);
    if (eff.remove) eff.remove.forEach(id => removeNode(id, true));
  }

  /* その組がまだ「これから何かを生む」余地を持っているか */
  function recipeUseful(r) {
    if (!r) return false;
    if (r[2]) return !S.nodes[r[2]];
    const eff = r[4];
    if (eff && eff.flag) return !S.flags.has(eff.flag);
    if (eff && eff.relabel) return eff.relabel.some(([id, t]) => S.nodes[id] && S.nodes[id].label !== t);
    return false;
  }

  /* 置きかたが違う、と盤のほうから言う */
  function crossHint(kind, aId, bId) {
    const arr = D.recipes.crossHints[kind];
    say(arr[(Math.random() * arr.length) | 0], 'cross');
    if (AUD) AUD.nudge();
    [aId, bId].forEach(id => {
      const n = S.nodes[id];
      if (!n) return;
      n.el.classList.remove('nudge');
      void n.el.offsetWidth;
      n.el.classList.add('nudge');
      setTimeout(() => n.el.classList.remove('nudge'), 600);
    });
  }

  /* ───────── 操作：接続（線を引く） ───────── */
  function tryConnect(aId, bId) {
    if (aId === bId || !S.nodes[aId] || !S.nodes[bId]) return;

    if (S.act >= 5) {
      const e = R_END[key2(aId, bId)];
      if (e) { addLink(aId, bId); setTimeout(() => ending(e[2]), 700); return; }
      if (aId === 'omoidasanai' || bId === 'omoidasanai') {
        addLink(aId, bId); setTimeout(() => ending('S'), 700); return;
      }
    }
    if ((aId === 'core' || bId === 'core') && S.nodes.core && S.nodes.core.locked) {
      if (AUD) AUD.deny();
      say('まだ、届かない。');
      return;
    }
    if (linkExists(aId, bId)) { say('もう、繋がっている。'); if (AUD) AUD.deny(); return; }

    const k = key2(aId, bId);
    const rc = R_CONNECT[k], ro = R_OVERLAY[k];

    /* 結ぶ側に登録が無く、重ね側にはある → 線を引かずに教える */
    if (!rc && recipeUseful(ro)) { crossHint('needOverlay', aId, bId); return; }

    addLink(aId, bId);
    if (AUD) AUD.connect();

    if (rc) {
      if (S.nodes[rc[2]]) {
        say('同じものが、もうある。');
      } else {
        spawnNear(rc[2], aId, bId);
        say(rc[3] || '「' + DEF[rc[2]].label + '」');
      }
      applyEffect(rc[4]);
    } else {
      whisper(aId, bId, 'connect');
    }
    after();
  }

  /* ───────── 操作：重ねる（線は残らない） ───────── */
  function tryOverlay(aId, bId) {
    if (aId === bId || !S.nodes[aId] || !S.nodes[bId]) return;
    const a = S.nodes[aId], b = S.nodes[bId];
    const k = key2(aId, bId);
    const ro = R_OVERLAY[k], rc = R_CONNECT[k];

    /* 重ね側に登録が無く、結ぶ側にはある → 重ねた演出は出さずに教える */
    if (!ro && recipeUseful(rc)) { crossHint('needConnect', aId, bId); return; }

    /* 重なった、ということ自体を見せる */
    [a, b].forEach(n => {
      n.el.classList.remove('merged');
      void n.el.offsetWidth;
      n.el.classList.add('merged');
      setTimeout(() => n.el.classList.remove('merged'), 1200);
    });
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, 14, true);

    if (ro) {
      if (AUD) AUD.merge();
      if (ro[2]) {
        if (S.nodes[ro[2]]) { say('同じものが、もうある。'); }
        else { spawnNear(ro[2], aId, bId); say(ro[3] || '「' + DEF[ro[2]].label + '」'); }
      } else if (ro[3]) { say(ro[3]); }
      applyEffect(ro[4]);
    } else {
      whisper(aId, bId, 'overlay');
    }
    after();
  }

  function whisper(aId, bId, mode) {
    const w = R_WHIS[key2(aId, bId)];
    if (w && w[2]) { say(w[2]); return; }
    if (w) { say('……。'); return; }
    if (Math.random() < 0.62) {
      const arr = D.recipes.idleWhispers;
      say(mode === 'overlay'
        ? (Math.random() < .5 ? '重ねてみたが、二つのままだった。' : arr[(Math.random() * arr.length) | 0])
        : arr[(Math.random() * arr.length) | 0]);
    }
  }

  /* ───────── 操作：消す ───────── */
  function tryDelete(id) {
    const sp = D.story.deletions[id];
    if (sp && sp.blocked) { if (AUD) AUD.deny(); say(sp.text || 'それは消せない。'); return; }
    if (DEF[id] && DEF[id].nodelete) { if (AUD) AUD.deny(); say('それは消せない。'); return; }

    if (AUD) AUD.erase();

    if (sp && sp.rewireTo) {
      const target = sp.rewireTo;
      const n = S.nodes[id];
      if (!S.nodes[target]) { const p = freeSpot(n.x, n.y); makeNode(target, p.x, p.y); }
      const partners = S.links.filter(l => l.a === id || l.b === id)
        .map(l => (l.a === id ? l.b : l.a));
      removeNode(id);
      partners.forEach(p => { if (p !== target) addLink(target, p); });
      S.flags.add(sp.flag || ('deleted_' + id));
      say(sp.text);
      setTimeout(() => say('——いや、それも違うだろう。'), 2600);
      after(); return;
    }

    if (sp && sp.alsoRemove) sp.alsoRemove.forEach(x => removeNode(x, true));
    removeNode(id);
    if (sp && sp.flag) S.flags.add(sp.flag);
    say(sp ? sp.text : '消した。形だけが、少しのあいだ残る。');

    if (sp && sp.respawn) {
      setTimeout(() => {
        if (S.nodes[id]) return;
        const p = freeSpot(W / 2, H / 2);
        const n = makeNode(id, p.x, p.y);
        if (n) n.el.classList.add('newborn');
        say(sp.respawn.text);
        if (AUD) AUD.toll();
        after();
      }, sp.respawn.delay || 2500);
    }
    after();
  }

  /* ───────── 章の進行 ───────── */
  function after() {
    checkEvents();
    checkStuck();
    save();
  }

  function setActClass() {
    ['act-1', 'act-2', 'act-3', 'act-4', 'act-5'].forEach(c => document.body.classList.remove(c));
    document.body.classList.add('act-' + S.act);
  }

  function applyEvent(e) {
    S.done.add(e.id);
    S.act = Math.max(S.act, e.act || S.act);
    setActClass();
    if (AUD) AUD.setTension((S.act - 1) / 4);

    if (e.relabel) e.relabel.forEach(([id, t]) => { if (S.nodes[id]) relabel(id, t); });
    if (e.spawn) e.spawn.forEach((id, i) => setTimeout(() => {
      if (S.nodes[id]) return;
      const p = freeSpot(W / 2 + (Math.random() - .5) * 400, H / 2 + (Math.random() - .5) * 300);
      const n = makeNode(id, p.x, p.y);
      if (n) n.el.classList.add('newborn');
      if (AUD) AUD.toll();
      save();
    }, 900 + i * 900));
    if (e.text) setTimeout(() => say(e.text), 400);
    if (e.collapse) setTimeout(collapse, 2600);
  }

  function checkEvents() {
    D.story.events.forEach(e => {
      if (S.done.has(e.id)) return;
      let ok = false;
      try { ok = e.when(SAPI); } catch (err) { ok = false; }
      if (ok) applyEvent(e);
    });
  }

  /* ───────── 手詰まりの検出 ───────── */
  function progressLeft() {
    for (const id in S.nodes) {
      if (DEF[id] && DEF[id].inspect && !S.inspected.has(id)) return true;
    }
    const usable = r => (S.nodes[r[0]] && S.nodes[r[1]]) ? recipeUseful(r) : false;
    return D.recipes.connect.some(usable)
      || D.recipes.overlay.some(usable)
      || D.recipes.cut.some(usable);
  }

  let stuckShown = false, stuckTimer = null;
  function checkStuck() {
    if (paused || S.ending) return;
    if (S.act >= 5) { setStuck(false); return; }
    setStuck(!progressLeft());
  }

  function setStuck(v) {
    if (v === stuckShown) return;
    stuckShown = v;
    const el = $('#stuck');
    clearTimeout(stuckTimer);
    if (!v) { el.classList.add('hidden'); return; }
    el.innerHTML =
      '<div class="main">——これ以上、新しい言葉は出てこない。</div>' +
      '<div class="sub">線を切る、あるいは何かを消すと、まだ動くかもしれない。<br>' +
      'そのままでも、じきに終わりへ向かう。</div>';
    el.classList.remove('hidden');
    stuckTimer = setTimeout(() => {
      if (!stuckShown || S.ending || S.act >= 5) return;
      const e = D.story.events.find(x => x.id === 'act5');
      if (e && !S.done.has(e.id)) {
        say('増えないなら、減らすしかない。');
        applyEvent(e);
      }
      setStuck(false);
    }, 12000);
  }

  function collapse() {
    hint('');
    const keep = new Set(['core', 'omoidasanai']);
    Object.keys(S.nodes).forEach(id => { if (DEF[id] && DEF[id].keep) keep.add(id); });
    ['ondo', 'akui', 'mochiageta', 'darenimo', 'dochiramo', 'shugo',
      'kubetsu', 'tadaima', 'omoide', 'kaerenai', 'henji', 'onaji']
      .filter(id => S.nodes[id]).slice(0, 2).forEach(id => keep.add(id));

    let i = 0;
    Object.keys(S.nodes).forEach(id => {
      if (keep.has(id)) return;
      setTimeout(() => removeNode(id, true), (i++) * 90);
    });
    S.links.forEach(l => l.el.remove());
    S.links = [];
    setTimeout(() => {
      const c = S.nodes.core;
      if (c) { c.locked = false; c.el.classList.remove('locked'); c.el.classList.add('open'); }
      const ids = Object.keys(S.nodes).filter(id => id !== 'core');
      ids.forEach((id, k) => {
        const n = S.nodes[id];
        const a = (k / ids.length) * Math.PI * 2;
        n.tx = W / 2 + Math.cos(a) * 340;
        n.ty = H / 2 + Math.sin(a) * 250;
      });
      say('残ったものだけが、残っている。');
      hint('最後に、二つを結ぶ。');
      save();
    }, i * 90 + 900);
  }

  /* ───────── エンディング ───────── */
  function ending(k) {
    if (S.ending) return;
    const e = D.story.endings[k];
    if (!e) return;
    S.ending = k;
    if (AUD) AUD.toll();

    const run = () => {
      const scr = $('#ending-screen');
      $('#ending-title').textContent = e.title;
      const body = $('#ending-body');
      body.innerHTML = '';
      (e.body || []).forEach((t, i) => {
        const d = document.createElement('div');
        d.textContent = t;
        d.style.animationDelay = (2.6 + i * 1.5) + 's';
        body.appendChild(d);
      });
      scr.classList.remove('hidden');
      const back = $('#ending-back');
      back.classList.add('hidden');
      setTimeout(() => back.classList.remove('hidden'), 4200 + (e.body || []).length * 1500);
      paused = true;
      if (k === 'S') localStorage.setItem(SECRET_KEY, '1');
      localStorage.removeItem(SAVE_KEY);
    };

    if (e.relabelCore) {
      say('——');
      setTimeout(() => { relabel('core', e.relabelCore); if (AUD) AUD.toll(); }, 1200);
      setTimeout(run, 3800);
    } else {
      setTimeout(run, 900);
    }
  }

  /* ───────── 選択・強調・消すボタン ───────── */
  let killer = null;
  let cutTipShown = false;

  function refreshHighlight() {
    const sel = selected && S.nodes[selected] ? selected : null;
    const nb = new Set();
    if (sel) S.links.forEach(l => {
      if (l.a === sel) nb.add(l.b);
      else if (l.b === sel) nb.add(l.a);
    });
    Object.keys(S.nodes).forEach(id => {
      S.nodes[id].el.classList.toggle('linked', nb.has(id));
    });
    S.links.forEach(l => {
      l.vis.classList.toggle('lit', !!sel && (l.a === sel || l.b === sel));
    });
    document.body.classList.toggle('picking', !!sel);
    return nb.size;
  }

  function refreshInspectMarks() {
    Object.keys(S.nodes).forEach(id => {
      const n = S.nodes[id];
      n.el.classList.toggle('has-inspect', !!(n.def.inspect && !S.inspected.has(id)));
    });
  }

  function select(id) {
    if (selected && S.nodes[selected]) S.nodes[selected].el.classList.remove('sel');
    if (killer) { killer.remove(); killer = null; }
    selected = id;
    if (!id) { refreshHighlight(); return; }
    const n = S.nodes[id];
    n.el.classList.add('sel');
    const links = refreshHighlight();
    if (links > 0 && !cutTipShown) {
      cutTipShown = true;
      hint('繋がっている線を押すと、切れる。', 9000);
    }

    if (!n.def.nodelete) {
      killer = document.createElement('div');
      killer.className = 'killer';
      killer.textContent = '消す';
      layer.appendChild(killer);
      killer.addEventListener('pointerdown', ev => ev.stopPropagation());
      killer.addEventListener('pointerup', ev => ev.stopPropagation());
      killer.addEventListener('click', ev => {
        ev.stopPropagation();
        const t = selected; select(null); tryDelete(t);
      });
      positionKiller();
    }
  }
  function positionKiller() {
    if (!killer || !selected || !S.nodes[selected]) return;
    const n = S.nodes[selected];
    killer.style.left = (n.x - cam.x) + 'px';
    killer.style.top = (n.y - cam.y + n.el.offsetHeight / 2 + 10) + 'px';
  }

  function inspect(n) {
    const ins = n.def.inspect;
    if (!ins || S.inspected.has(n.id)) return;
    S.inspected.add(n.id);
    n.el.classList.remove('has-inspect');
    if (AUD) AUD.open();
    if (ins.text) say(ins.text);
    (ins.spawn || []).forEach((id, i) => setTimeout(() => {
      if (S.nodes[id]) return;
      const a = (i / ins.spawn.length) * Math.PI * 2 + Math.random() * .4;
      const r = 150 + Math.random() * 70;
      const x = Math.min(W - 100, Math.max(100, n.x + Math.cos(a) * r));
      const y = Math.min(H - 100, Math.max(100, n.y + Math.sin(a) * r));
      const nn = makeNode(id, x, y);
      if (nn) nn.el.classList.add('newborn');
      if (AUD) AUD.born();
      if (i === ins.spawn.length - 1) after();
    }, 200 + i * 420));
  }

  /* ───────── 入力 ───────── */
  let drag = null;
  let pointer = { x: 0, y: 0, inside: false };
  let tempLine = null;
  let overId = null;

  function worldFromEvent(e) { return { x: e.clientX + cam.x, y: e.clientY + cam.y }; }

  stage.addEventListener('pointerdown', e => {
    if (paused) return;
    const nodeEl = e.target.closest && e.target.closest('.node');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      const n = S.nodes[id];
      const w = worldFromEvent(e);
      drag = { id, moved: false, ox: n.x - w.x, oy: n.y - w.y, sx: e.clientX, sy: e.clientY };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { }
    } else if (!(e.target.closest && (e.target.closest('.link-hit') || e.target.closest('.killer')))) {
      drag = { pan: true, moved: false, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { }
    }
  });

  stage.addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    if (paused) return;

    if (drag && drag.pan) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      cam.x = drag.cx - dx; cam.y = drag.cy - dy;
      clampCam();
      return;
    }
    if (drag && drag.id) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 6) {
        drag.moved = true;
        S.nodes[drag.id].el.classList.add('dragging');
      }
      if (drag.moved) {
        const n = S.nodes[drag.id];
        if (n.fixed) return;
        const w = worldFromEvent(e);
        n.x = Math.min(W - 40, Math.max(40, w.x + drag.ox));
        n.y = Math.min(H - 40, Math.max(40, w.y + drag.oy));
        n.vx = n.vy = 0;
        n.tx = n.ty = undefined;
        highlightTarget(e, drag.id);
      }
    }
  });

  function nodeAt(e, exceptId) {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of els) {
      const c = el.closest && el.closest('.node');
      if (c && c.dataset.id !== exceptId) return c.dataset.id;
    }
    return null;
  }
  function highlightTarget(e, exceptId) {
    const id = nodeAt(e, exceptId);
    if (id === overId) return;
    if (overId && S.nodes[overId]) S.nodes[overId].el.classList.remove('over');
    overId = id;
    if (overId && S.nodes[overId]) S.nodes[overId].el.classList.add('over');
  }

  stage.addEventListener('pointerup', e => {
    if (paused) { drag = null; return; }
    if (!drag) return;
    const d = drag; drag = null;

    if (d.pan) {
      if (!d.moved) {
        const c = S.nodes.core;
        if (c && c.locked) {
          const r = c.el.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            if (AUD) AUD.deny();
            say('触れられない。まだ、名前がついていない。');
          }
        }
      }
      return;
    }

    const n = S.nodes[d.id];
    if (n) n.el.classList.remove('dragging');

    if (d.moved) {
      const t = overId;
      if (overId && S.nodes[overId]) S.nodes[overId].el.classList.remove('over');
      overId = null;
      if (t) tryOverlay(d.id, t); else save();
      return;
    }

    if (!n) return;
    if (n.locked) {
      if (AUD) AUD.deny();
      say('触れられない。まだ、名前がついていない。');
      return;
    }
    if (S.act >= 5 && d.id === 'omoidasanai') { select(null); ending('S'); return; }

    if (selected === null) { select(d.id); inspect(n); }
    else if (selected === d.id) { select(null); }
    else { const a = selected; select(null); tryConnect(a, d.id); }
  });

  stage.addEventListener('pointerleave', () => { pointer.inside = false; });

  /* ───────── ループ ───────── */
  function measure(n) {
    if (!n || !n.el) return;
    n.w = n.el.offsetWidth || 60;
    n.h = n.el.offsetHeight || 24;
  }

  let frame = 0;
  function step() {
    frame++;
    const ids = Object.keys(S.nodes);

    if (!paused) {
      if ((frame & 15) === 0) ids.forEach(id => measure(S.nodes[id]));
      const PAD = 22;
      for (let i = 0; i < ids.length; i++) {
        const a = S.nodes[ids[i]];
        for (let j = i + 1; j < ids.length; j++) {
          const b = S.nodes[ids[j]];
          const ox = (a.w + b.w) / 2 + PAD - Math.abs(b.x - a.x);
          if (ox <= 0) continue;
          const oy = (a.h + b.h) / 2 + PAD - Math.abs(b.y - a.y);
          if (oy <= 0) continue;
          let fx2 = 0, fy2 = 0;
          if (ox / (a.w + b.w) < oy / (a.h + b.h)) {
            fx2 = (b.x > a.x ? 1 : -1) * Math.min(ox, 30) * 0.020;
          } else {
            fy2 = (b.y > a.y ? 1 : -1) * Math.min(oy, 30) * 0.028;
          }
          if (!a.fixed) { a.vx -= fx2; a.vy -= fy2; }
          if (!b.fixed) { b.vx += fx2; b.vy += fy2; }
          if (a.fixed) { b.vx += fx2; b.vy += fy2; }
          if (b.fixed) { a.vx -= fx2; a.vy -= fy2; }
        }
      }
      S.links.forEach(l => {
        const a = S.nodes[l.a], b = S.nodes[l.b];
        if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = (d - 210) * 0.0016;
        dx /= d; dy /= d;
        if (!a.fixed) { a.vx += dx * f; a.vy += dy * f; }
        if (!b.fixed) { b.vx -= dx * f; b.vy -= dy * f; }
      });

      ids.forEach(id => {
        const n = S.nodes[id];
        if (n.fixed) return;
        if (drag && drag.id === id && drag.moved) return;

        if (n.tx !== undefined) {
          n.vx += (n.tx - n.x) * 0.0022;
          n.vy += (n.ty - n.y) * 0.0022;
        } else {
          n.vx += (Math.random() - 0.5) * 0.012;
          n.vy += (Math.random() - 0.5) * 0.012;
        }
        n.vx *= 0.965; n.vy *= 0.965;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 0.85) { n.vx *= 0.85 / sp; n.vy *= 0.85 / sp; }
        n.x += n.vx; n.y += n.vy;
        const m = 60;
        if (n.x < m) { n.x = m; n.vx = Math.abs(n.vx) * .5; }
        if (n.x > W - m) { n.x = W - m; n.vx = -Math.abs(n.vx) * .5; }
        if (n.y < m) { n.y = m; n.vy = Math.abs(n.vy) * .5; }
        if (n.y > H - m) { n.y = H - m; n.vy = -Math.abs(n.vy) * .5; }
      });
    }

    ids.forEach(id => place(S.nodes[id]));
    S.links.forEach(drawLink);
    positionKiller();
    drawTemp();
    updateTips();
    drawParts();
    requestAnimationFrame(step);
  }

  function place(n) {
    n.el.style.left = (n.x - cam.x) + 'px';
    n.el.style.top = (n.y - cam.y) + 'px';
  }

  function drawTemp() {
    if (!tempLine) {
      tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempLine.setAttribute('class', 'link-vis temp');
      tempLine.style.display = 'none';
      svg.appendChild(tempLine);
    }
    if (selected && S.nodes[selected] && pointer.inside && !paused && !(drag && drag.moved)) {
      const n = S.nodes[selected];
      tempLine.style.display = '';
      tempLine.setAttribute('d', `M${n.x - cam.x} ${n.y - cam.y} L${pointer.x} ${pointer.y}`);
    } else {
      tempLine.style.display = 'none';
    }
  }

  function updateTips() {
    if (!paused && selected && S.nodes[selected] && !(drag && drag.moved)) {
      const n = S.nodes[selected];
      selTip.style.display = '';
      selTip.textContent = '接続 ／ つぎに押した言葉と、線で結ぶ';
      selTip.style.left = (n.x - cam.x) + 'px';
      selTip.style.top = (n.y - cam.y - (n.h || 26) / 2 - 18) + 'px';
    } else {
      selTip.style.display = 'none';
    }

    if (!paused && drag && drag.id && drag.moved) {
      const over = overId && S.nodes[overId];
      dragTip.style.display = '';
      dragTip.textContent = over ? '重ねる ／ はなす（線は残らない）' : '移動中 ／ 言葉の上ではなすと、重なる';
      dragTip.classList.toggle('move', !over);
      dragTip.style.left = pointer.x + 'px';
      dragTip.style.top = (pointer.y - 38) + 'px';
    } else {
      dragTip.style.display = 'none';
    }
  }

  /* ───────── セーブ ───────── */
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (S.ending) return;
      const data = {
        v: 1,
        act: S.act,
        nodes: Object.keys(S.nodes).map(id => {
          const n = S.nodes[id];
          return [id, Math.round(n.x), Math.round(n.y), n.label === n.def.label ? 0 : n.label];
        }),
        links: S.links.map(l => [l.a, l.b]),
        ever: [...S.ever],
        flags: [...S.flags],
        done: [...S.done],
        inspected: [...S.inspected]
      };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { }
    }, 350);
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function clearBoard() {
    Object.keys(S.nodes).forEach(id => { S.nodes[id].el.remove(); });
    S.nodes = {};
    S.links.forEach(l => l.el.remove());
    S.links = [];
    S.ever = new Set(); S.flags = new Set(); S.done = new Set(); S.inspected = new Set();
    S.act = 1; S.ending = null; selected = null;
    if (killer) { killer.remove(); killer = null; }
    logEl.innerHTML = '';
    stuckShown = false; clearTimeout(stuckTimer);
    $('#stuck').classList.add('hidden');
    document.body.classList.remove('picking');
    setActClass();
  }

  function newGame() {
    clearBoard();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    makeNode('core', W / 2, H / 2);
    const starts = D.nodes.filter(n => n.start && n.id !== 'core').map(n => n.id);
    starts.forEach((id, i) => {
      const a = (i / starts.length) * Math.PI * 2 - 0.6;
      const r = 300 + (i % 2) * 110;
      makeNode(id, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * 0.78);
    });
    cam.x = (W - innerWidth) / 2; cam.y = (H - innerHeight) / 2; clampCam();
    hint('押す→押す ＝ 線で結ぶ　／　掴んで乗せる ＝ 重ねる', 22000);
    setTimeout(() => say('雨の音がする。あるいは、そう書いてあるだけだ。'), 1400);
    save();
  }

  function loadGame() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!data || !data.nodes) return false;
    clearBoard();
    S.act = data.act || 1;
    (data.ever || []).forEach(x => S.ever.add(x));
    (data.flags || []).forEach(x => S.flags.add(x));
    (data.done || []).forEach(x => S.done.add(x));
    (data.inspected || []).forEach(x => S.inspected.add(x));
    setActClass();
    data.nodes.forEach(([id, x, y, lbl]) => {
      if (!DEF[id]) return;
      const n = makeNode(id, x, y, lbl || undefined);
      if (n && lbl) { n.label = lbl; n.lbl.textContent = lbl; }
    });
    (data.links || []).forEach(([a, b]) => { if (S.nodes[a] && S.nodes[b]) addLink(a, b, true); });
    refreshInspectMarks();
    if (S.act >= 5 && S.nodes.core) {
      S.nodes.core.locked = false;
      S.nodes.core.el.classList.remove('locked');
      S.nodes.core.el.classList.add('open');
      hint('最後に、二つを結ぶ。');
    }
    if (AUD) AUD.setTension((S.act - 1) / 4);
    return true;
  }

  /* ───────── 画面遷移 ───────── */
  function showTitle() {
    paused = true;
    selTip.style.display = 'none';
    dragTip.style.display = 'none';
    $('#ending-screen').classList.add('hidden');
    $('#menu-screen').classList.add('hidden');
    const t = $('#title-screen');
    t.classList.remove('hidden');
    $('#btn-continue').classList.toggle('hidden', !hasSave());
    $('#secret-node').classList.toggle('hidden', localStorage.getItem(SECRET_KEY) !== '1');
  }
  function startPlay() {
    $('#title-screen').classList.add('hidden');
    paused = false;
    setTimeout(checkStuck, 1200);
  }
  setInterval(checkStuck, 3000);

  /* ───────── UI 配線 ───────── */
  $('#btn-new').addEventListener('click', () => { newGame(); startPlay(); });
  $('#btn-continue').addEventListener('click', () => { if (!loadGame()) newGame(); startPlay(); });
  $('#btn-help').addEventListener('click', () => $('#help-screen').classList.remove('hidden'));
  document.querySelectorAll('.close').forEach(b =>
    b.addEventListener('click', () => b.closest('.overlay').classList.add('hidden')));
  $('#btn-menu').addEventListener('click', () => {
    $('#stat-found').textContent = S.ever.size;
    $('#stat-act').textContent = S.act;
    $('#menu-screen').classList.remove('hidden');
  });
  $('#btn-resume').addEventListener('click', () => $('#menu-screen').classList.add('hidden'));
  $('#btn-title').addEventListener('click', () => { save(); showTitle(); });
  $('#btn-reset').addEventListener('click', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    $('#menu-screen').classList.add('hidden');
    newGame(); startPlay();
  });
  $('#ending-back').addEventListener('click', () => { clearBoard(); showTitle(); });
  $('#btn-sound').addEventListener('click', function () {
    const on = AUD && AUD.toggle();
    this.classList.toggle('on', !!on);
  });
  addEventListener('resize', sizeWorld);
  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      select(null);
      document.querySelectorAll('.overlay:not(.hidden)').forEach(o => {
        if (o.id !== 'title-screen' && o.id !== 'ending-screen') o.classList.add('hidden');
      });
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      const t = selected; select(null); tryDelete(t);
    }
  });

  /* ───────── 起動 ───────── */
  sizeWorld();
  showTitle();
  requestAnimationFrame(step);

  global.__NANASHI = { S, SAPI, tryConnect, tryOverlay, tryDelete, newGame, startPlay, DEF, ending, inspect };
})(window);
