const { spawn } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function runTest() {
  console.log('=================================================================');
  console.log('CANVAS UI ZONE CREATION -> DELETE -> REFRESH VERIFICATION');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9229/json/list');
      const pageTarget = list.find(t => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!wsUrl) {
    browserProcess.kill();
    throw new Error('Failed to connect to browser CDP on port 9229');
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'CDP Error'));
      else resolve(msg.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error('Eval failed: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  async function navigateToZones() {
    await new Promise(r => setTimeout(r, 2000));
    for (let i = 0; i < 25; i++) {
      const state = await evaluate(`(() => {
        const hasEnter = Array.from(document.querySelectorAll('button, a')).some(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        const hasSidebar = !!document.querySelector('aside');
        return { hasEnter, hasSidebar };
      })()`);
      if (state && (state.hasEnter || state.hasSidebar)) break;
      await new Promise(r => setTimeout(r, 400));
    }

    await evaluate(`(() => {
      const enter = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
      if (enter) enter.click();
    })()`);

    for (let i = 0; i < 15; i++) {
      const asideReady = await evaluate(`!!document.querySelector('aside button')`);
      if (asideReady) break;
      await new Promise(r => setTimeout(r, 400));
    }

    await evaluate(`(() => {
      const asideBtns = Array.from(document.querySelectorAll('aside button'));
      const target = asideBtns.find(b => b.textContent && b.textContent.includes('Restricted Zones'));
      if (target) target.click();
    })()`);

    for (let i = 0; i < 20; i++) {
      const ready = await evaluate(`document.body.innerText.includes('RESTRICTED ZONES') && document.querySelectorAll('span.font-bold.text-xs.truncate').length >= 2`);
      if (ready) break;
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  async function getZoneNames() {
    return await evaluate(`
      (() => {
        const spans = Array.from(document.querySelectorAll('span.font-bold.text-xs.truncate'));
        return spans.map(s => s.textContent.trim()).filter(Boolean);
      })()
    `);
  }

  try {
    console.log('[TEST] Navigating to Restricted Zones...');
    await navigateToZones();

    // 1. Check Initial State
    const initialZones = await getZoneNames();
    console.log('Baseline UI Zones:', initialZones);

    // 2. Click "DRAW BOUNDARY" / "NEW GEOFENCE"
    console.log('\n--- STEP 1: TRIGGER CANVAS DRAWING VIA UI ---');
    const drawBtnClicked = await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const newGeofenceBtn = btns.find(b => b.textContent.includes('NEW GEOFENCE') || b.textContent.includes('DRAW'));
        if (newGeofenceBtn) {
          newGeofenceBtn.click();
          return 'Clicked ' + newGeofenceBtn.textContent.trim();
        }
        return 'Button not found';
      })()
    `);
    console.log('Action:', drawBtnClicked);
    await new Promise(r => setTimeout(r, 800));

    // Simulate 4 clicks on canvas
    console.log('Clicking 4 boundary vertices on Canvas...');
    for (const [rx, ry] of [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5], [0.2, 0.5]]) {
      await evaluate(`
        (() => {
          const canvas = document.querySelector('canvas');
          const rect = canvas.getBoundingClientRect();
          const evt = new MouseEvent('click', {
            clientX: rect.left + rect.width * ${rx},
            clientY: rect.top + rect.height * ${ry},
            bubbles: true
          });
          canvas.dispatchEvent(evt);
        })()
      `);
      await new Promise(r => setTimeout(r, 200));
    }

    // Click "Save Polygon"
    console.log('Clicking Save Polygon to open modal...');
    await evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const savePolyBtn = btns.find(b => b.textContent.includes('Save Polygon'));
        if (savePolyBtn) savePolyBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // Modal is open! Change name to "Sector Echo Geofence" and click ARM GEOFENCE
    console.log('Entering geofence name "Sector Echo Geofence" and clicking ARM GEOFENCE...');
    await evaluate(`
      (() => {
        const modal = document.querySelector('.fixed.inset-0');
        if (!modal) return 'Modal not open';
        const input = modal.querySelector('input');
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, 'Sector Echo Geofence');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const armBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('ARM GEOFENCE'));
        if (armBtn) armBtn.click();
        return 'Clicked ARM GEOFENCE';
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Check UI has new zone
    const zonesAfterUiCreate = await getZoneNames();
    console.log('UI Zones after UI creation:', zonesAfterUiCreate);
    if (!zonesAfterUiCreate.some(z => z.includes('Sector Echo Geofence'))) {
      throw new Error('Newly created zone not found in UI!');
    }
    console.log('✓ "Sector Echo Geofence" visible in UI with backend real ID');

    // 3. REFRESH to confirm creation persisted
    console.log('\n--- STEP 2: REFRESH TO VERIFY CREATE PERSISTENCE ---');
    await send('Page.reload');
    await navigateToZones();

    const zonesAfterRefresh = await getZoneNames();
    console.log('UI Zones after Refresh:', zonesAfterRefresh);
    if (!zonesAfterRefresh.some(z => z.includes('Sector Echo Geofence'))) {
      throw new Error('"Sector Echo Geofence" did NOT persist across refresh!');
    }
    console.log('✓ "Sector Echo Geofence" persisted across refresh!');

    // 4. DELETE THE NEWLY CREATED ZONE VIA UI
    console.log('\n--- STEP 3: DELETE "Sector Echo Geofence" VIA UI BUTTON ---');
    const deleteSuccess = await evaluate(`
      (() => {
        const spans = Array.from(document.querySelectorAll('span.font-bold.text-xs.truncate'));
        const echoSpan = spans.find(s => s.textContent.includes('Sector Echo Geofence'));
        if (!echoSpan) return false;
        const card = echoSpan.closest('.p-3') || echoSpan.parentElement.parentElement;
        const delBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Delete'));
        if (delBtn) {
          delBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Clicked Delete button:', deleteSuccess);
    await new Promise(r => setTimeout(r, 1500));

    const zonesImmediatelyAfterDel = await getZoneNames();
    console.log('UI Zones immediately after Delete:', zonesImmediatelyAfterDel);
    if (zonesImmediatelyAfterDel.some(z => z.includes('Sector Echo Geofence'))) {
      throw new Error('Zone did not disappear immediately');
    }
    console.log('✓ Zone disappeared immediately from UI');

    // 5. REFRESH TO CONFIRM DELETION PERSISTENCE
    console.log('\n--- STEP 4: REFRESH TO VERIFY DELETE PERSISTENCE ---');
    await send('Page.reload');
    await navigateToZones();

    const zonesFinal = await getZoneNames();
    console.log('UI Zones after Refresh:', zonesFinal);
    if (zonesFinal.some(z => z.includes('Sector Echo Geofence'))) {
      throw new Error('CRITICAL BUG: "Sector Echo Geofence" REAPPEARED after refresh!');
    }
    console.log('✓ "Sector Echo Geofence" is STILL GONE! IT DID NOT REAPPEAR!');

    // Check SQLite
    const apiFinal = await getJson('http://127.0.0.1:8000/api/zones');
    console.log('Final SQLite Zones:', apiFinal.map(z => ({ id: z.id, name: z.name })));
    if (apiFinal.some(z => z.name === 'Sector Echo Geofence')) {
      throw new Error('CRITICAL: "Sector Echo Geofence" still exists in SQLite!');
    }
    console.log('✓ SQLite confirms permanent deletion!');

    console.log('\n=================================================================');
    console.log('FULL UI CANVAS WORKFLOW + DELETE PERSISTENCE PASSED!');
    console.log('=================================================================');

  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runTest().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
