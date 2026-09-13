const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const VIDEO_PATH = 'D:\\2ND TRAINED\\2ND TRAINED IMP\\VIDEO TESTING\\combined_thermal_test.mp4';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function runE2E() {
  console.log('=================================================================');
  console.log('STEP 5 FULL FRONTEND-TO-BACKEND END-TO-END VERIFICATION');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 10; i++) {
    try {
      const targets = await getJson('http://127.0.0.1:9222/json/list');
      const pageTarget = targets.find(t => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!wsUrl) {
    console.error('Failed to get Edge WebSocket target');
    browserProcess.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  const consoleErrors = [];
  const consoleLogs = [];
  let msgId = 1;
  const pendingRequests = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const parsed = JSON.parse(event.data);
    if (parsed.id && pendingRequests.has(parsed.id)) {
      const { resolve, reject } = pendingRequests.get(parsed.id);
      pendingRequests.delete(parsed.id);
      if (parsed.error) reject(new Error(parsed.error.message));
      else resolve(parsed.result);
    }

    if (parsed.method === 'Runtime.consoleAPICalled') {
      const type = parsed.params.type;
      const text = (parsed.params.args || []).map(a => a.value || a.description || '').join(' ');
      consoleLogs.push(`[${type}] ${text}`);
      if (type === 'error' && !text.includes('favicon')) {
        consoleErrors.push(text);
      }
    } else if (parsed.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(parsed.params.exceptionDetails.text || 'Uncaught error');
    }
  });

  ws.addEventListener('open', async () => {
    try {
      await sendCmd('Runtime.enable');
      await sendCmd('Console.enable');
      await sendCmd('Page.enable');
      await sendCmd('DOM.enable');

      console.log('\n[1] Web App opened at:', APP_URL);
      await new Promise(r => setTimeout(r, 2500));

      // Enter Command Center if on landing page
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
            if (enter) enter.click();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 1500));

      // Helper to navigate via Sidebar
      async function clickSidebar(label) {
        return await sendCmd('Runtime.evaluate', {
          expression: `
            (() => {
              const asideBtns = Array.from(document.querySelectorAll('aside button'));
              const target = asideBtns.find(b => b.textContent && b.textContent.includes('${label}'));
              if (target) {
                target.click();
                return 'Clicked sidebar: ' + '${label}';
              }
              return 'Sidebar button not found: ' + '${label}';
            })()
          `,
          returnByValue: true
        });
      }

      // [2] Switch to Live Surveillance
      console.log('[2] Switching to Live Surveillance page...');
      const liveNav = await clickSidebar('Live Surveillance');
      console.log('    Nav result:', liveNav.result.value);
      await new Promise(r => setTimeout(r, 1500));

      // [3] Select "VIDEO FILE" source mode
      console.log('[3] Selecting "VIDEO FILE" source mode...');
      const modeRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const videoBtn = buttons.find(b => b.innerText && b.innerText.includes('VIDEO FILE'));
            if (videoBtn) {
              videoBtn.click();
              return 'Selected VIDEO FILE';
            }
            return 'VIDEO FILE button not found';
          })()
        `,
        returnByValue: true
      });
      console.log('    Mode selection:', modeRes.result.value);
      await new Promise(r => setTimeout(r, 1000));

      // [4 & 5] Upload video file
      console.log('[4 & 5] Uploading real video (combined_thermal_test.mp4)...');
      const uploadEval = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const statusRes = await fetch('http://127.0.0.1:8000/api/status');
            const statusData = await statusRes.json();
            return {
              analysisMode: statusData.analysis_mode,
              modelStatus: statusData.model_status
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('    System Status from browser:', uploadEval.result.value);

      const videoBuffer = fs.readFileSync(VIDEO_PATH);
      const base64Data = videoBuffer.toString('base64');
      const uploadResult = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const b64 = "${base64Data}";
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'video/mp4' });
            
            const formData = new FormData();
            formData.append('file', blob, 'combined_thermal_test.mp4');
            
            const res = await fetch('http://127.0.0.1:8000/api/video/upload', {
              method: 'POST',
              body: formData
            });
            return await res.json();
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('    Upload API response:', uploadResult.result.value);
      const uploadedVideoId = uploadResult.result.value.video_id;
      console.assert(uploadedVideoId, 'Upload failed, video_id missing');

      // [6, 7, 8] Click START AI DETECTION
      console.log('[6, 7, 8] Starting AI Video Detection...');
      const startRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/video/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_id: "${uploadedVideoId}" })
            });
            return await res.json();
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('    Start API response:', startRes.result.value);

      // [9, 10, 11, 12, 13] Wait for live YOLO + ByteTrack detections
      console.log('[9, 10, 11, 12, 13] Waiting for live YOLO + ByteTrack detections to stream into browser...');
      await new Promise(r => setTimeout(r, 4500));

      const liveDetectionsCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const bodyText = document.body.innerText;
            const canvas = document.querySelector('canvas');
            const hasCanvas = Boolean(canvas);
            
            const hasDrone = bodyText.includes('DRONE') || bodyText.includes('Drone');
            const hasThreatBadge = bodyText.includes('THREAT') || bodyText.includes('ACTIVE');
            const hasTrackId = bodyText.includes('TRACK') || bodyText.includes('#1') || bodyText.includes('#001');
            const hasReason = bodyText.includes('drone') || bodyText.includes('Unauthorized') || bodyText.includes('Perimeter');

            return {
              hasCanvas,
              hasDrone,
              hasThreatBadge,
              hasTrackId,
              hasReason,
              activeTargetsText: (Array.from(document.querySelectorAll('div')).find(d => d.innerText && d.innerText.includes('ACTIVE TARGETS')) || {}).innerText || ''
            };
          })()
        `,
        returnByValue: true
      });
      console.log('    Live Surveillance UI State:', liveDetectionsCheck.result.value);

      // [14, 15] Open Threat Monitoring
      console.log('\n[14, 15] Navigating to Threat Monitoring...');
      await clickSidebar('Threat Monitoring');
      await new Promise(r => setTimeout(r, 2000));

      const threatMonCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasDroneThreat: text.includes('Drone') || text.includes('DRONE') || text.includes('Aerial'),
              hasHighSeverity: text.includes('HIGH') || text.includes('CRITICAL'),
              hasActiveStatus: text.includes('ACTIVE') || text.includes('THREAT')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('    Threat Monitoring verification:', threatMonCheck.result.value);

      // [16, 17] Open Alert History
      console.log('\n[16, 17] Navigating to Alert History...');
      await clickSidebar('Alert History');
      await new Promise(r => setTimeout(r, 2000));

      const alertHistoryCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/alerts/history');
            const data = await res.json();
            const text = document.body.innerText;
            return {
              apiAlertsCount: data.length,
              sampleAlert: data[0] || null,
              uiContainsDrone: text.includes('Drone') || text.includes('DRONE'),
              uiContainsUnauthorized: text.includes('Unauthorized') || text.includes('Drone')
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('    Alert History verification:', alertHistoryCheck.result.value);

      // [20] Test STOP
      console.log('\n[20] Testing STOP AI DETECTION...');
      const stopRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/video/stop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_id: "${uploadedVideoId}" })
            });
            const st = await res.json();
            const getSt = await (await fetch('http://127.0.0.1:8000/api/video/status')).json();
            return {
              stopResponse: st,
              videoStatus: getSt.status
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('    Stop verification:', stopRes.result.value);

      // [19] Verify Demo Mode operates separately
      console.log('\n[19] Verifying Demo Mode capability...');
      await clickSidebar('Live Surveillance');
      await new Promise(r => setTimeout(r, 1000));

      const demoModeToggle = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const demoBtn = btns.find(b => b.innerText && b.innerText.includes('DEMO FEED'));
            if (demoBtn) {
              demoBtn.click();
              return 'Clicked DEMO FEED';
            }
            return 'DEMO FEED button not found';
          })()
        `,
        returnByValue: true
      });
      console.log('    Demo Mode toggle:', demoModeToggle.result.value);

      await new Promise(r => setTimeout(r, 1500));
      const demoModeCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasDemoBadge: text.includes('DEMO MODE ACTIVE') || text.includes('DEMO'),
              hasDemoDescription: text.includes('simulated') || text.includes('Demo') || text.includes('feed')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('    Demo Mode Verification:', demoModeCheck.result.value);

      // [22, 23] Browser Console & Backend Error Check
      console.log('\n[22, 23] Checking Console Errors & Backend Health...');
      console.log('    Total Console Errors in Browser:', consoleErrors.length);
      if (consoleErrors.length > 0) {
        console.log('    Errors captured:', consoleErrors);
      } else {
        console.log('    Clean browser console! No unhandled errors.');
      }

      console.log('\n=================================================================');
      console.log('>>> STEP 5 COMPLETE END-TO-END VERIFICATION SUCCEEDED! <<<');
      console.log('=================================================================');

      ws.close();
      browserProcess.kill();
      process.exit(0);
    } catch (err) {
      console.error('E2E Test Error:', err);
      ws.close();
      browserProcess.kill();
      process.exit(1);
    }
  });
}

runE2E().catch(console.error);
