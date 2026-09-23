const { spawn } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('===============================================================');
  console.log('STARTING FULL VERIFICATION SUITE: TARGET INSPECTOR CLICK-TO-SELECT');
  console.log('===============================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9277',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  try {
    await new Promise((r) => setTimeout(r, 2000));
    let wsUrl = null;
    for (let i = 0; i < 15; i++) {
      try {
        const targets = await getJson('http://127.0.0.1:9277/json/list');
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!wsUrl) throw new Error('Could not connect to Edge DevTools target');

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pending = new Map();
    const consoleErrors = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value !== undefined ? (typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value)) : (a.description || '')).join(' ');
        if (msg.params.type === 'error') {
          consoleErrors.push(text);
          console.error('[BROWSER ERROR]', text);
        }
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idCounter++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((r) => (ws.onopen = r));
    await send('Page.enable');
    await send('Runtime.enable');

    await new Promise((r) => setTimeout(r, 2000));

    // 1. Enter Command Center
    console.log('\n[TEST 1] Entering Command Center & Navigating to Live Surveillance...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const liveBtn = btns.find(b => b.innerText && b.innerText.toUpperCase().includes('LIVE SURVEILLANCE'));
        if (liveBtn) liveBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Verify initial Inspector shows "SELECT A TARGET TO INSPECT"
    const initialInspector = await send('Runtime.evaluate', {
      expression: `document.getElementById('target-inspector-panel')?.innerText.includes('SELECT A TARGET TO INSPECT')`,
      returnByValue: true
    });
    console.log('Initial Inspector empty state verified:', initialInspector.result.value);
    if (!initialInspector.result.value) throw new Error('Initial inspector was not in empty state');

    // 2. Stream frame with Track 1 (T-1 PERSON_WITH_BAG)
    console.log('\n[TEST 2] Streaming frame with T-1 PERSON_WITH_BAG (Threat HIGH, 73%)...');
    const sendFrame = async (detections) => {
      await send('Runtime.evaluate', {
        expression: `(() => {
          if (window.__liveWs && window.__liveWs.onmessage) {
            window.__liveWs.onmessage({
              data: JSON.stringify(${JSON.stringify(detections)})
            });
          }
        })()`,
      });
    };

    const frameT1 = [{
      id: "det_1",
      sensor: "thermal",
      class: "person_with_bag",
      confidence: 0.731,
      track_id: 1,
      bbox: [0.25, 0.35, 0.40, 0.65],
      speed: 3.4,
      zone: "Perimeter East",
      direction: "NW",
      threat: true,
      threat_level: "HIGH",
      threat_reason: "Person with bag near restricted perimeter",
      timestamp: "2026-09-23T12:20:00Z"
    }];

    await sendFrame(frameT1);
    await new Promise((r) => setTimeout(r, 500));

    // Verify Active Target Row exists
    const rowCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.getElementById('active-target-1');
        return row ? { found: true, text: row.innerText.replace(/\\n+/g, ' ') } : { found: false };
      })()`,
      returnByValue: true
    });
    console.log('Active Target Row check:', rowCheck.result.value);
    if (!rowCheck.result.value.found) throw new Error('Row active-target-1 not found in DOM');

    // 3. Click Active Target Row T-1
    console.log('\n[TEST 3] Clicking Active Target Row T-1...');
    const clickT1 = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.getElementById('active-target-1');
        if (!row) return false;
        row.click();
        return true;
      })()`,
      returnByValue: true
    });
    console.log('Click executed:', clickT1.result.value);
    await new Promise((r) => setTimeout(r, 600));

    // Verify Inspector Displays T-1 details
    const t1Details = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('target-inspector-panel');
        if (!el) return null;
        const txt = el.innerText;
        return {
          hasT1: txt.includes('T-1'),
          hasClass: txt.includes('PERSON WITH BAG') || txt.includes('PERSON_WITH_BAG'),
          hasThreat: txt.includes('THREAT') && txt.includes('HIGH'),
          hasConfidence: txt.includes('73.1%'),
          hasSpeed: txt.includes('3.4 km/h'),
          hasZone: txt.includes('Perimeter East'),
          hasDirection: txt.includes('NW'),
          hasTracking: txt.includes('ByteTrack'),
          hasPosition: txt.includes('X:') && txt.includes('Y:'),
          fullText: txt.replace(/\\n+/g, ' | ')
        };
      })()`,
      returnByValue: true
    });
    console.log('Inspector T-1 verification:', t1Details.result.value);
    if (!t1Details.result.value.hasT1 || !t1Details.result.value.hasThreat) {
      throw new Error('Target Inspector failed to render T-1 details properly');
    }
    console.log('>>> TEST 3 (T-1 Selection & Field Mapping): PASS');

    // 4. Test Survival over 20 consecutive WebSocket updates
    console.log('\n[TEST 4] Testing Selection Survival over 20 consecutive WebSocket updates...');
    let survivedAll = true;
    for (let f = 1; f <= 20; f++) {
      const movedT1 = [{
        ...frameT1[0],
        confidence: 0.73 + (f * 0.005),
        speed: 3.4 + (f * 0.1),
        bbox: [0.25 + f*0.005, 0.35 + f*0.005, 0.40 + f*0.005, 0.65 + f*0.005]
      }];
      await sendFrame(movedT1);
      await new Promise((r) => setTimeout(r, 100));

      const isPrompt = await send('Runtime.evaluate', {
        expression: `document.getElementById('target-inspector-panel')?.innerText.includes('SELECT A TARGET TO INSPECT')`,
        returnByValue: true
      });
      if (isPrompt.result.value) {
        survivedAll = false;
        console.error(`Selection lost on frame ${f}!`);
        break;
      }
    }
    console.log('Selection survived 20 WebSocket updates:', survivedAll);
    if (!survivedAll) throw new Error('Selection did not survive WebSocket stream updates');
    console.log('>>> TEST 4 (Selection Survives WebSocket Updates): PASS');

    // 5. Test Target Switching (T-1 -> T-2 -> T-1)
    console.log('\n[TEST 5] Testing Target Switching with multiple active targets (T-1 and T-2)...');
    const frameT1andT2 = [
      frameT1[0],
      {
        id: "det_2",
        sensor: "thermal",
        class: "vehicle",
        confidence: 0.88,
        track_id: 2,
        bbox: [0.10, 0.10, 0.30, 0.30],
        speed: 24.5,
        zone: "Outer Gate",
        direction: "E",
        threat: false,
        threat_level: "LOW",
        threat_reason: "Authorized patrol vehicle",
        timestamp: "2026-09-23T12:20:05Z"
      }
    ];

    await sendFrame(frameT1andT2);
    await new Promise((r) => setTimeout(r, 500));

    // Click T-2
    console.log('Clicking T-2...');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('active-target-2')?.click()`,
    });
    await new Promise((r) => setTimeout(r, 500));

    const checkT2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const txt = document.getElementById('target-inspector-panel')?.innerText || '';
        return {
          hasT2: txt.includes('T-2'),
          hasVehicle: txt.includes('VEHICLE'),
          hasNormal: txt.includes('NORMAL'),
          text: txt.replace(/\\n+/g, ' | ').substring(0, 150)
        };
      })()`,
      returnByValue: true
    });
    console.log('Inspector T-2 check:', checkT2.result.value);
    if (!checkT2.result.value.hasT2 || !checkT2.result.value.hasVehicle) {
      throw new Error('Target Inspector failed to switch to T-2');
    }

    // Switch back to T-1
    console.log('Switching back to T-1...');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('active-target-1')?.click()`,
    });
    await new Promise((r) => setTimeout(r, 500));

    const checkT1Again = await send('Runtime.evaluate', {
      expression: `document.getElementById('target-inspector-panel')?.innerText.includes('T-1')`,
      returnByValue: true
    });
    console.log('Inspector switched back to T-1:', checkT1Again.result.value);
    if (!checkT1Again.result.value) throw new Error('Target Inspector failed to switch back to T-1');
    console.log('>>> TEST 5 (Target Switching): PASS');

    // 6. Test Target Disappearance (Historical Retention: TRACK NO LONGER ACTIVE)
    console.log('\n[TEST 6] Testing Target Disappearance (T-1 drops from active frame)...');
    // Send frame with NO targets
    await sendFrame([]);
    await new Promise((r) => setTimeout(r, 500));

    const historicalCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const txt = document.getElementById('target-inspector-panel')?.innerText || '';
        return {
          hasT1: txt.includes('T-1'),
          hasInactiveBadge: txt.includes('TRACK NO LONGER ACTIVE') || txt.includes('LAST KNOWN'),
          notEmptyPrompt: !txt.includes('SELECT A TARGET TO INSPECT'),
          text: txt.replace(/\\n+/g, ' | ').substring(0, 180)
        };
      })()`,
      returnByValue: true
    });
    console.log('Historical Target Retention check:', historicalCheck.result.value);
    if (!historicalCheck.result.value.hasT1 || !historicalCheck.result.value.hasInactiveBadge || !historicalCheck.result.value.notEmptyPrompt) {
      throw new Error('Historical retention failed when target stopped being active');
    }
    console.log('>>> TEST 6 (Historical Retention / TRACK NO LONGER ACTIVE): PASS');

    // 7. Check browser console errors
    console.log('\n[TEST 7] Browser Console Errors Check...');
    console.log('Total console errors recorded:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('Console errors:', consoleErrors);
      throw new Error('Console errors were detected during browser execution');
    }
    console.log('>>> TEST 7 (Browser Console): PASS');

    console.log('\n===============================================================');
    console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY WITH ZERO ERRORS!');
    console.log('===============================================================');

  } finally {
    browserProcess.kill();
  }
}

run().catch((err) => {
  console.error('\nFAILED TEST:', err);
  process.exit(1);
});
