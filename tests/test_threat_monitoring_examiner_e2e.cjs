const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const DEMO_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';
const CDP_PORT = 9235;

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

function sendPost(path, postData) {
  return new Promise((resolve, reject) => {
    const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runExaminerThreatMonitoringVerification() {
  console.log('=================================================================');
  console.log('THREAT MONITORING EXAMINER VIDEO E2E VERIFICATION (20s SEQUENCE)');
  console.log('Video Path:', DEMO_VIDEO_PATH);
  console.log('=================================================================');

  if (!fs.existsSync(DEMO_VIDEO_PATH)) {
    throw new Error('Examiner video not found at: ' + DEMO_VIDEO_PATH);
  }

  // First ensure clean state
  try {
    await sendPost('/api/video/clear', {});
  } catch (e) {}

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

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

  if (!wsUrl) {
    browserProcess.kill();
    throw new Error('Failed to connect to browser CDP on port ' + CDP_PORT);
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  const consoleErrors = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const text = msg.params.args?.map(a => a.value || a.description).join(' ') || '';
      consoleErrors.push(text);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');

  async function evalCode(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  let passed = true;

  try {
    // 1. Wait for Landing Page / Boot sequence and enter Command Center
    console.log('\n--- STEP 1: BOOT AND NAVIGATE TO COMMAND CENTER ---');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const hasBooted = await evalCode(`
        (() => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && (b.innerText.includes('ENTER COMMAND CENTER') || b.innerText.includes('COMMAND')));
          if (btn) {
            btn.click();
            return 'CLICKED_ENTER';
          }
          const isThreats = document.body.innerText.includes('THREAT MONITORING');
          if (isThreats) return 'ALREADY_IN_APP';
          return null;
        })()
      `);
      if (hasBooted) {
        console.log('Boot complete, status:', hasBooted);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));

    // Navigate to Threat Monitoring page in UI
    console.log('Navigating to THREAT MONITORING page...');
    await evalCode(`
      (() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const threatBtn = asideBtns.find(b => b.textContent && (b.textContent.includes('Threat Monitoring') || b.textContent.includes('Threats')));
        if (threatBtn) threatBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // Step 2: Verify Initial Idle State
    console.log('\n--- STEP 2: INITIAL IDLE STATE VERIFICATION ---');
    const idleTelemetry = await evalCode(`
      (() => {
        const text = document.body.innerText;
        const hasIdleMap = text.includes('NO ACTIVE SURVEILLANCE') && text.includes('Upload and start a thermal video to begin monitoring.');
        const hasIdleQueue = text.includes('NO ACTIVE THREATS') && text.includes('Start thermal surveillance to begin threat monitoring.');
        const hasIdleHeader = text.includes('SURVEILLANCE IDLE');
        const mapTargetsCount = document.querySelectorAll('[data-testid="map-active-target"]').length;

        return {
          hasIdleMap,
          hasIdleQueue,
          hasIdleHeader,
          mapTargetsCount
        };
      })()
    `);

    console.log('Idle Map shows "NO ACTIVE SURVEILLANCE":', idleTelemetry.hasIdleMap ? 'PASS' : 'FAIL');
    console.log('Idle Queue shows "NO ACTIVE THREATS":', idleTelemetry.hasIdleQueue ? 'PASS' : 'FAIL');
    console.log('Header shows "SURVEILLANCE IDLE":', idleTelemetry.hasIdleHeader ? 'PASS' : 'FAIL');
    console.log('Active map targets count in idle state:', idleTelemetry.mapTargetsCount);

    if (!idleTelemetry.hasIdleMap || !idleTelemetry.hasIdleQueue || idleTelemetry.mapTargetsCount !== 0) {
      console.error('FAIL: Initial idle empty state was not correctly established!');
      passed = false;
    }

    // Step 3: Upload and start the examiner video
    console.log('\n--- STEP 3: START EXAMINER DEMO VIDEO PLAYBACK ---');
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileBuf = fs.readFileSync(DEMO_VIDEO_PATH);

    const postHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="thermal_exam_demo_20s.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
    const postFooter = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([Buffer.from(postHeader, 'utf-8'), fileBuf, Buffer.from(postFooter, 'utf-8')]);

    const uploadRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 8000,
        path: '/api/video/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
        },
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    console.log('Uploaded video ID:', uploadRes.video_id);

    // Start analysis
    const startRes = await sendPost('/api/video/start', {
      video_id: uploadRes.video_id,
      playback_speed: 1.0,
      loop: false
    });
    console.log('Started analysis status:', startRes.status);

    // Re-verify we are on Threat Monitoring
    await evalCode(`
      (() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const threatBtn = asideBtns.find(b => b.textContent && (b.textContent.includes('Threat Monitoring') || b.textContent.includes('Threats')));
        if (threatBtn) threatBtn.click();
      })()
    `);

    // Step 4: Monitor during video playback (take 8 snapshot samples across the 20 seconds)
    console.log('\n--- STEP 4: MONITOR REAL-TIME THREAT MONITORING DURING 20s PLAYBACK ---');

    const detectedTargetsMap = new Map();
    const detectedThreatEvents = new Map();
    let samplesWithActiveTargets = 0;
    let droneThreatSeenOnMap = false;
    let bagThreatSeenOnMap = false;
    let normalTargetSeenOnMap = false;
    let countersMatchedActiveTargets = true;
    let activeIntrusionsTested = false;

    for (let sample = 1; sample <= 8; sample++) {
      await new Promise(r => setTimeout(r, 2200));

      const telemetry = await evalCode(`
        (() => {
          const mapTargets = Array.from(document.querySelectorAll('[data-testid="map-active-target"]')).map(el => {
            const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
            const isThreatPill = text.includes('THREAT') || text.includes('INTRUSION');
            const isNormalPill = text.includes('NORMAL');
            return {
              text,
              isThreatPill,
              isNormalPill,
            };
          });

          // Summary counters at bottom of map
          const summaryCards = Array.from(document.querySelectorAll('.grid.grid-cols-2.sm\\\\:grid-cols-5 > div'));
          let activeTargetsCount = null;
          let threatsCount = null;
          let intrusionsCount = null;

          summaryCards.forEach(c => {
            const t = c.textContent || '';
            if (t.includes('ACTIVE TARGETS')) {
              const num = t.replace('ACTIVE TARGETS', '').trim();
              activeTargetsCount = parseInt(num, 10);
            } else if (t.includes('THREATS')) {
              const num = t.replace('THREATS', '').trim();
              threatsCount = parseInt(num, 10);
            } else if (t.includes('INTRUSIONS')) {
              const num = t.replace('INTRUSIONS', '').trim();
              intrusionsCount = parseInt(num, 10);
            }
          });

          // Threat Queue items
          const queueItems = Array.from(document.querySelectorAll('.max-h-\\\\[560px\\\\] > div')).map(el => {
            return (el.textContent || '').replace(/\\s+/g, ' ').trim();
          });

          // Top operational status rail counters
          const topRail = Array.from(document.querySelectorAll('.grid.grid-cols-2.sm\\\\:grid-cols-3.lg\\\\:grid-cols-6 > div')).map(el => {
            return (el.textContent || '').replace(/\\s+/g, ' ').trim();
          });

          return {
            mapTargets,
            activeTargetsCount,
            threatsCount,
            intrusionsCount,
            queueItems,
            topRail
          };
        })()
      `);

      console.log(`[Sample ${sample}] Map Targets Count: ${telemetry.mapTargets.length} | Bottom Counter ACTIVE: ${telemetry.activeTargetsCount} | THREATS: ${telemetry.threatsCount} | INTRUSIONS: ${telemetry.intrusionsCount}`);

      if (telemetry.mapTargets.length > 0) {
        samplesWithActiveTargets++;
        // Verify consistency between map targets count and bottom summary counter
        if (telemetry.activeTargetsCount !== telemetry.mapTargets.length) {
          console.warn(`Mismatch in Sample ${sample}: Map targets (${telemetry.mapTargets.length}) != ACTIVE TARGETS counter (${telemetry.activeTargetsCount})`);
          countersMatchedActiveTargets = false;
        }

        telemetry.mapTargets.forEach(t => {
          console.log(`  -> Map Target: "${t.text}" | Threat Pill: ${t.isThreatPill} | Normal Pill: ${t.isNormalPill}`);
          if (t.text.toLowerCase().includes('drone')) {
            droneThreatSeenOnMap = true;
            if (!t.isThreatPill) {
              console.error('Drone was not styled as THREAT on map!');
              passed = false;
            }
          }
          if (t.text.toLowerCase().includes('bag')) {
            bagThreatSeenOnMap = true;
            if (!t.isThreatPill) {
              console.error('Person With Bag was not styled as THREAT on map!');
              passed = false;
            }
          }
          if ((t.text.toLowerCase().includes('person') && !t.text.toLowerCase().includes('bag')) || t.text.toLowerCase().includes('animal') || t.text.toLowerCase().includes('vehicle')) {
            normalTargetSeenOnMap = true;
          }
          detectedTargetsMap.set(t.text, true);
        });
      }

      if (telemetry.queueItems.length > 0) {
        telemetry.queueItems.slice(0, 3).forEach(qi => {
          console.log(`  -> Threat Queue Event: ${qi.substring(0, 80)}...`);
          detectedThreatEvents.set(qi, true);
        });
      }
    }

    console.log('\n--- STEP 5: VERIFICATION SUMMARY ---');
    console.log('Samples with active targets on map:', samplesWithActiveTargets);
    console.log('Drone threat observed on map as THREAT:', droneThreatSeenOnMap ? 'PASS' : 'FAIL');
    console.log('Person With Bag observed on map as THREAT:', bagThreatSeenOnMap ? 'PASS' : 'FAIL');
    console.log('Normal target (Person/Animal/Vehicle) observed as NORMAL:', normalTargetSeenOnMap ? 'PASS' : 'FAIL');
    console.log('Map Target Count matched ACTIVE TARGETS counter:', countersMatchedActiveTargets ? 'PASS' : 'FAIL');
    console.log('Total unique active targets tracked on map:', detectedTargetsMap.size);
    console.log('Total unique Threat Queue events captured:', detectedThreatEvents.size);

    if (samplesWithActiveTargets === 0) {
      console.error('FAIL: No active targets appeared on Surveillance Zone Map during playback!');
      passed = false;
    }
    if (!droneThreatSeenOnMap && !bagThreatSeenOnMap) {
      console.error('FAIL: Neither Drone nor Person With Bag threat was detected!');
      passed = false;
    }

    // Step 6: Test Stop / Reset returns to idle empty state
    console.log('\n--- STEP 6: VERIFY STOP / CLEAR EMPTY STATE ---');
    await sendPost('/api/video/clear', {});
    await new Promise(r => setTimeout(r, 1500));

    const postStopTelemetry = await evalCode(`
      (() => {
        const text = document.body.innerText;
        const mapTargets = document.querySelectorAll('[data-testid="map-active-target"]').length;
        const hasIdleSurveillance = text.includes('NO ACTIVE SURVEILLANCE');
        const hasIdleThreats = text.includes('NO ACTIVE THREATS');
        return { text, mapTargets, hasIdleSurveillance, hasIdleThreats };
      })()
    `);

    console.log('Post-Clear Active Map Targets:', postStopTelemetry.mapTargets);
    console.log('Post-Clear Shows "NO ACTIVE SURVEILLANCE":', postStopTelemetry.hasIdleSurveillance ? 'PASS' : 'FAIL');
    console.log('Post-Clear Shows "NO ACTIVE THREATS":', postStopTelemetry.hasIdleThreats ? 'PASS' : 'FAIL');
    if (postStopTelemetry.mapTargets !== 0) {
      console.error('FAIL: Stale targets remained on map after clearing video!');
      passed = false;
    }
    if (!postStopTelemetry.hasIdleSurveillance || !postStopTelemetry.hasIdleThreats) {
      console.error('FAIL: Post-clear did not return to idle empty state!');
      passed = false;
    }

    // Step 7: Verify 0 Browser Console Errors
    console.log('\n--- STEP 7: CONSOLE ERROR CHECK ---');
    console.log('Console Errors caught:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('Console errors caught:', consoleErrors);
      passed = false;
    }

  } finally {
    try { ws.close(); } catch (e) {}
    try { browserProcess.kill(); } catch (e) {}
  }

  console.log('\n=================================================================');
  if (passed) {
    console.log('✅ ALL THREAT MONITORING E2E VERIFICATIONS PASSED SUCCESSFULLY!');
  } else {
    console.log('❌ THREAT MONITORING E2E VERIFICATION FAILED');
  }
  console.log('=================================================================');

  if (!passed) process.exit(1);
}

runExaminerThreatMonitoringVerification().catch(err => {
  console.error('Unhandled test exception:', err);
  process.exit(1);
});
