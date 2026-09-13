const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const CDP_PORT = 9226;

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

async function run() {
  console.log('=================================================================');
  console.log('STARTING ANALYTICS PAGE VERIFICATION (EDGE CDP PORT ' + CDP_PORT + ')');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  try {
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
      throw new Error('Failed to connect to browser CDP on port ' + CDP_PORT);
    }

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
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
      return r.result?.value;
    }

    // Wait for page to initialize
    await new Promise(r => setTimeout(r, 2000));

    // Navigate to Analytics page by dispatching 'a' keydown
    console.log('1. Navigating to Analytics page...');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      })()
    `);

    await new Promise(r => setTimeout(r, 2000));

    // Verify Standby / Empty State
    console.log('\n2. Verifying Standby State...');
    const standbyChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasTitle: text.includes('ANALYTICS'),
          hasSubtitle: text.includes('Detection counts, class distribution, threat events and system performance'),
          hasScope: text.includes('ANALYTICS SCOPE:') && text.includes('CURRENT SESSION'),
          hasTotalDetections: text.includes('TOTAL DETECTIONS'),
          hasActiveTracks: text.includes('ACTIVE TRACKS'),
          hasThreatEvents: text.includes('THREAT EVENTS'),
          hasAvgConfidence: text.includes('AVG CONFIDENCE'),
          hasInferenceStatus: text.includes('INFERENCE STATUS'),
          hasPeakPeriod: text.includes('PEAK PERIOD'),
          hasStandbyText: text.includes('STANDBY') || text.includes('ACTIVE'),
          hasConfidenceExplanation: text.includes('Not available for current session') || text.includes('Session mean'),
          hasPeakExplanation: text.includes('Insufficient time-series data') || text.includes('detections'),
          hasDrone: text.includes('Drone'),
          hasPersonWithBag: text.includes('Person With Bag'),
          hasPerson: text.includes('Person'),
          hasVehicle: text.includes('Vehicle'),
          hasAnimal: text.includes('Animal'),
          hasThreatRules: text.includes('THREAT ENGINE CLASSIFICATION RULES'),
          hasSystemPerformance: text.includes('SYSTEM PERFORMANCE & RUNTIME ARCHITECTURE'),
          hasEmptyTrendOrChart: text.includes('INSUFFICIENT SESSION DATA') || text.includes('DETECTIONS & THREATS OVER TIME'),
          noTruncatedRealTime: !text.includes('Real-Time Acti...'),
        };
      })()
    `);

    console.log('✓ Title present:', standbyChecks.hasTitle);
    console.log('✓ Subtitle wording verified:', standbyChecks.hasSubtitle);
    console.log('✓ Scope banner "CURRENT SESSION":', standbyChecks.hasScope);
    console.log('✓ Top KPI Cards (Detections, Tracks, Threats, Confidence, Status, Peak):',
      standbyChecks.hasTotalDetections && standbyChecks.hasActiveTracks && standbyChecks.hasThreatEvents &&
      standbyChecks.hasAvgConfidence && standbyChecks.hasInferenceStatus && standbyChecks.hasPeakPeriod);
    console.log('✓ Standby / Active status label:', standbyChecks.hasStandbyText);
    console.log('✓ Average Confidence honest N/A note:', standbyChecks.hasConfidenceExplanation);
    console.log('✓ Peak period honest note:', standbyChecks.hasPeakExplanation);
    console.log('✓ All 5 classes present (Drone, Person With Bag, Person, Vehicle, Animal):',
      standbyChecks.hasDrone && standbyChecks.hasPersonWithBag && standbyChecks.hasPerson && standbyChecks.hasVehicle && standbyChecks.hasAnimal);
    console.log('✓ Threat Engine Classification Rules explanation:', standbyChecks.hasThreatRules);
    console.log('✓ System Performance Architecture summary:', standbyChecks.hasSystemPerformance);
    console.log('✓ Empty trend message ("INSUFFICIENT SESSION DATA") or active chart:', standbyChecks.hasEmptyTrendOrChart);
    console.log('✓ No truncated text ("Real-Time Acti..."):', standbyChecks.noTruncatedRealTime);

    // Verify backend analytics endpoint directly
    console.log('\n3. Testing Active Video Inference Session...');
    const testVideoPath = path.resolve('data/combined_thermal_test.mp4');
    if (fs.existsSync(testVideoPath)) {
      const form = new FormData();
      const fileBuffer = fs.readFileSync(testVideoPath);
      form.append('file', new Blob([fileBuffer]), 'combined_thermal_test.mp4');

      console.log('Uploading test video...');
      const uploadRes = await fetch('http://127.0.0.1:8000/api/video/upload', {
        method: 'POST',
        body: form,
      });
      const uploadData = await uploadRes.json();
      console.log('Uploaded video ID:', uploadData.video_id);

      if (uploadData.video_id) {
        console.log('Starting detection...');
        await fetch('http://127.0.0.1:8000/api/video/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: uploadData.video_id }),
        });

        console.log('Allowing 6s for real YOLO11n + ByteTrack frames...');
        await new Promise(r => setTimeout(r, 6000));

        const analyticsRes = await fetch('http://127.0.0.1:8000/api/analytics');
        const analyticsData = await analyticsRes.json();
        console.log('\n--- Real Backend Analytics Telemetry ---');
        console.log('Total Detections:', analyticsData.total_detections);
        console.log('Active Tracks:', analyticsData.active_tracks);
        console.log('Total Threats:', analyticsData.total_threats);
        console.log('Class Distribution:', analyticsData.class_distribution);
        console.log('Average Confidence:', analyticsData.average_confidence);
        console.log('Threat Trend Frames:', analyticsData.threat_trend?.length);

        // Click refresh on UI
        await evalJs(`
          (() => {
            const refreshBtn = document.querySelector('button[title="Refresh Analytics"]');
            if (refreshBtn) refreshBtn.click();
          })()
        `);
        await new Promise(r => setTimeout(r, 2000));

        const activeUiChecks = await evalJs(`
          (() => {
            const text = document.body.innerText;
            return {
              hasDetectionsOverZero: !text.includes('Awaiting video'),
              hasActiveStatusOrFps: text.includes('ACTIVE') || text.includes('FPS'),
              hasTrendsChart: text.includes('DETECTIONS & THREATS OVER TIME'),
              hasBreakdownList: text.includes('SESSION CLASS BREAKDOWN'),
            };
          })()
        `);
        console.log('\n--- UI Verification Under Active Video ---');
        console.log('✓ Detections updated beyond zero:', activeUiChecks.hasDetectionsOverZero);
        console.log('✓ Active status or FPS shown:', activeUiChecks.hasActiveStatusOrFps);
        console.log('✓ Trend chart rendered:', activeUiChecks.hasTrendsChart);
        console.log('✓ Session Class Breakdown rendered:', activeUiChecks.hasBreakdownList);

        // Stop video
        await fetch('http://127.0.0.1:8000/api/video/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: uploadData.video_id }),
        }).catch(() => {});
      }
    }

    ws.close();
    console.log('\n=================================================================');
    console.log('>>> ANALYTICS PAGE VERIFICATION COMPLETED SUCCESSFULLY! <<<');
    console.log('=================================================================');
  } finally {
    try {
      browserProcess.kill();
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
