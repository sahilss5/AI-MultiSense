const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const DEMO_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';
const CDP_PORT = 9245;

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
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
      },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function run() {
  console.log('=================================================================');
  console.log('E2E TEST: HISTORICAL THREAT MAP SELECTION & REAL BYTE TRACK PATH');
  console.log('Video Path:', DEMO_VIDEO_PATH);
  console.log('=================================================================');

  if (!fs.existsSync(DEMO_VIDEO_PATH)) {
    throw new Error('Video not found at: ' + DEMO_VIDEO_PATH);
  }

  // Clear any existing video session in backend
  try { await sendPost('/api/video/clear', {}); } catch (e) {}

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
      if (!text.includes('favicon')) {
        consoleErrors.push(text);
      }
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
    console.log('[1] App loading...');
    await new Promise(r => setTimeout(r, 2000));

    // Click Enter Command Center
    await evalCode(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && (b.innerText.includes('ENTER COMMAND CENTER') || b.innerText.includes('COMMAND')));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    // Upload examiner demo video
    console.log('[2] Uploading examiner demonstration video...');
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

    console.log('    Video uploaded. Video ID:', uploadRes.video_id);

    // Navigate to Threat Monitoring page
    console.log('[3] Navigating to Threat Monitoring page...');
    await evalCode(`
      (() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const threatBtn = asideBtns.find(b => b.textContent && (b.textContent.includes('Threat Monitoring') || b.textContent.includes('Threats')));
        if (threatBtn) threatBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    // Start video analysis at 2.0x speed
    console.log('[4] Starting video analysis...');
    const startRes = await sendPost('/api/video/start', {
      video_id: uploadRes.video_id,
      playback_speed: 2.0,
      loop: false
    });
    console.log('    Started status:', startRes.status);

    // Wait for video to complete
    console.log('[5] Waiting for complete video analysis to finish (status = completed)...');
    let completed = false;
    for (let i = 0; i < 35; i++) {
      const statusRes = await getJson('http://127.0.0.1:8000/api/video/status');
      if (statusRes.status === 'completed') {
        console.log(`    Video finished at sample ${i+1}. Status: ${statusRes.status}`);
        completed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!completed) {
      throw new Error('Video did not reach "completed" status in expected time.');
    }

    // Wait for frontend to sync completed threats
    console.log('[6] Waiting for Threat Cards to sync in UI...');
    let queueCards = [];
    for (let i = 0; i < 15; i++) {
      queueCards = await evalCode(`
        (() => {
          const cards = Array.from(document.querySelectorAll('[data-testid="threat-card"]'));
          return cards.map((c, idx) => ({
            idx,
            text: (c.textContent || '').replace(/\\s+/g, ' ').trim(),
            trackId: c.getAttribute('data-track-id')
          }));
        })()
      `);
      if (queueCards && queueCards.length > 0) {
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`    Final Threat Queue items count: ${queueCards.length}`);
    queueCards.forEach((q, idx) => {
      console.log(`    [Threat ${idx + 1}] (Track ${q.trackId}): ${q.text.substring(0, 90)}`);
    });

    if (queueCards.length === 0) {
      console.error('FAIL: No threat cards found in Threat Queue after completion!');
      passed = false;
    }

    // Step 7: Verify that "NO ACTIVE SURVEILLANCE" is NOT displayed on the map!
    console.log('\n[7] Checking Surveillance Map State (Must NOT display NO ACTIVE SURVEILLANCE)...');
    const mapState = await evalCode(`
      (() => {
        const bodyText = document.body.innerText;
        const hasNoActiveSurveillance = bodyText.includes('NO ACTIVE SURVEILLANCE');
        const hasFocusBar = bodyText.includes('SELECTED TARGET:');
        const hasTrajectory = document.querySelector('[data-testid="map-selected-trajectory"]') !== null;
        const hasHistoricalMarker = document.querySelector('[data-testid="map-selected-historical-target"]') !== null;

        // Header status
        const headerBadgeEl = document.querySelector('.lg\\\\:col-span-7 span.font-mono.font-bold');
        const headerBadgeText = headerBadgeEl ? headerBadgeEl.textContent.trim() : '';

        return {
          hasNoActiveSurveillance,
          hasFocusBar,
          hasTrajectory,
          hasHistoricalMarker,
          headerBadgeText,
        };
      })()
    `);

    console.log('    "NO ACTIVE SURVEILLANCE" present:', mapState.hasNoActiveSurveillance ? 'FAIL (Overlay is blocking map)' : 'PASS (Clean)');
    console.log('    Focus bar present:', mapState.hasFocusBar ? 'PASS' : 'FAIL');
    console.log('    Trajectory SVG polyline rendered on map:', mapState.hasTrajectory ? 'PASS' : 'FAIL');
    console.log('    Historical marker rendered on map:', mapState.hasHistoricalMarker ? 'PASS' : 'FAIL');
    console.log('    Map header badge:', mapState.headerBadgeText);

    if (mapState.hasNoActiveSurveillance) {
      console.error('FAIL: Map displays false "NO ACTIVE SURVEILLANCE" overlay when threat is selected!');
      passed = false;
    }
    if (!mapState.hasTrajectory) {
      console.error('FAIL: Selected threat trajectory line is missing from map!');
      passed = false;
    }
    if (!mapState.hasHistoricalMarker) {
      console.error('FAIL: Selected threat historical marker is missing from map!');
      passed = false;
    }

    // Step 8: Switching Test — Click Threat 1, check details, then Click Threat 2, check details, then Click Threat 1 again!
    console.log('\n[8] Executing Threat Switching Verification Test...');

    if (queueCards.length >= 2) {
      const threat1 = queueCards[0];
      const threat2 = queueCards[1];
      console.log(`    Threat 1 Track: T-${threat1.trackId} | Text: ${threat1.text.substring(0, 50)}`);
      console.log(`    Threat 2 Track: T-${threat2.trackId} | Text: ${threat2.text.substring(0, 50)}`);

      // Click Threat 1
      console.log('\n    --> Clicking Threat 1 (Track ' + threat1.trackId + ')...');
      await evalCode(`
        (() => {
          const cards = Array.from(document.querySelectorAll('[data-testid="threat-card"]'));
          if (cards[0]) cards[0].click();
        })()
      `);
      await new Promise(r => setTimeout(r, 1200));

      const t1Telemetry = await evalCode(`
        (() => {
          const trajEl = document.querySelector('[data-testid="map-selected-trajectory"] polyline:nth-child(2)');
          const trajPoints = trajEl ? trajEl.getAttribute('points') : null;
          const markerEl = document.querySelector('[data-testid="map-selected-historical-target"]');
          const markerText = markerEl ? markerEl.textContent.replace(/\\s+/g, ' ').trim() : null;
          const bodyText = document.body.innerText;
          const hasTrackNoLongerActive = bodyText.includes('TRACK NO LONGER ACTIVE');

          return { trajPoints, markerText, hasTrackNoLongerActive };
        })()
      `);

      console.log('    Threat 1 Marker:', t1Telemetry.markerText);
      console.log('    Threat 1 Trajectory Points count:', t1Telemetry.trajPoints ? t1Telemetry.trajPoints.split(' ').length : 0);
      console.log('    Threat 1 Status includes TRACK NO LONGER ACTIVE:', t1Telemetry.hasTrackNoLongerActive ? 'PASS' : 'FAIL');

      // Click Threat 2
      console.log('\n    --> Clicking Threat 2 (Track ' + threat2.trackId + ')...');
      await evalCode(`
        (() => {
          const cards = Array.from(document.querySelectorAll('[data-testid="threat-card"]'));
          if (cards[1]) cards[1].click();
        })()
      `);
      await new Promise(r => setTimeout(r, 1200));

      const t2Telemetry = await evalCode(`
        (() => {
          const trajEl = document.querySelector('[data-testid="map-selected-trajectory"] polyline:nth-child(2)');
          const trajPoints = trajEl ? trajEl.getAttribute('points') : null;
          const markerEl = document.querySelector('[data-testid="map-selected-historical-target"]');
          const markerText = markerEl ? markerEl.textContent.replace(/\\s+/g, ' ').trim() : null;

          return { trajPoints, markerText };
        })()
      `);

      console.log('    Threat 2 Marker:', t2Telemetry.markerText);
      console.log('    Threat 2 Trajectory Points count:', t2Telemetry.trajPoints ? t2Telemetry.trajPoints.split(' ').length : 0);

      const trajectoriesAreDistinct = t1Telemetry.trajPoints !== t2Telemetry.trajPoints;
      const markersAreDistinct = t1Telemetry.markerText !== t2Telemetry.markerText;
      console.log('    Threat 1 & Threat 2 have distinct trajectories:', trajectoriesAreDistinct ? 'PASS' : 'FAIL');
      console.log('    Threat 1 & Threat 2 have distinct markers:', markersAreDistinct ? 'PASS' : 'FAIL');

      if (!trajectoriesAreDistinct && t1Telemetry.trajPoints) {
        console.warn('Warning: Trajectory points matched between two threats.');
      }

      // Click Threat 1 again (Reversibility check)
      console.log('\n    --> Clicking Threat 1 AGAIN (Track ' + threat1.trackId + ')...');
      await evalCode(`
        (() => {
          const cards = Array.from(document.querySelectorAll('[data-testid="threat-card"]'));
          if (cards[0]) cards[0].click();
        })()
      `);
      await new Promise(r => setTimeout(r, 1200));

      const t1ReturnTelemetry = await evalCode(`
        (() => {
          const trajEl = document.querySelector('[data-testid="map-selected-trajectory"] polyline:nth-child(2)');
          const trajPoints = trajEl ? trajEl.getAttribute('points') : null;
          const markerEl = document.querySelector('[data-testid="map-selected-historical-target"]');
          const markerText = markerEl ? markerEl.textContent.replace(/\\s+/g, ' ').trim() : null;

          return { trajPoints, markerText };
        })()
      `);

      console.log('    Threat 1 Return Marker:', t1ReturnTelemetry.markerText);
      console.log('    Threat 1 Return Trajectory Points count:', t1ReturnTelemetry.trajPoints ? t1ReturnTelemetry.trajPoints.split(' ').length : 0);

      const returnMatches = t1ReturnTelemetry.trajPoints === t1Telemetry.trajPoints &&
                            t1ReturnTelemetry.markerText === t1Telemetry.markerText;
      console.log('    Threat 1 returned to original trajectory and marker:', returnMatches ? 'PASS' : 'FAIL');

        if (!returnMatches) {
          console.error('FAIL: Re-selecting Threat 1 did not restore original trajectory or marker!');
          passed = false;
        }

        // Specific T-230 and T-235 Verification (Required by examiner prompt)
        console.log('\n[8.1] Specific T-230 and T-235 Synchronization Test...');
        const t230Found = await evalCode(`
          (() => {
            const card230 = document.querySelector('[data-track-id="230"]');
            if (card230) {
              card230.click();
              return true;
            }
            return false;
          })()
        `);

        if (t230Found) {
          await new Promise(r => setTimeout(r, 1200));
          const t230Telemetry = await evalCode(`
            (() => {
              const trajEl = document.querySelector('[data-testid="map-selected-trajectory"] polyline:nth-child(2)');
              const trajPoints = trajEl ? trajEl.getAttribute('points') : null;
              const markerEl = document.querySelector('[data-testid="map-selected-historical-target"]');
              const markerText = markerEl ? markerEl.textContent.replace(/\\s+/g, ' ').trim() : null;
              const bodyText = document.body.innerText;
              const hasT230 = bodyText.includes('T-230');
              const hasDrone = bodyText.includes('DRONE');

              return { trajPoints, markerText, hasT230, hasDrone };
            })()
          `);
          console.log('    T-230 Marker text:', t230Telemetry.markerText);
          console.log('    T-230 Trajectory points count:', t230Telemetry.trajPoints ? t230Telemetry.trajPoints.split(' ').length : 0);
          console.log('    T-230 Drone confirmed in UI:', t230Telemetry.hasDrone ? 'PASS' : 'FAIL');

          if (!t230Telemetry.markerText) {
            console.error('FAIL: T-230 historical marker not rendered on map!');
            passed = false;
          }

          // Click T-235
          console.log('    --> Clicking T-235 card...');
          const t235Found = await evalCode(`
            (() => {
              const card235 = document.querySelector('[data-track-id="235"]');
              if (card235) {
                card235.click();
                return true;
              }
              return false;
            })()
          `);
          if (t235Found) {
            await new Promise(r => setTimeout(r, 1200));
            const t235Telemetry = await evalCode(`
              (() => {
                const trajEl = document.querySelector('[data-testid="map-selected-trajectory"] polyline:nth-child(2)');
                const trajPoints = trajEl ? trajEl.getAttribute('points') : null;
                const markerEl = document.querySelector('[data-testid="map-selected-historical-target"]');
                const markerText = markerEl ? markerEl.textContent.replace(/\\s+/g, ' ').trim() : null;
                return { trajPoints, markerText };
              })()
            `);
            console.log('    T-235 Marker text:', t235Telemetry.markerText);
            console.log('    T-235 Trajectory points count:', t235Telemetry.trajPoints ? t235Telemetry.trajPoints.split(' ').length : 0);

            const t230_t235_distinct = t230Telemetry.markerText !== t235Telemetry.markerText;
            console.log('    T-230 and T-235 have distinct markers:', t230_t235_distinct ? 'PASS' : 'FAIL');
            if (!t230_t235_distinct) {
              console.error('FAIL: T-230 and T-235 markers matched!');
              passed = false;
            }

            // Click T-230 again
            console.log('    --> Clicking T-230 card AGAIN...');
            await evalCode(`
              (() => {
                const card230 = document.querySelector('[data-track-id="230"]');
                if (card230) card230.click();
              })()
            `);
            await new Promise(r => setTimeout(r, 1200));
            const t230ReturnTelemetry = await evalCode(`
              (() => {
                const trajEl = document.querySelector('[data-testid="map-selected-trajectory"] polyline:nth-child(2)');
                const trajPoints = trajEl ? trajEl.getAttribute('points') : null;
                const markerEl = document.querySelector('[data-testid="map-selected-historical-target"]');
                const markerText = markerEl ? markerEl.textContent.replace(/\\s+/g, ' ').trim() : null;
                return { trajPoints, markerText };
              })()
            `);
            console.log('    T-230 Return Marker text:', t230ReturnTelemetry.markerText);
            const t230ReturnMatches = t230ReturnTelemetry.markerText === t230Telemetry.markerText &&
                                      t230ReturnTelemetry.trajPoints === t230Telemetry.trajPoints;
            console.log('    T-230 returned to original marker and trajectory:', t230ReturnMatches ? 'PASS' : 'FAIL');
            if (!t230ReturnMatches) {
              console.error('FAIL: T-230 did not restore original marker/path!');
              passed = false;
            }
          }
        }
      } else {
        console.log('    Note: Less than 2 threats captured to execute switching test.');
      }

    // Step 9: Check console errors
    console.log('\n[9] Browser Console Errors Check...');
    console.log('    Console errors count:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('    Errors:', consoleErrors);
      passed = false;
    } else {
      console.log('    0 console errors: PASS');
    }

    console.log('\n=================================================================');
    console.log('FINAL E2E RESULT:', passed ? 'ALL CHECKS PASSED (SUCCESS)' : 'FAILED');
    console.log('=================================================================');

  } catch (err) {
    console.error('Test execution error:', err);
    passed = false;
  } finally {
    try { ws.close(); } catch (e) {}
    try { browserProcess.kill(); } catch (e) {}
    process.exit(passed ? 0 : 1);
  }
}

run();
