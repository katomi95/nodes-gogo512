const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:900}});
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(400); await p.click('#btn-new'); await p.waitForTimeout(800);
  await p.evaluate(() => window.__NANASHI.tryConnect('watashi','ie'));
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const G = window.__NANASHI;
    const l = G.S.links[0];
    const r = l.hit.getBoundingClientRect();
    const x = r.x + r.width/2, y = r.y + r.height/2;
    return { x, y,
      hitCS: getComputedStyle(l.hit).pointerEvents,
      hitSW: getComputedStyle(l.hit).strokeWidth,
      nodesCS: getComputedStyle(document.getElementById('nodes')).pointerEvents,
      stack: document.elementsFromPoint(x,y).map(e => e.tagName + '.' + (e.getAttribute('class')||e.id||'')),
      d: l.hit.getAttribute('d')
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
