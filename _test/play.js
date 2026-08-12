const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForTimeout(600);

  /* ---- 1. データ整合性 ---- */
  const integrity = await page.evaluate(() => {
    const D = window.GameData, ids = new Set(D.nodes.map(n => n.id));
    const bad = [];
    const chk = (list, kind) => list.forEach(r => {
      [r[0], r[1]].forEach(x => { if (!ids.has(x)) bad.push(kind + ' 入力不明: ' + x); });
      if (kind !== 'endings' && kind !== 'whispers' && r[2] && !ids.has(r[2])) bad.push(kind + ' 結果不明: ' + r[2]);
    });
    chk(D.recipes.connect, 'connect'); chk(D.recipes.overlay, 'overlay');
    chk(D.recipes.cut, 'cut'); chk(D.recipes.whispers, 'whispers');
    chk(D.recipes.endings, 'endings');
    D.recipes.endings.forEach(r => { if (!D.story.endings[r[2]]) bad.push('未定義エンド ' + r[2]); });
    D.story.events.forEach(e => (e.spawn || []).forEach(s => { if (!ids.has(s)) bad.push('event spawn 不明 ' + s); }));
    D.nodes.forEach(n => (n.inspect ? n.inspect.spawn : []).forEach(s => { if (!ids.has(s)) bad.push('inspect spawn 不明 ' + s); }));
    Object.keys(D.story.deletions).forEach(k => { if (!ids.has(k)) bad.push('deletion 不明 ' + k); });
    const dup = {}; D.nodes.forEach(n => { if (dup[n.id]) bad.push('ID重複 ' + n.id); dup[n.id] = 1; });
    if (!D.recipes.crossHints || !D.recipes.crossHints.needOverlay || !D.recipes.crossHints.needConnect)
      bad.push('crossHints が無い');
    return { bad, nodes: D.nodes.length, connect: D.recipes.connect.length, overlay: D.recipes.overlay.length };
  });
  console.log('■ データ:', integrity.nodes, 'ノード /', integrity.connect, '接続 /', integrity.overlay, '重ね');
  console.log(integrity.bad.length ? '✗ 不整合:\n' + integrity.bad.join('\n') : '✓ データ整合性OK');

  /* ---- 2. すれ違い案内：重ね専用の組を「結んだ」とき ---- */
  const cross = await page.evaluate(async () => {
    const G = window.__NANASHI;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const log = [];
    G.newGame(); G.startPlay(); await wait(120);

    // 記憶・嘘 を用意（重ね専用の組）
    ['kioku', 'uso'].forEach((id, i) => {
      if (!G.S.nodes[id]) {
        const D = window.GameData;
        // 内部APIで直接は作れないので、チェーンを通す
      }
    });
    const C = async (a, b) => { G.tryConnect(a, b); await wait(70); };
    await C('watashi', 'ame'); await C('omoidasu', 'eki'); await C('omoidasu', 'anohi');   // 記憶
    await C('gogo', 'ame'); await C('yuudachi', 'eki'); await C('ame', 'natsu');
    await C('nioi', 'ie'); await C('haha', 'anohi'); await C('eki', 'gogo');
    await C('byouin', 'matsu'); await C('rouka', 'gogo'); await C('gogo512', 'watashi');
    await C('watashi', 'ienakatta'); await C('shiranaifuri', 'kioku');                     // 嘘
    const ready = !!G.S.nodes.kioku && !!G.S.nodes.uso;

    const linksBefore = G.S.links.length;
    document.querySelectorAll('#log div').forEach(d => d.remove());
    G.tryConnect('kioku', 'uso');     // ← 重ね専用の組を「結ぶ」
    await wait(300);
    const lines = [...document.querySelectorAll('#log div')].map(d => d.textContent);
    log.push(['準備（記憶・嘘）', ready, '']);
    log.push(['結んでも線が引かれない', G.S.links.length === linksBefore, '']);
    log.push(['「重ねてみたら」と案内が出る',
      document.querySelectorAll('#log div.cross').length > 0 && lines.some(t => /重ね/.test(t)),
      lines[lines.length - 1] || '']);
    log.push(['思い出はまだ生まれていない', !G.S.nodes.omoide, '']);

    // 案内どおり重ねると、ちゃんと生まれる
    G.tryOverlay('kioku', 'uso');
    await wait(300);
    log.push(['案内どおり重ねると生まれる', !!G.S.nodes.omoide, '']);

    // 逆方向：接続専用の組を「重ねた」とき（神様の出現を待ってから）
    for (let i = 0; i < 60 && !G.S.nodes.kamisama; i++) await wait(200);
    log.push(['神様が盤上にいる', !!G.S.nodes.kamisama, '']);
    document.querySelectorAll('#log div').forEach(d => d.remove());
    G.tryOverlay('kamisama', 'watashi');   // 神様＋私 は接続専用（既読）
    await wait(300);
    const lines2 = [...document.querySelectorAll('#log div')].map(d => d.textContent);
    const cross2 = document.querySelectorAll('#log div.cross').length;
    log.push(['重ねても既読は生まれない', !G.S.nodes.kidoku, '']);
    log.push(['「結んでみたら」と案内が出る', cross2 > 0, lines2[lines2.length - 1] || '']);
    G.tryConnect('kamisama', 'watashi');
    await wait(300);
    log.push(['案内どおり結ぶと生まれる', !!G.S.nodes.kidoku, '']);
    return log;
  });
  cross.forEach(([n, ok, x]) => console.log((ok ? '✓ ' : '✗ ') + n, x ? '／ ' + x : ''));
  await page.screenshot({ path: __dirname + '/shot-01-cross.png' });

  /* ---- 3. 既に結果がある組では案内を出さない（誤爆チェック） ---- */
  const noFalse = await page.evaluate(async () => {
    const G = window.__NANASHI;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const before = G.S.links.length;
    G.tryConnect('kioku', 'uso');     // 思い出はもう在る → 普通に線が引かれるべき
    await wait(250);
    return G.S.links.length > before;
  });
  console.log(noFalse ? '✓ 結果が既にある組は、普通に結べる（案内は出ない）' : '✗ 案内が誤爆している');

  /* ---- 4. タップ／ドラッグの札と色 ---- */
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#btn-new'); await page.waitForTimeout(900);
  const box = async id => await page.locator(`.node[data-id="${id}"]`).boundingBox();
  const tap = async id => { const b = await box(id); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(240); };

  await tap('watashi');
  const st = await page.evaluate(() => {
    const t = document.getElementById('seltip');
    return { shown: t.style.display !== 'none', text: t.textContent };
  });
  console.log(st.shown && /接続/.test(st.text) ? '✓ 選択中に「接続」の札' : '✗ 接続の札が出ない');
  await tap('ame');
  await page.waitForTimeout(700);
  console.log(await page.locator('.node[data-id="omoidasu"]').count() ? '✓ タップ接続OK' : '✗ タップ接続が動かない');

  let b1 = await box('ie'), b2 = await box('ame');
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 16 });
  await page.waitForTimeout(250);
  const dg = await page.evaluate(() => {
    const t = document.getElementById('dragtip');
    return { shown: t.style.display !== 'none', text: t.textContent, over: document.querySelectorAll('.node.over').length };
  });
  await page.screenshot({ path: __dirname + '/shot-02-overlay.png' });
  await page.mouse.up(); await page.waitForTimeout(800);
  console.log(dg.shown && /重ねる/.test(dg.text) && dg.over ? '✓ ドラッグ中に「重ねる」の札＋暖色' : '✗ 重ねの表示が出ない');
  console.log(await page.locator('.node[data-id="otodake"]').count() ? '✓ 重ねる操作OK' : '✗ 重ねる操作が動かない');

  /* ---- 5. 章進行・ひらく・エンディング ---- */
  const play = await page.evaluate(async () => {
    const G = window.__NANASHI;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const C = async (a, b) => { G.tryConnect(a, b); await wait(70); };
    const O = async (a, b) => { G.tryOverlay(a, b); await wait(70); };
    const has = id => !!G.S.nodes[id];
    const log = [];
    G.newGame(); G.startPlay(); await wait(100);

    await C('watashi', 'ame'); await C('omoidasu', 'eki');
    await C('gogo', 'ame'); await C('yuudachi', 'eki'); await C('ame', 'natsu');
    await C('nioi', 'ie'); await C('haha', 'anohi');
    await C('eki', 'gogo'); await C('byouin', 'matsu'); await C('rouka', 'gogo');
    await C('gogo512', 'watashi');
    await wait(3400);
    log.push(['章3・神様出現', G.S.act >= 3 && has('kamisama'), 'act=' + G.S.act]);
    log.push(['神様に点線の囲み', !!document.querySelector('.node[data-id="kamisama"].has-inspect'), '']);

    await C('omoidasu', 'anohi'); await C('watashi', 'ienakatta'); await C('shiranaifuri', 'kioku');
    await C('byouin', 'watashi'); await C('te', 'gogo512');
    await wait(3200);
    log.push(['章4・詩人の心出現', G.S.act >= 4 && has('shijin'), 'act=' + G.S.act]);

    const single = async id => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await wait(120);
      const el = document.querySelector('.node[data-id="' + id + '"]');
      const r = el.getBoundingClientRect();
      ['pointerdown', 'pointerup'].forEach(t => el.dispatchEvent(
        new PointerEvent(t, { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, pointerId: 1 })));
      await wait(2800);
    };
    await single('shijin');
    log.push(['詩人の心：押すだけでひらく', has('hiyu') && has('shitto') && has('utsukushii'), '']);
    log.push(['ひらいたら囲みが外れる', !document.querySelector('.node[data-id="shijin"].has-inspect'), '']);
    await single('kamisama');
    log.push(['神様：押すだけでひらく', has('sensou') && has('kodomo'), '']);

    await C('kamisama', 'sensou'); await C('byouin', 'chinmoku');
    await C('shitto', 'yomarenu'); await C('shijin', 'kane');
    await C('shijin', 'kamisama'); await C('baibun', 'inori');
    log.push(['売文＋祈り→どちらも同じだった', has('dochiramo'), '']);
    await O('kioku', 'uso'); await O('atatakai', 'watashi');
    log.push(['重ね2種', has('omoide') && has('ondo'), '']);
    await wait(3600);
    log.push(['章5・収束', G.S.act >= 5, 'act=' + G.S.act]);
    return log;
  });
  play.forEach(([n, ok, x]) => console.log((ok ? '✓ ' : '✗ ') + n, x || ''));

  await page.waitForTimeout(6500);
  const finale = await page.evaluate(() => ({
    remain: Object.keys(window.__NANASHI.S.nodes),
    coreOpen: !window.__NANASHI.S.nodes.core.locked,
    watashi: window.__NANASHI.S.nodes.watashi && window.__NANASHI.S.nodes.watashi.label
  }));
  console.log('■ 終盤:', JSON.stringify(finale.remain));
  console.log(finale.coreOpen ? '✓ coreが接続可能に' : '✗ coreが開かない');
  console.log(finale.watashi === '私？' ? '✓ 「私」が「私？」に' : '✗ 私の書き換え: ' + finale.watashi);
  await page.screenshot({ path: __dirname + '/shot-03-finale.png' });

  await page.evaluate(() => window.__NANASHI.tryConnect('uso', 'core'));
  await page.waitForTimeout(6000);
  const endTitle = await page.locator('#ending-title').textContent();
  console.log(endTitle === '本当は覚えていた' ? '✓ エンドC到達' : '✗ エンディング: ' + endTitle);
  console.log(await page.evaluate(() => window.__NANASHI.S.nodes.core.label) === '忘れたかったこと'
    ? '✓ coreが「忘れたかったこと」に' : '✗ core書き換え失敗');

  /* ---- 6. セーブ／切断／手詰まり ---- */
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#btn-new'); await page.waitForTimeout(900);
  await tap('watashi'); await tap('ie'); await page.waitForTimeout(700);
  await tap('watashi'); await page.waitForTimeout(300);
  const hl = await page.evaluate(() => ({
    linked: [...document.querySelectorAll('.node.linked')].map(e => e.dataset.id),
    lit: document.querySelectorAll('.link-vis.lit').length
  }));
  console.log(hl.linked.includes('ie') && hl.lit >= 1 ? '✓ 接続ハイライト' : '✗ 接続ハイライトが出ない');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  const mid = await page.evaluate(() => {
    const G = window.__NANASHI;
    const l = G.S.links.find(x => (x.a === 'watashi' && x.b === 'ie') || (x.b === 'watashi' && x.a === 'ie'));
    const a = G.S.nodes[l.a], b = G.S.nodes[l.b];
    const ar = a.el.getBoundingClientRect();
    const cx = a.x - ar.left - a.el.offsetWidth / 2, cy = a.y - ar.top - a.el.offsetHeight / 2;
    const t = 0.25;
    return { x: (a.x + (b.x - a.x) * t) - cx, y: (a.y + (b.y - a.y) * t) - cy, n: G.S.links.length };
  });
  await page.mouse.click(mid.x, mid.y);
  await page.waitForTimeout(700);
  const ac = await page.evaluate(() => ({
    links: window.__NANASHI.S.links.length,
    kaerenai: !!window.__NANASHI.S.nodes.kaerenai,
    ie: window.__NANASHI.S.nodes.ie.label
  }));
  console.log(ac.links < mid.n && ac.kaerenai ? '✓ 実クリックで切断 → 「帰れない」／家＝' + ac.ie : '✗ 切断できない');

  await page.evaluate(() => {
    const G = window.__NANASHI;
    ['ame', 'eki', 'kaeru', 'kasa', 'gogo', 'kaisatsu', 'ie', 'kaerenai', 'omoidasu']
      .forEach(id => { if (G.S.nodes[id]) { G.S.nodes[id].el.remove(); delete G.S.nodes[id]; } });
  });
  await page.waitForTimeout(4000);
  console.log(await page.locator('#stuck:not(.hidden)').count() ? '✓ 手詰まり表示あり' : '✗ 手詰まりが出ない');
  await page.waitForTimeout(16000);
  console.log(await page.evaluate(() => window.__NANASHI.S.act) >= 5
    ? '✓ 手詰まりから終盤へ逃がされる' : '✗ 手詰まりのまま固まる');

  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#btn-new'); await page.waitForTimeout(4200);
  console.log(await page.locator('#stuck:not(.hidden)').count() === 0
    ? '✓ 進行可能なうちは手詰まり表示が出ない' : '✗ 誤検知');

  await page.evaluate(() => { const G = window.__NANASHI; G.tryConnect('watashi', 'ame'); });
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(700);
  const cont = await page.locator('#btn-continue:not(.hidden)').count();
  if (cont) { await page.click('#btn-continue'); await page.waitForTimeout(700); }
  console.log(cont && await page.evaluate(() => Object.keys(window.__NANASHI.S.nodes).length) > 8
    ? '✓ セーブ／ロード OK' : '✗ セーブ復元に失敗');

  await page.evaluate(() => window.__NANASHI.ending('S'));
  await page.waitForTimeout(2500);
  console.log(await page.locator('#ending-title').textContent() === 'それでよかった' ? '✓ 特殊エンド' : '✗ 特殊エンド失敗');
  await page.waitForTimeout(3500);
  await page.click('#ending-back'); await page.waitForTimeout(800);
  console.log(await page.locator('#secret-node:not(.hidden)').count() ? '✓ タイトルに「本当に？」' : '✗ 隠しノードが出ない');

  console.log(errors.length ? '\n✗ コンソールエラー:\n' + errors.join('\n') : '\n✓ コンソールエラーなし');
  await browser.close();
})();
