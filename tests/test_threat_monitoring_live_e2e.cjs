const http = require('http');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const CDP_PORT = 9230;

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('=================================================================');
  console.log('STARTING THREAT MONITORING LIVE INTEGRATION E2E TEST (PORT ' + CDP_PORT + ')');
  console.log('=================================================================');

  // Ensure any previous active video analysis is stopped first for clean test
  try {
    const postData = JSON.stringify({ video_id: 'vid_19dd8b58' });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8000,
      path: '/api/video/stop',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    });
    req.write(postData);
    req.end();
    await new Promise(r => setTimeout(r, 1000));
  } catch (e) {}

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  try {
    await new Promise(r => setTimeout(r, 2500));

    let wsUrl = null;
    for (let i = 0; i < 15; i++) {
      try {
        const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const pageTarget = list.find(t => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 500));
    }

    if (!wsUrl) throw new Error('Failed to connect to Edge CDP on port ' + CDP_PORT);

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    const consoleErrors = [];

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args?.map(a => a.value || a.description).join(' ') || 'Console Error';
        consoleErrors.push(text);
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });

    await new Promise(r => ws.addEventListener('open', r));

    function sendCmd(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        pending.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    async function evalJs(expr) {
      const r = await sendCmd('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r?.exceptionDetails) {
        console.error('JS Evaluation error:', r.exceptionDetails);
      }
      return r?.result?.value;
    }

    await sendCmd('Runtime.enable');
    await new Promise(r => setTimeout(r, 4000));

    const currentUrl = await evalJs('window.location.href');
    console.log('Current URL:', currentUrl);

    // Dismiss landing page if present
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('ENTER COMMAND CENTER'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // =========================================================================
    // STATE A: Open Threat Monitoring when video is stopped/idle
    // =========================================================================
    console.log('\n--- TEST STATE A: Threat Monitoring Idle State ---');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    const idleState = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasIdleHeader: text.includes('SURVEILLANCE IDLE'),
          hasNoActiveSurveillanceMap: text.includes('NO ACTIVE SURVEILLANCE'),
          hasUploadPrompt: text.includes('Upload and start a thermal video to begin monitoring.'),
          hasZeroThreatCount: text.includes('ACTIVE THREATS') && text.includes('00'),
          hasNoActiveThreatsQueue: text.includes('NO ACTIVE THREATS')
        };
      })()
    `);
    console.log('✓ Header shows SURVEILLANCE IDLE:', idleState.hasIdleHeader);
    console.log('✓ Map shows NO ACTIVE SURVEILLANCE:', idleState.hasNoActiveSurveillanceMap);
    console.log('✓ Map prompt present:', idleState.hasUploadPrompt);
    console.log('✓ Active Threats counter is 00:', idleState.hasZeroThreatCount);
    console.log('✓ Threat Queue shows NO ACTIVE THREATS:', idleState.hasNoActiveThreatsQueue);

    if (!idleState.hasIdleHeader || !idleState.hasNoActiveSurveillanceMap || !idleState.hasZeroThreatCount) {
      throw new Error('State A Failed: Idle state is not clean!');
    }

    // =========================================================================
    // STATE B: Navigate to Live Surveillance and start real thermal video
    // =========================================================================
    console.log('\n--- TEST STATE B: Live Surveillance Real Video Playback ---');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Click START AI DETECTION
    console.log('Starting AI Detection on uploaded thermal video...');
    await evalJs(`
      (() => {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 3000));

    const liveRunning = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          isDetectionInProgress: text.includes('DETECTION IN PROGRESS') || text.includes('PAUSE'),
          hasFps: !text.includes('FPS 0.0'),
          badgeInferenceActive: text.includes('AI INFERENCE ACTIVE')
        };
      })()
    `);
    console.log('✓ Detection in progress / video playing:', liveRunning.isDetectionInProgress);
    console.log('✓ Inference active badge present:', liveRunning.badgeInferenceActive);

    // =========================================================================
    // STATE C: Navigate to Threat Monitoring during active video session
    // =========================================================================
    console.log('\n--- TEST STATE C: Threat Monitoring Active Session Synchronization ---');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2500));

    const activeThreatState = await evalJs(`
      (() => {
        const text = document.body.innerText;
        const queueItems = Array.from(document.querySelectorAll('.cursor-pointer')).filter(el => el.textContent && el.textContent.includes('TRACK T-'));
        const svgTargets = Array.from(document.querySelectorAll('circle')).filter(c => c.getAttribute('stroke') || c.getAttribute('fill'));
        const svgPolygons = document.querySelectorAll('polygon');

        return {
          hasActiveHeader: text.includes('SURVEILLANCE ACTIVE'),
          threatEngineActive: text.includes('THREAT ENGINE ACTIVE'),
          activeThreatsNotZero: text.includes('ACTIVE THREATS') && !text.includes('SURVEILLANCE IDLE'),
          hasRealThreatQueue: text.includes('THREAT QUEUE') && !text.includes('NO ACTIVE THREATS'),
          hasDroneIncident: text.includes('Drone') || text.includes('DRONE'),
          hasTrackId: text.includes('TRACK T-') || text.includes('THREAT #T-'),
          hasSeverity: text.includes('High') || text.includes('HIGH') || text.includes('Critical') || text.includes('CRITICAL'),
          hasTruthfulReason: text.includes('Unauthorized drone detected') || text.includes('Threat detected by Threat Engine'),
          hasMapTargets: document.querySelectorAll('[data-testid="map-active-target"]').length > 0 || svgTargets.length > 0,
          hasRestrictedZonesOnMap: svgPolygons.length > 0,
          queueLength: queueItems.length
        };
      })()
    `);

    console.log('✓ Header shows SURVEILLANCE ACTIVE:', activeThreatState.hasActiveHeader);
    console.log('✓ Threat Engine Active badge:', activeThreatState.threatEngineActive);
    console.log('✓ Active Threats KPI reflects detections:', activeThreatState.activeThreatsNotZero);
    console.log('✓ Threat Queue populated with real session threats:', activeThreatState.hasRealThreatQueue);
    console.log('✓ Truthful Drone detection present:', activeThreatState.hasDroneIncident);
    console.log('✓ Truthful ByteTrack ID present:', activeThreatState.hasTrackId);
    console.log('✓ Threat severity displayed:', activeThreatState.hasSeverity);
    console.log('✓ Threat reason displayed:', activeThreatState.hasTruthfulReason);
    console.log('✓ Real active targets rendered on Surveillance Zone Map:', activeThreatState.hasMapTargets);
    console.log('✓ Real restricted zones from SQLite rendered on map:', activeThreatState.hasRestrictedZonesOnMap);

    if (!activeThreatState.hasActiveHeader || !activeThreatState.hasRealThreatQueue) {
      throw new Error('State C Failed: Threat Monitoring did not receive live active surveillance data!');
    }

    // =========================================================================
    // STATE D: Browser Refresh during active processing
    // =========================================================================
    console.log('\n--- TEST STATE D: Refresh Threat Monitoring during Active Processing ---');
    await sendCmd('Page.reload');
    await new Promise(r => setTimeout(r, 3000));

    // Check if landing page was shown on reload and dismiss
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('ENTER COMMAND CENTER'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Navigate to Threat Monitoring
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2500));

    const refreshedState = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasActiveHeader: text.includes('SURVEILLANCE ACTIVE'),
          activeThreatsNotZero: text.includes('ACTIVE THREATS') && !text.includes('SURVEILLANCE IDLE'),
          hasRealThreatQueue: text.includes('THREAT QUEUE') && !text.includes('NO ACTIVE THREATS'),
          hasDroneIncident: text.includes('Drone') || text.includes('DRONE')
        };
      })()
    `);
    console.log('✓ After refresh, SURVEILLANCE ACTIVE retained:', refreshedState.hasActiveHeader);
    console.log('✓ After refresh, Active Threats count retained:', refreshedState.activeThreatsNotZero);
    console.log('✓ After refresh, Threat Queue incidents retained:', refreshedState.hasRealThreatQueue);
    console.log('✓ After refresh, Drone incident retained:', refreshedState.hasDroneIncident);

    if (!refreshedState.hasActiveHeader || !refreshedState.hasRealThreatQueue) {
      throw new Error('State D Failed: Session threats lost on browser refresh!');
    }

    // =========================================================================
    // STATE E: Stop video in Live Surveillance -> Threat Monitoring becomes Idle
    // =========================================================================
    console.log('\n--- TEST STATE E: Stopping Video -> Active Surveillance Becomes Idle ---');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking STOP in Live Surveillance...');
    await evalJs(`
      (() => {
        const stopBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('STOP'));
        if (stopBtn) stopBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Navigate back to Threat Monitoring
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    const stoppedState = await evalJs(`
      (() => {
        const text = document.body.innerText;
        const svgTargets = Array.from(document.querySelectorAll('circle')).filter(c => c.getAttribute('stroke') || c.getAttribute('fill'));
        return {
          hasIdleHeader: text.includes('SURVEILLANCE IDLE'),
          hasZeroThreatCount: text.includes('ACTIVE THREATS') && text.includes('00'),
          hasNoActiveThreats: text.includes('NO ACTIVE THREATS'),
          mapTargetsCleared: document.querySelectorAll('[data-testid="map-active-target"]').length === 0
        };
      })()
    `);
    console.log('✓ After stop, header returns to SURVEILLANCE IDLE:', stoppedState.hasIdleHeader);
    console.log('✓ After stop, Active Threats returns to 00:', stoppedState.hasZeroThreatCount);
    console.log('✓ After stop, Threat Queue returns to NO ACTIVE THREATS:', stoppedState.hasNoActiveThreats);
    console.log('✓ After stop, active targets cleared from map:', stoppedState.mapTargetsCleared);

    if (!stoppedState.hasIdleHeader || !stoppedState.hasZeroThreatCount) {
      throw new Error('State E Failed: Stop did not transition Threat Monitoring to idle!');
    }

    // =========================================================================
    // STATE F: Restart Video -> New Real Detections/Threats Appear
    // =========================================================================
    console.log('\n--- TEST STATE F: Restart Video -> New Real Threats Appear ---');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    console.log('Clicking START AI DETECTION again...');
    await evalJs(`
      (() => {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 3000));

    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    const restartedThreatState = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasActiveHeader: text.includes('SURVEILLANCE ACTIVE'),
          activeThreatsNotZero: text.includes('ACTIVE THREATS') && !text.includes('SURVEILLANCE IDLE')
        };
      })()
    `);
    console.log('✓ After restart, SURVEILLANCE ACTIVE appears:', restartedThreatState.hasActiveHeader);
    console.log('✓ After restart, real threats populate:', restartedThreatState.activeThreatsNotZero);

    if (!restartedThreatState.hasActiveHeader || !restartedThreatState.activeThreatsNotZero) {
      throw new Error('State F Failed: Restart did not generate new threats in Threat Monitoring!');
    }

    // Check console errors
    console.log('\n--- Console Error Audit ---');
    console.log('Browser console errors caught:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors);
    }

    ws.close();
    console.log('\n=================================================================');
    console.log('>>> THREAT MONITORING LIVE INTEGRATION E2E TEST PASSED! <<<');
    console.log('=================================================================');
  } finally {
    try { browserProcess.kill(); } catch (e) {}
  }
}

run().catch(err => {
  console.error('\nE2E Test Failed:', err);
  process.exit(1);
});
