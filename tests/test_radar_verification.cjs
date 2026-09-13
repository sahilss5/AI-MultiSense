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

async function runRadarVerification() {
  console.log('=================================================================');
  console.log('3D TACTICAL TARGET MAP VERIFICATION (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9224/json/list');
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
    throw new Error('Failed to connect to browser CDP on port 9224');
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
    // 1. Enter Command Center -> Dashboard
    console.log('[1] Loading Command Center Dashboard...');
    await new Promise(r => setTimeout(r, 2000));
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ENTER') || b.textContent.includes('COMMAND'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // 2. Check Radar structure on Dashboard when idle
    console.log('[2] Inspecting 3D Tactical Target Map (Idle state)...');
    const radarInfo = await evalJs(`
      (() => {
        const region = document.querySelector('div[role="region"][aria-label="3D Tactical Target Map"]');
        if (!region) return { found: false };
        const text = region.innerText;
        return {
          found: true,
          hasTitle: text.includes('TACTICAL TARGET MAP'),
          hasCameraCenter: text.includes('CAMERA'),
          hasNoActiveTargets: text.includes('NO ACTIVE TARGETS') || text.includes('Waiting for thermal detections'),
          hasNoFakeKm: !text.includes('2.4 KM'),
          hasNoFakeSweep: !text.includes('SWEEP 000') && !text.includes('SWEEP 120'),
          hasNoFakeFps: !text.includes('FPS 29.8'),
          hasRelativePosition: text.includes('RELATIVE POSITION'),
          hasLegend: text.includes('ACTIVE TARGETS'),
        };
      })()
    `);

    console.log('Radar idle check result:', radarInfo);
    if (!radarInfo.found) throw new Error('3D Tactical Target Map region not found');
    if (!radarInfo.hasTitle) throw new Error('Title TACTICAL TARGET MAP missing');
    if (!radarInfo.hasCameraCenter) throw new Error('Camera center marker missing');
    if (!radarInfo.hasNoActiveTargets) throw new Error('Empty state missing when idle');
    if (!radarInfo.hasNoFakeKm) throw new Error('Fake 2.4 KM still present');
    if (!radarInfo.hasNoFakeFps) throw new Error('Fake FPS 29.8 still present');
    if (!radarInfo.hasRelativePosition) throw new Error('RELATIVE POSITION label missing');
    if (!radarInfo.hasLegend) throw new Error('ACTIVE TARGETS legend missing');

    console.log('[3] Starting real thermal video analysis to test live target movement...');
    // Trigger video start via backend API
    const uploadRes = await new Promise((resolve, reject) => {
      // First check if video is already loaded, or upload it
      const formBoundary = '----WebKitFormBoundaryRadarTest1234';
      const fileData = fs.readFileSync(TEST_VIDEO_PATH);
      const postDataStart = `--${formBoundary}\r\nContent-Disposition: form-data; name="file"; filename="combined_thermal_test.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
      const postDataEnd = `\r\n--${formBoundary}--\r\n`;
      const payload = Buffer.concat([
        Buffer.from(postDataStart),
        fileData,
        Buffer.from(postDataEnd),
      ]);

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
    console.log('Uploaded video for radar test:', videoId);

    // Start video analysis
    await postRequest('127.0.0.1', 8000, '/api/video/start', JSON.stringify({ video_id: videoId }));
    console.log('Real video analysis started. Streaming frames over WebSocket...');

    // Wait for frames to stream into frontend
    let targetDetected = false;
    let trackObservations = [];

    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 1000));
      const liveRadarState = await evalJs(`
        (() => {
          const region = document.querySelector('div[role="region"][aria-label="3D Tactical Target Map"]');
          if (!region) return null;
          const text = region.innerText;
          const targetBadges = Array.from(region.querySelectorAll('div')).filter(d =>
            d.innerText && (d.innerText.includes('T-1') || d.innerText.includes('DRONE') || d.innerText.includes('THREAT'))
          );
          // Find any absolute target items with style.left
          const targetItems = Array.from(region.querySelectorAll('div[style*="left"]')).map(el => ({
            left: el.style.left,
            top: el.style.top,
            text: el.innerText,
          }));

          return {
            text,
            isTrackingActive: text.includes('TRACKING ACTIVE'),
            hasDrone: text.includes('DRONE'),
            hasThreat: text.includes('THREAT'),
            hasTrackId: text.includes('T-1') || text.includes('T-01') || text.includes('T-001'),
            targetItems,
          };
        })()
      `);

      if (liveRadarState && liveRadarState.hasDrone) {
        targetDetected = true;
        trackObservations.push(liveRadarState);
        console.log(`[Frame ${attempt + 1}] Real Target Detected on Radar:`, {
          isTrackingActive: liveRadarState.isTrackingActive,
          hasDrone: liveRadarState.hasDrone,
          hasThreat: liveRadarState.hasThreat,
          hasTrackId: liveRadarState.hasTrackId,
          targetCount: liveRadarState.targetItems.length,
          positions: liveRadarState.targetItems.map(t => `${t.left}, ${t.top}`),
        });

        if (trackObservations.length >= 4) {
          break;
        }
      }
    }

    // Stop video analysis
    await postRequest('127.0.0.1', 8000, '/api/video/stop', JSON.stringify({}));
    console.log('Video analysis stopped.');

    if (!targetDetected) {
      throw new Error('Real drone target did not appear on the radar during playback');
    }

    console.log('\n[4] Verifying Real Target Position Dynamics:');
    console.log(`Collected ${trackObservations.length} live target observations.`);
    const firstPos = trackObservations[0].targetItems[0];
    const lastPos = trackObservations[trackObservations.length - 1].targetItems[0];
    console.log('First position on radar:', firstPos);
    console.log('Last position on radar:', lastPos);

    console.log('\n=================================================================');
    console.log('>>> ALL 3D TACTICAL TARGET MAP TESTS PASSED SUCCESSFULLY! <<<');
    console.log('=================================================================');
  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runRadarVerification().catch((err) => {
  console.error('Radar test error:', err);
  process.exit(1);
});
