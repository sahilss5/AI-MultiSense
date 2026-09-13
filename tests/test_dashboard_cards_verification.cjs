const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173/';
const TEST_VIDEO_PATH = 'D:\\2ND TRAINED\\2ND TRAINED IMP\\VIDEO TESTING\\combined_thermal_test.mp4';

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

function postRequest(host, port, pathStr, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host,
      port,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runDashboardCardsVerification() {
  console.log('=================================================================');
  console.log('DASHBOARD THREE CARDS VERIFICATION (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9225/json/list');
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
    throw new Error('Failed to connect to browser CDP on port 9225');
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
    console.log('[1] Navigating to Command Overview Dashboard...');
    await new Promise(r => setTimeout(r, 2000));
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ENTER') || b.textContent.includes('COMMAND'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // 2. Check the three lower cards
    console.log('[2] Inspecting the three Dashboard cards...');
    const cardsCheck = await evalJs(`
      (() => {
        const bodyText = document.body.innerText;

        // Card 1: Recent Activity
        const hasRecentActivity = bodyText.includes('RECENT ACTIVITY');
        const hasAlertHistory = bodyText.includes('ALERT HISTORY');
        const hasFakeAuditBuffer = bodyText.includes('AUDIT BUFFER: 100 EVENTS');

        // Card 2: Active Targets
        const hasActiveTargets = bodyText.includes('ACTIVE TARGETS');
        const hasTrackingBytetrack = bodyText.includes('TRACKING: ByteTrack');
        const hasFakeAlgorithmIoU = bodyText.includes('ALGORITHM: BYTETRACK IoU');

        // Card 3: System Status
        const hasSystemStatus = bodyText.includes('SYSTEM STATUS');
        const hasAllOperational = bodyText.includes('ALL SYSTEMS OPERATIONAL');
        const hasThermalInput = bodyText.includes('THERMAL INPUT');
        const hasAiInference = bodyText.includes('AI INFERENCE') && bodyText.includes('YOLO11n Thermal');
        const hasObjectTracking = bodyText.includes('OBJECT TRACKING') && bodyText.includes('ByteTrack');
        const hasThreatAnalysis = bodyText.includes('THREAT ANALYSIS') && bodyText.includes('Threat Engine');
        const hasBackend = bodyText.includes('BACKEND') && bodyText.includes('API Service');
        const hasFakeTensorRt = bodyText.includes('TENSORRT FP16') || bodyText.includes('TensorRT Online');
        const hasFakeWarnings = bodyText.includes('0 WARNINGS');
        const hasFakeFlirHardware = bodyText.includes('FLIR AX65 LWIR') && !bodyText.includes('Video');

        return {
          hasRecentActivity,
          hasAlertHistory,
          hasFakeAuditBuffer,
          hasActiveTargets,
          hasTrackingBytetrack,
          hasFakeAlgorithmIoU,
          hasSystemStatus,
          hasAllOperational,
          hasThermalInput,
          hasAiInference,
          hasObjectTracking,
          hasThreatAnalysis,
          hasBackend,
          hasFakeTensorRt,
          hasFakeWarnings,
          hasFakeFlirHardware,
        };
      })()
    `);

    console.log('Dashboard cards check:', cardsCheck);

    if (!cardsCheck.hasRecentActivity) throw new Error('RECENT ACTIVITY header missing');
    if (!cardsCheck.hasAlertHistory) throw new Error('ALERT HISTORY footer missing');
    if (cardsCheck.hasFakeAuditBuffer) throw new Error('Fake AUDIT BUFFER still present');

    if (!cardsCheck.hasActiveTargets) throw new Error('ACTIVE TARGETS header missing');
    if (!cardsCheck.hasTrackingBytetrack) throw new Error('TRACKING: ByteTrack footer missing');
    if (cardsCheck.hasFakeAlgorithmIoU) throw new Error('Fake ALGORITHM: BYTETRACK IoU still present');

    if (!cardsCheck.hasSystemStatus) throw new Error('SYSTEM STATUS header missing');
    if (!cardsCheck.hasAllOperational) throw new Error('ALL SYSTEMS OPERATIONAL status missing');
    if (!cardsCheck.hasThermalInput) throw new Error('THERMAL INPUT subsystem missing');
    if (!cardsCheck.hasAiInference) throw new Error('AI INFERENCE subsystem missing');
    if (!cardsCheck.hasObjectTracking) throw new Error('OBJECT TRACKING subsystem missing');
    if (!cardsCheck.hasThreatAnalysis) throw new Error('THREAT ANALYSIS subsystem missing');
    if (!cardsCheck.hasBackend) throw new Error('BACKEND subsystem missing');
    if (cardsCheck.hasFakeTensorRt) throw new Error('Fake TensorRT claim still present');
    if (cardsCheck.hasFakeWarnings) throw new Error('Fake 0 WARNINGS still present');
    if (cardsCheck.hasFakeFlirHardware) throw new Error('Fake FLIR hardware claim still present');

    console.log('\n[3] Testing Live Real Video streaming into Dashboard cards...');
    // Upload & start video to verify cards display real data
    const formBoundary = '----WebKitFormBoundaryDashCardTest123';
    const fileData = fs.readFileSync(TEST_VIDEO_PATH);
    const postDataStart = `--${formBoundary}\r\nContent-Disposition: form-data; name="file"; filename="combined_thermal_test.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
    const postDataEnd = `\r\n--${formBoundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(postDataStart),
      fileData,
      Buffer.from(postDataEnd),
    ]);

    const uploadRes = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: 8000,
        path: '/api/video/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formBoundary}`,
          'Content-Length': payload.length,
        },
      }, (res) => {
        let resp = '';
        res.on('data', c => resp += c);
        res.on('end', () => {
          try { resolve(JSON.parse(resp)); }
          catch (e) { resolve({ video_id: 'vid_default' }); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    const videoId = uploadRes.video_id;
    await postRequest('127.0.0.1', 8000, '/api/video/start', JSON.stringify({ video_id: videoId }));
    console.log('Video started. Waiting for live detections on Dashboard...');

    let verifiedRealTarget = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const liveState = await evalJs(`
        (() => {
          const body = document.body.innerText;
          const hasDroneTarget = body.includes('T-1') && body.includes('DRONE');
          const hasThreatHigh = body.includes('THREAT • HIGH');
          return { hasDroneTarget, hasThreatHigh };
        })()
      `);
      if (liveState && liveState.hasDroneTarget) {
        verifiedRealTarget = true;
        console.log(`[Second ${i + 1}] Real Target verified in Card 2:`, liveState);
        break;
      }
    }

    await postRequest('127.0.0.1', 8000, '/api/video/stop', JSON.stringify({}));
    console.log('Video stopped.');

    if (!verifiedRealTarget) {
      throw new Error('Real drone target did not appear in Active Targets card during playback');
    }

    console.log('\n=================================================================');
    console.log('>>> ALL DASHBOARD CARDS VERIFICATION CHECKS PASSED! <<<');
    console.log('=================================================================');
  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runDashboardCardsVerification().catch((err) => {
  console.error('Dashboard cards verification failed:', err);
  process.exit(1);
});
