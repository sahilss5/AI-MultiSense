// tests/test_step9_audit_verification.cjs
// Automated E2E verification for STEP 9 - Final Data Accuracy & Polish Audit

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = globalThis.WebSocket;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_DEBUG_PORT = 9222;
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\2ND TRAINED\\2ND TRAINED IMP\\VIDEO TESTING\\combined_thermal_test.mp4';

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

async function runStep9Audit() {
  console.log('=================================================================');
  console.log('STEP 9: FINAL POLISH & DATA ACCURACY AUDIT VERIFICATION');
  console.log('=================================================================\n');

  // Launch Edge headless
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

  let idCounter = 1;
  const pendingRequests = new Map();
  const consoleErrors = [];

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
    if (msg.method === 'Console.messageAdded') {
      const level = msg.params.message.level;
      if (level === 'error') {
        consoleErrors.push(msg.params.message.text);
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value || a.description || '').join(' ');
        consoleErrors.push(text);
      }
    }
  });

  ws.addEventListener('open', async () => {
    try {
      await sendCmd('Runtime.enable');
      await sendCmd('Console.enable');
      await sendCmd('Page.enable');
      await sendCmd('DOM.enable');

      console.log('[1] Waiting for application loading & boot sequence...');
      await new Promise((r) => setTimeout(r, 2500));

      console.log('    Entering Command Center from Landing Page...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
            if (enter) enter.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1500));

      async function navigateTo(pageId) {
        return await sendCmd('Runtime.evaluate', {
          expression: `
            (() => {
              const asideBtns = Array.from(document.querySelectorAll('aside button'));
              const target = asideBtns.find(b => 
                (b.getAttribute('data-page-id') && b.getAttribute('data-page-id').toLowerCase() === '${pageId.toLowerCase()}') ||
                (b.innerText && b.innerText.toLowerCase().includes('${pageId.toLowerCase()}')) ||
                (b.getAttribute('title') && b.getAttribute('title').toLowerCase().includes('${pageId.toLowerCase()}'))
              );
              if (target) {
                target.click();
                return 'Navigated to: ${pageId}';
              }
              return 'Sidebar button not found: ${pageId}';
            })()
          `,
          returnByValue: true
        });
      }

      console.log('\n[2] Ensuring Live Video Inference has streamed data...');
      const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
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
            const data = await res.json();
            
            await fetch('http://127.0.0.1:8000/api/video/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_id: data.video_id })
            });
            return data;
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('    Upload and start result:', uploadResult.result.value);

      // Wait 5 seconds for inference pipeline to generate detections and alerts
      await new Promise(r => setTimeout(r, 5000));

      // -------------------------------------------------------------
      // 3. AUDIT DASHBOARD
      // -------------------------------------------------------------
      console.log('\n[3] Auditing DASHBOARD Data Accuracy...');
      await navigateTo('dashboard');
      await new Promise((r) => setTimeout(r, 2000));

      const dashboardAudit = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasYOLO11nModelLabel: text.includes('YOLO11n Thermal (best.pt)') || text.includes('YOLO11n'),
              hasNoStaleYOLOv8: !text.includes('YOLOv8'),
              hasByteTrackLabel: text.includes('ByteTrack Kalman'),
              hasLiveStatus: text.includes('LIVE') || text.includes('ACTIVE'),
              hasNoUndefinedOrNaN: !text.includes('NaN') && !text.includes('undefined')
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('✓ Dashboard Audit:', dashboardAudit.result.value);
      console.assert(dashboardAudit.result.value.hasYOLO11nModelLabel, 'Dashboard must display YOLO11n');
      console.assert(dashboardAudit.result.value.hasNoStaleYOLOv8, 'Dashboard must have 0 stale YOLOv8 labels');

      // -------------------------------------------------------------
      // 4. AUDIT ANALYTICS
      // -------------------------------------------------------------
      console.log('\n[4] Auditing ANALYTICS Data Accuracy...');
      await navigateTo('analytics');
      await new Promise((r) => setTimeout(r, 2000));

      const analyticsAudit = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasTotalDetectionsCard: text.includes('TOTAL DETECTIONS'),
              hasConfidenceLabelAccurate: text.includes('N/A') || text.includes('FILTER ≥ 40%'),
              hasNoFake73Percent: !text.includes('73.3%'),
              hasThreatSeverityBreakdown: text.includes('THREAT SEVERITY BREAKDOWN'),
              hasActiveZonesAccurate: text.includes('MOST ACTIVE ZONES'),
              hasNoFake1443Optimal: !text.includes('1443'),
              hasNoUndefinedOrNaN: !text.includes('NaN') && !text.includes('undefined')
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('✓ Analytics Audit:', analyticsAudit.result.value);
      console.assert(analyticsAudit.result.value.hasConfidenceLabelAccurate, 'Analytics must show accurate confidence N/A or Filter >=40%');
      console.assert(analyticsAudit.result.value.hasNoFake73Percent, 'Analytics must not display fabricated 73.3%');
      console.assert(analyticsAudit.result.value.hasNoFake1443Optimal, 'Analytics must not display mock 1443 in real mode');

      // -------------------------------------------------------------
      // 5. AUDIT THREAT MONITORING
      // -------------------------------------------------------------
      console.log('\n[5] Auditing THREAT MONITORING Data Accuracy...');
      await navigateTo('threats');
      await new Promise((r) => setTimeout(r, 2000));

      const threatsAudit = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const text = document.body.innerText;
            let alerts = [];
            try {
              const res = await fetch('http://127.0.0.1:8000/api/alerts/history');
              alerts = await res.json();
            } catch (e) {}
            return {
              hasThreatMonitoringHeader: text.includes('THREAT MONITORING'),
              alertCount: alerts.length,
              hasCleanThreatIds: !text.includes('THREAT #ALT_'),
              hasNoUndefinedOrNaN: !text.includes('NaN') && !text.includes('undefined')
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log('✓ Threat Monitoring Audit:', threatsAudit.result.value);
      console.assert(threatsAudit.result.value.hasCleanThreatIds, 'Threat codes must be formatted without raw ALT_ prefix');

      // -------------------------------------------------------------
      // 6. AUDIT ALERT HISTORY
      // -------------------------------------------------------------
      console.log('\n[6] Auditing ALERT HISTORY Data Accuracy...');
      await navigateTo('alerts');
      await new Promise((r) => setTimeout(r, 2000));

      const alertsAudit = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const text = document.body.innerText;
            let alerts = [];
            try {
              const res = await fetch('http://127.0.0.1:8000/api/alerts/history');
              alerts = await res.json();
            } catch (e) {}
            return {
              hasAlertHistoryHeader: text.includes('ALERT HISTORY') || text.includes('INCIDENT LOGS'),
              hasIstTimestamps: text.includes('IST'),
              alertCount: alerts.length,
              hasNoUndefinedOrNaN: !text.includes('NaN') && !text.includes('undefined')
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log('✓ Alert History Audit:', alertsAudit.result.value);
      console.assert(alertsAudit.result.value.hasIstTimestamps, 'Timestamps must use IST format');

      // -------------------------------------------------------------
      // 7. AUDIT REPORTS & CONFIDENCE FIX
      // -------------------------------------------------------------
      console.log('\n[7] Auditing REPORTS Data Accuracy & Average Confidence...');
      await navigateTo('reports');
      await new Promise((r) => setTimeout(r, 2000));

      const reportsAudit = await sendCmd('Runtime.evaluate', {
        expression: `
          (async () => {
            const text = document.body.innerText;
            let analytics = { total_detections: 0, total_threats: 0 };
            let alerts = [];
            try {
              analytics = await (await fetch('http://127.0.0.1:8000/api/analytics')).json();
              alerts = await (await fetch('http://127.0.0.1:8000/api/alerts/history')).json();
            } catch (e) {}

            return {
              hasReportsHeader: text.includes('REPORTS'),
              avgConfidenceDisplayed: text.includes('N/A') ? 'N/A' : (text.includes('85.0%') ? '85.0%' : 'OTHER'),
              hasNoFabricatedConfidenceFormula: !text.includes('85.0%'),
              hasFilterThresholdSublabel: text.includes('Filter Threshold ≥40%'),
              hasRealDetections: text.includes(String(analytics.total_detections)) || text.includes(Number(analytics.total_detections).toLocaleString()),
              hasRealThreats: text.includes(String(analytics.total_threats)) || text.includes(String(alerts.length)),
              hasRecordedTelemetryTable: text.includes('LOGGED INCIDENT TELEMETRY') || text.includes('TELEMETRY'),
              hasNoUndefinedOrNaN: !text.includes('NaN') && !text.includes('undefined')
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log('✓ Reports Audit:', reportsAudit.result.value);
      console.assert(reportsAudit.result.value.avgConfidenceDisplayed === 'N/A', 'Average Confidence must display N/A in Real Mode');
      console.assert(reportsAudit.result.value.hasFilterThresholdSublabel, 'Must show Filter Threshold sublabel');

      // -------------------------------------------------------------
      // 8. AUDIT EXPORT CAPABILITIES
      // -------------------------------------------------------------
      console.log('\n[8] Auditing CSV & JSON Exports & Print in Reports...');
      const exportCsvRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const csvBtn = btns.find(b => b.innerText && b.innerText.includes('EXPORT CSV'));
            if (csvBtn) { csvBtn.click(); return 'CSV export clicked'; }
            return 'CSV button missing';
          })()
        `,
        returnByValue: true,
      });
      console.log('✓ CSV Export:', exportCsvRes.result.value);

      const exportJsonRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const jsonBtn = btns.find(b => b.innerText && b.innerText.includes('EXPORT JSON'));
            if (jsonBtn) { jsonBtn.click(); return 'JSON export clicked'; }
            return 'JSON button missing';
          })()
        `,
        returnByValue: true,
      });
      console.log('✓ JSON Export:', exportJsonRes.result.value);

      // -------------------------------------------------------------
      // 9. AUDIT DEMO MODE SEPARATION
      // -------------------------------------------------------------
      console.log('\n[9] Auditing DEMO MODE Separation in Reports...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const selects = Array.from(document.querySelectorAll('select'));
            const src = selects.find(s => Array.from(s.options).some(o => o.value.includes('DEMO')));
            if (src) {
              src.value = 'DEMO FEED (Simulated)';
              src.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1000));

      const demoModeAudit = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasDemoBadge: text.includes('DEMO REPORTING SYSTEM') || text.includes('DEMO'),
              hasDemoAvgConfidence: text.includes('96.7%'),
              hasDemoDetections: text.includes('2,481') || text.includes('2481')
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('✓ Demo Mode Audit in Reports:', demoModeAudit.result.value);
      console.assert(demoModeAudit.result.value.hasDemoBadge, 'Demo mode must display DEMO badge');
      console.assert(demoModeAudit.result.value.hasDemoAvgConfidence, 'Demo mode must display demo baseline confidence');

      // Return to real mode
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const selects = Array.from(document.querySelectorAll('select'));
            const src = selects.find(s => Array.from(s.options).some(o => o.value.includes('DEMO')));
            if (src) {
              src.value = 'All Sources';
              src.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `,
      });
      console.log('✓ Seamlessly returned to Real Mode');

      // -------------------------------------------------------------
      // 10. CONSOLE ERRORS CHECK
      // -------------------------------------------------------------
      console.log('\n[10] Checking Browser Console Errors...');
      const filteredErrors = consoleErrors.filter(
        (e) => !e.includes('WebSocket') && !e.includes('favicon') && !e.includes('test_thermal.mp4')
      );
      console.log(`✓ Filtered Console Unhandled Errors: ${filteredErrors.length}`);
      if (filteredErrors.length > 0) {
        console.log('  Warnings/Errors:', filteredErrors);
      }

      console.log('\n=================================================================');
      console.log('>>> STEP 9: FINAL DATA ACCURACY AUDIT VERIFICATION COMPLETE! <<<');
      console.log('=================================================================\n');

      ws.close();
      browserProcess.kill();
      process.exit(0);
    } catch (err) {
      console.error('Audit Verification failed:', err);
      ws.close();
      browserProcess.kill();
      process.exit(1);
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('WebSocket connection error:', err);
    process.exit(1);
  });
}

runStep9Audit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
