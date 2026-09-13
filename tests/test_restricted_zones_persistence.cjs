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
  console.log('RESTRICTED ZONES CRUD PERSISTENCE E2E VERIFICATION (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9228/json/list');
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
    throw new Error('Failed to connect to browser CDP on port 9228');
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
    console.log('    [Nav] Waiting for app boot sequence...');
    for (let i = 0; i < 20; i++) {
      const state = await evaluate(`(() => {
        const text = document.body.innerText || '';
        const hasEnter = Array.from(document.querySelectorAll('button, a')).some(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        const hasSidebar = !!document.querySelector('aside');
        return { hasEnter, hasSidebar };
      })()`);

      if (state && (state.hasEnter || state.hasSidebar)) {
        break;
      }
      await new Promise(r => setTimeout(r, 400));
    }

    // Click Enter Command Center if on landing page
    await evaluate(`(() => {
      const enter = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
      if (enter) enter.click();
    })()`);

    // Wait for aside sidebar
    for (let i = 0; i < 15; i++) {
      const asideReady = await evaluate(`!!document.querySelector('aside button')`);
      if (asideReady) break;
      await new Promise(r => setTimeout(r, 400));
    }

    // Click Restricted Zones in sidebar
    await evaluate(`(() => {
      const asideBtns = Array.from(document.querySelectorAll('aside button'));
      const target = asideBtns.find(b => b.textContent && b.textContent.includes('Restricted Zones'));
      if (target) target.click();
    })()`);

    // Wait for Restricted Zones page header
    for (let i = 0; i < 15; i++) {
      const onZones = await evaluate(`document.body.innerText.includes('RESTRICTED ZONES')`);
      if (onZones) break;
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
    console.log('[TEST] Navigating to Restricted Zones page...');
    await navigateToZones();

    const pageHeader = await evaluate(`document.body.innerText.includes('RESTRICTED ZONES')`);
    if (!pageHeader) throw new Error('Failed to reach Restricted Zones page');
    console.log('✓ Restricted Zones workstation successfully mounted');

    // 1. Check Initial State
    console.log('\n--- STEP 1: VERIFY INITIAL BASELINE STATE ---');
    const initialZones = await getZoneNames();
    console.log('Baseline UI Zones:', initialZones);
    if (!initialZones.some(z => z.includes('Restricted Zone A')) || !initialZones.some(z => z.includes('Perimeter Zone B'))) {
      throw new Error('Expected initial baseline zones (Zone A, Zone B) not found in UI: ' + JSON.stringify(initialZones));
    }
    console.log('✓ Baseline zones present in UI: Restricted Zone A & Perimeter Zone B');

    // Query backend API directly to confirm SQLite baseline
    const apiBaseline = await getJson('http://127.0.0.1:8000/api/zones');
    console.log('Baseline SQLite Zones:', apiBaseline.map(z => ({ id: z.id, name: z.name })));
    const baselineCount = apiBaseline.length;

    // 2. CREATE A 3RD ZONE
    console.log('\n--- STEP 2: CREATE 3RD ZONE ("Restricted Zone Bravo") VIA BACKEND & REFRESH ---');
    const createResult = await evaluate(`
      (async () => {
        const res = await fetch('http://127.0.0.1:8000/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Restricted Zone Bravo',
            polygon: [[0.25, 0.25], [0.55, 0.25], [0.55, 0.65], [0.25, 0.65]],
            enabled: true
          })
        });
        return await res.json();
      })()
    `);
    console.log('Created 3rd Zone via Backend in SQLite:', createResult);
    if (!createResult.id || !createResult.id.startsWith('zone_')) {
      throw new Error('Zone creation did not return valid backend ID: ' + JSON.stringify(createResult));
    }

    // Refresh page to load the 3 zones in the UI
    console.log('\n--- STEP 3: REFRESH PAGE TO VERIFY CREATE PERSISTENCE ---');
    await send('Page.reload');
    await navigateToZones();

    const zonesAfterRefresh = await getZoneNames();
    console.log('UI Zones After Refresh:', zonesAfterRefresh);
    if (!zonesAfterRefresh.some(z => z.includes('Restricted Zone Bravo'))) {
      throw new Error('Created zone "Restricted Zone Bravo" did NOT persist upon refresh!');
    }
    console.log('✓ Zone Bravo successfully persisted across browser refresh!');

    // 3. TEST DEACTIVATE PERSISTENCE
    console.log('\n--- STEP 4: TEST DEACTIVATE PERSISTENCE ---');
    const deactivateSuccess = await evaluate(`
      (() => {
        const spans = Array.from(document.querySelectorAll('span.font-bold.text-xs.truncate'));
        const bravoSpan = spans.find(s => s.textContent.includes('Restricted Zone Bravo'));
        if (!bravoSpan) return false;
        const card = bravoSpan.closest('.p-3') || bravoSpan.parentElement.parentElement;
        const btn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Deactivate'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Clicked Deactivate on Zone Bravo in UI:', deactivateSuccess);
    await new Promise(r => setTimeout(r, 1000));

    // Reload page to verify deactivation persisted in SQLite
    console.log('Reloading page to verify deactivation persisted in SQLite...');
    await send('Page.reload');
    await navigateToZones();

    const isDeactivatedAfterReload = await evaluate(`
      (() => {
        const spans = Array.from(document.querySelectorAll('span.font-bold.text-xs.truncate'));
        const bravoSpan = spans.find(s => s.textContent.includes('Restricted Zone Bravo'));
        if (!bravoSpan) return false;
        const card = bravoSpan.closest('.p-3') || bravoSpan.parentElement.parentElement;
        const armBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Arm Zone'));
        return !!armBtn;
      })()
    `);
    console.log('Zone Bravo persists as Deactivated (shows "Arm Zone" button):', isDeactivatedAfterReload);
    if (!isDeactivatedAfterReload) {
      throw new Error('Zone Bravo did NOT persist inactive/deactivated state across reload!');
    }
    console.log('✓ Deactivated state persisted across reload!');

    // 4. TEST DELETE PERSISTENCE
    console.log('\n--- STEP 5: DELETE 3RD ZONE ("Restricted Zone Bravo") VIA UI DELETE BUTTON ---');
    const deleteSuccess = await evaluate(`
      (() => {
        const spans = Array.from(document.querySelectorAll('span.font-bold.text-xs.truncate'));
        const bravoSpan = spans.find(s => s.textContent.includes('Restricted Zone Bravo'));
        if (!bravoSpan) return false;
        const card = bravoSpan.closest('.p-3') || bravoSpan.parentElement.parentElement;
        const delBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Delete'));
        if (delBtn) {
          delBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Clicked Delete button in UI:', deleteSuccess);
    await new Promise(r => setTimeout(r, 1500));

    // Check UI immediately
    const zonesImmediatelyAfterDelete = await getZoneNames();
    console.log('UI Zones Immediately After Delete:', zonesImmediatelyAfterDelete);
    if (zonesImmediatelyAfterDelete.some(z => z.includes('Restricted Zone Bravo'))) {
      throw new Error('Zone Bravo did not disappear from UI immediately after delete');
    }
    console.log('✓ Zone Bravo immediately disappeared from UI');

    // 5. REFRESH PAGE TO VERIFY DELETE PERSISTENCE
    console.log('\n--- STEP 6: REFRESH PAGE TO VERIFY DELETE PERSISTENCE ---');
    await send('Page.reload');
    await navigateToZones();

    const zonesAfterRefreshDelete = await getZoneNames();
    console.log('UI Zones After Refresh:', zonesAfterRefreshDelete);
    if (zonesAfterRefreshDelete.some(z => z.includes('Restricted Zone Bravo'))) {
      throw new Error('CRITICAL BUG: Zone Bravo REAPPEARED after refresh! Persistence is broken!');
    }
    console.log('✓ Zone Bravo is STILL GONE after browser refresh! DOES NOT REAPPEAR!');

    // Verify baseline zones remain untouched
    if (!zonesAfterRefreshDelete.some(z => z.includes('Restricted Zone A')) || !zonesAfterRefreshDelete.some(z => z.includes('Perimeter Zone B'))) {
      throw new Error('Baseline zones were modified or deleted!');
    }
    console.log('✓ Existing baseline zones (Zone A, Zone B) remain completely untouched!');

    // Query backend directly to confirm SQLite state
    const apiFinal = await getJson('http://127.0.0.1:8000/api/zones');
    console.log('Final SQLite Zones:', apiFinal.map(z => ({ id: z.id, name: z.name })));
    if (apiFinal.some(z => z.name === 'Restricted Zone Bravo')) {
      throw new Error('CRITICAL: Zone Bravo still exists in SQLite database!');
    }
    if (apiFinal.length !== baselineCount) {
      throw new Error(`Expected exactly ${baselineCount} zones in SQLite, found ${apiFinal.length}`);
    }
    console.log('✓ SQLite database confirmed: Zone Bravo is permanently deleted, baseline count is exact');

    console.log('\n=================================================================');
    console.log('ALL RESTRICTED ZONES CRUD PERSISTENCE CHECKS PASSED PERFECTLY!');
    console.log('=================================================================');

  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
