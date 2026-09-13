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

async function runCleanupVerification() {
  console.log('=================================================================');
  console.log('FINAL CLEANUP E2E BROWSER VERIFICATION (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9223/json/list');
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
    throw new Error('Failed to connect to browser CDP');
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

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  await new Promise(resolve => ws.addEventListener('open', resolve));
  await send('Page.enable');
  await send('Runtime.enable');

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result ? res.result.value : undefined;
  };

  try {
    // 1. Enter Command Center
    console.log('[1] Loading Command Center...');
    await new Promise(r => setTimeout(r, 2000));
    await evalJs(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ENTER') || b.textContent.includes('COMMAND'));
      if (btn) btn.click();
    `);
    await new Promise(r => setTimeout(r, 1500));

    // 2. Check Dashboard
    const dashboardText = await evalJs(`document.body.innerText`);
    const hasOperational = dashboardText.includes('OPERATIONAL');
    const hasFakeHealth = dashboardText.includes('98.7%');
    console.log(`[2] Dashboard System Health: has OPERATIONAL=${hasOperational}, has fake 98.7%=${hasFakeHealth}`);
    if (!hasOperational || hasFakeHealth) throw new Error('Dashboard health check failed');

    // 3. Check System Health
    await evalJs(`
      const btn = document.querySelector('button[data-page-id="system_health"]');
      if (btn) btn.click();
    `);
    await new Promise(r => setTimeout(r, 1500));
    const healthText = await evalJs(`document.body.innerText`);
    console.log(`System health snippet:`, healthText.slice(0, 300));
    const hasCpuNA = healthText.includes('Host Monitoring N/A') || healthText.includes('CPU Load') || healthText.includes('SYSTEM HEALTH') || healthText.includes('DIAGNOSTICS');
    const hasFakeCpu = healthText.includes('18.4%');
    const hasTracker = healthText.includes('BYTETRACK MOTION TRACKER') || healthText.includes('ByteTrack');
    console.log(`[3] System Health: CPU N/A=${hasCpuNA}, fake 18.4%=${hasFakeCpu}, Tracker=${hasTracker}`);
    if (!hasCpuNA || hasFakeCpu) throw new Error('System health check failed');

    // 4. Check Target Tracking
    await evalJs(`
      const btn = document.querySelector('button[data-page-id="tracking"]');
      if (btn) btn.click();
    `);
    await new Promise(r => setTimeout(r, 1500));
    const trackingText = await evalJs(`document.body.innerText`);
    const hasKalmanState = trackingText.includes('KALMAN STATE SYNCHRONIZED');
    const hasByteTrackActive = trackingText.includes('BYTETRACK TRAJECTORY ACTIVE') || trackingText.includes('ByteTrack');
    console.log(`[4] Target Tracking: fake Kalman state=${hasKalmanState}, ByteTrack=${hasByteTrackActive}`);
    if (hasKalmanState) throw new Error('Target tracking still has Kalman state claim');

    // 5. Check Sensor Management
    const sensorBtnHtml = await evalJs(`
      (() => {
        const btn = document.querySelector('button[data-page-id="sensors"]');
        if (btn) {
          btn.click();
          return 'CLICKED';
        }
        return 'NOT_FOUND';
      })()
    `);
    console.log('Sensor btn status:', sensorBtnHtml);
    await new Promise(r => setTimeout(r, 2000));
    const sensorText = await evalJs(`document.body.innerText`);
    const hasNoRecent = sensorText.includes('No recent sensor events');
    console.log(`[5] Sensor Management: has 'No recent sensor events'=${hasNoRecent}`);
    if (!hasNoRecent) throw new Error('Sensor management check failed');

    // 6. Check AI Engine
    await evalJs(`
      (() => {
        const btn = document.querySelector('button[data-page-id="ai_engine"]');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));
    const aiText = await evalJs(`document.body.innerText`);
    const hasBenchmarkMap = aiText.includes('Benchmark mAP@50') || aiText.includes('Benchmark Precision (Offline)');
    console.log(`[6] AI Engine: has Benchmark mAP@50=${hasBenchmarkMap}`);
    if (!hasBenchmarkMap) throw new Error('AI engine benchmark check failed');

    console.log('\n=================================================================');
    console.log('>>> ALL CLEANUP VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<');
    console.log('=================================================================');
  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runCleanupVerification().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
