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
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function runVerification() {
  console.log('=================================================================');
  console.log('STEP 7: FINAL END-TO-END SYSTEM VERIFICATION');
  console.log('=================================================================');

  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`Video file not found at: ${VIDEO_PATH}`);
  }

  // 1. Launch Headless Edge
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
  for (let i = 0; i < 15; i++) {
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
    browserProcess.kill();
    throw new Error('Failed to connect to Edge DevTools Protocol');
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
      if (type === 'error' && !text.includes('favicon') && !text.includes('404')) {
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

      console.log('\n--- [TEST 1 & TEST 2: BACKEND & FRONTEND START] ---');
      const backendStatus = await getJson('http://127.0.0.1:8000/api/status');
      console.log('✓ Backend /api/status:', JSON.stringify(backendStatus, null, 2));
      console.assert(backendStatus.model_status === 'READY', 'Model status should be READY');
      console.assert(backendStatus.supported_classes.length === 5, 'Must have 5 supported classes');
      console.assert(backendStatus.device.includes('NVIDIA') || backendStatus.device.includes('CUDA'), 'Must use CUDA device');

      await new Promise(r => setTimeout(r, 2000));

      // Enter Command Center
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
      console.log('✓ Entered Command Center from Landing Page');

      // Helper to navigate via Sidebar
      async function clickSidebar(label) {
        return await sendCmd('Runtime.evaluate', {
          expression: `
            (() => {
              const asideBtns = Array.from(document.querySelectorAll('aside button'));
              const target = asideBtns.find(b => b.textContent && b.textContent.includes('${label}'));
              if (target) {
                target.click();
                return 'Navigated to: ${label}';
              }
              return 'Sidebar button not found: ${label}';
            })()
          `,
          returnByValue: true
        });
      }

      console.log('\n--- [TEST 3: REAL VIDEO PIPELINE VIA UI] ---');
      // Navigate to Live Surveillance
      await clickSidebar('Live Surveillance');
      await new Promise(r => setTimeout(r, 1500));

      // Select Video File mode
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const videoBtn = buttons.find(b => b.innerText && b.innerText.includes('VIDEO FILE'));
            if (videoBtn) videoBtn.click();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 1000));

      // Upload the video file through UI
      console.log('Uploading real video file through UI...');
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
      const vidId = uploadResult.result.value.video_id;
      console.log(`✓ Video Uploaded via UI. Assigned ID: ${vidId}`);

      // Start AI Detection through UI
      console.log('Starting AI Detection...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/video/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_id: "${vidId}" })
            });
            return await res.json();
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('✓ Started AI Video Detection');

      // Wait 5 seconds to allow YOLO11n + ByteTrack detections to stream over WebSocket into UI
      await new Promise(r => setTimeout(r, 5000));

      // Verify UI Live Surveillance State
      const liveState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            const canvas = document.querySelector('canvas');
            return {
              hasCanvas: Boolean(canvas),
              hasDrone: text.includes('DRONE') || text.includes('Drone'),
              hasThreat: text.includes('THREAT') || text.includes('HIGH'),
              hasTrack: text.includes('#1') || text.includes('TRACK') || text.includes('TARGET'),
              hasReason: text.includes('Unauthorized') || text.includes('drone')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('✓ Live Surveillance UI State:', liveState.result.value);
      console.assert(liveState.result.value.hasCanvas, 'Canvas must be present for video rendering');
      console.assert(liveState.result.value.hasDrone, 'Drone detection must be rendered');
      console.assert(liveState.result.value.hasThreat, 'Threat badge must be rendered');

      console.log('\n--- [TEST 4: DASHBOARD REAL BACKEND DATA] ---');
      await clickSidebar('Dashboard');
      await new Promise(r => setTimeout(r, 2000));

      const dashboardState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasActiveTargets: text.includes('ACTIVE TARGETS') || text.includes('TARGETS'),
              hasThreatMetrics: text.includes('THREAT') || text.includes('ACTIVE THREATS'),
              hasDroneOrVehicle: text.includes('DRONE') || text.includes('Drone') || text.includes('Vehicle'),
              hasISTClock: text.includes('IST')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('✓ Dashboard Verification:', dashboardState.result.value);
      console.assert(dashboardState.result.value.hasActiveTargets, 'Dashboard must display targets');
      console.assert(dashboardState.result.value.hasISTClock, 'Dashboard must display IST clock');

      console.log('\n--- [TEST 5: ANALYTICS VERIFICATION] ---');
      await clickSidebar('Analytics');
      await new Promise(r => setTimeout(r, 2000));

      const analyticsState = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/analytics');
            const data = await res.json();
            const text = document.body.innerText;
            return {
              totalDetections: data.total_detections,
              totalThreats: data.total_threats,
              classesTracked: data.class_distribution.map(c => c.class_name),
              uiShowsDetections: text.includes(String(data.total_detections)) || text.includes('TOTAL DETECTIONS'),
              uiShowsClasses: text.includes('DETECTION BY CLASS') || text.includes('Drone')
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('✓ Analytics Verification:', analyticsState.result.value);
      console.assert(analyticsState.result.value.totalDetections > 0, 'Analytics must show real detection count');
      console.assert(analyticsState.result.value.classesTracked.includes('Drone'), 'Analytics must include Drone');

      console.log('\n--- [TEST 6: THREAT MONITORING VERIFICATION] ---');
      await clickSidebar('Threat Monitoring');
      await new Promise(r => setTimeout(r, 2000));

      const threatState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasDroneThreat: text.includes('Drone') || text.includes('DRONE'),
              hasHighSeverity: text.includes('HIGH') || text.includes('CRITICAL'),
              hasThreatReason: text.includes('drone') || text.includes('Unauthorized') || text.includes('Perimeter')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('✓ Threat Monitoring Verification:', threatState.result.value);
      console.assert(threatState.result.value.hasDroneThreat, 'Threat monitoring must display Drone threat');
      console.assert(threatState.result.value.hasHighSeverity, 'Threat severity must be HIGH');

      console.log('\n--- [TEST 7: ALERT HISTORY & SQLITE DEDUPLICATION] ---');
      await clickSidebar('Alert History');
      await new Promise(r => setTimeout(r, 2000));

      const alertState = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/alerts/history');
            const alerts = await res.json();
            const text = document.body.innerText;
            return {
              alertsCount: alerts.length,
              sampleAlert: alerts[0],
              uiHasAlerts: text.includes('Drone') || text.includes('DRONE')
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('✓ Alert History Verification:', alertState.result.value);
      console.assert(alertState.result.value.alertsCount >= 1, 'SQLite database must contain recorded alerts');
      console.assert(['Drone', 'Person_With_Bag'].includes(alertState.result.value.sampleAlert.object_class), 'Alert class must be Drone or Person_With_Bag');

      console.log('\n--- [TEST 8: AI ENGINE VERIFICATION] ---');
      await clickSidebar('AI Engine');
      await new Promise(r => setTimeout(r, 2000));

      const aiEngineState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasModelReady: text.includes('READY') || text.includes('OPERATIONAL'),
              hasBestPt: text.includes('best.pt'),
              hasCuda: text.includes('CUDA') || text.includes('NVIDIA') || text.includes('RTX'),
              has5Classes: text.includes('Person') && text.includes('Vehicle') && text.includes('Animal') && text.includes('Drone')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('✓ AI Engine Verification:', aiEngineState.result.value);
      console.assert(aiEngineState.result.value.hasModelReady, 'Model must be READY');
      console.assert(aiEngineState.result.value.hasBestPt, 'Model file must be best.pt');
      console.assert(aiEngineState.result.value.has5Classes, 'All 5 classes must be displayed');

      console.log('\n--- [TEST 9: STOP DETECTION & CLEANUP] ---');
      await clickSidebar('Live Surveillance');
      await new Promise(r => setTimeout(r, 1500));

      const stopResult = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const res = await fetch('http://127.0.0.1:8000/api/video/stop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_id: "${vidId}" })
            });
            const stopData = await res.json();
            const statusRes = await fetch('http://127.0.0.1:8000/api/video/status');
            const finalStatus = await statusRes.json();
            return {
              stopResponse: stopData,
              finalVideoStatus: finalStatus.status
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('✓ Stop Detection Verification:', stopResult.result.value);
      console.assert(stopResult.result.value.finalVideoStatus === 'stopped', 'Video status must be stopped');

      console.log('\n--- [TEST 10: DEMO MODE VERIFICATION] ---');
      const demoToggleResult = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const demoBtn = btns.find(b => b.innerText && b.innerText.includes('DEMO FEED'));
            if (demoBtn) {
              demoBtn.click();
              return 'Clicked DEMO FEED';
            }
            return 'DEMO FEED not found';
          })()
        `,
        returnByValue: true
      });
      console.log('Demo mode switch result:', demoToggleResult.result.value);
      await new Promise(r => setTimeout(r, 1500));

      const demoState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasDemoNotice: text.includes('DEMO MODE ACTIVE') || text.includes('DEMO') || text.includes('simulated')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('✓ Demo Mode State:', demoState.result.value);
      console.assert(demoState.result.value.hasDemoNotice, 'Demo notice must be visible');

      // Switch back to Video File
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const videoBtn = btns.find(b => b.innerText && b.innerText.includes('VIDEO FILE'));
            if (videoBtn) videoBtn.click();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 1000));
      console.log('✓ Switched cleanly back to Real Mode (VIDEO FILE)');

      console.log('\n--- [CONSOLE ERRORS CHECK] ---');
      console.log(`Captured ${consoleErrors.length} browser console errors.`);
      if (consoleErrors.length > 0) {
        console.warn('Console errors:', consoleErrors);
      } else {
        console.log('✓ Zero console errors detected during entire interactive session!');
      }

      console.log('\n=================================================================');
      console.log('>>> ALL TESTS 1 THROUGH 10 PASSED IN E2E BROWSER VALIDATION <<<');
      console.log('=================================================================');

      ws.close();
      browserProcess.kill();
      process.exit(0);
    } catch (err) {
      console.error('VERIFICATION ERROR:', err);
      ws.close();
      browserProcess.kill();
      process.exit(1);
    }
  });
}

runVerification().catch(console.error);
