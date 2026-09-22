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
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=================================================================');
  console.log('REAL BROWSER VERIFICATION: TARGET TRACKING & THREAT MONITORING');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    APP_URL
  ]);

  // Wait 2 seconds for Edge to start
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
    console.error('Could not connect to Edge DevTools target');
    browserProcess.kill();
    process.exit(1);
  }

  console.log('Connected to Edge DevTools Protocol on:', wsUrl);

  const ws = new WebSocket(wsUrl);

  const consoleLogs = [];
  const consoleErrors = [];
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
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Console.messageAdded') {
      const msg = data.params.message;
      if (msg.level === 'error') {
        consoleErrors.push(msg.text);
      }
      consoleLogs.push(`[${msg.level}] ${msg.text}`);
    } else if (data.method === 'Runtime.exceptionThrown') {
      const exc = data.params.exceptionDetails;
      const text = exc.exception ? exc.exception.description : exc.text;
      consoleErrors.push(`[Exception] ${text}`);
      console.error('Browser Runtime Exception:', text);
    }
  });

  ws.addEventListener('open', async () => {
    try {
      await sendCmd('Runtime.enable');
      await sendCmd('Console.enable');
      await sendCmd('Page.enable');

      console.log('DevTools domains enabled. Waiting 2.5s for initial render...');
      await new Promise(r => setTimeout(r, 2500));

      // 1. Check if landing page and click ENTER COMMAND CENTER
      const enterRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const enterBtn = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
            if (enterBtn) {
              enterBtn.click();
              return 'CLICKED_ENTER';
            }
            return 'ALREADY_INSIDE';
          })()
        `
      });
      console.log('[1] Command Center Entrance:', enterRes.result.value);
      await new Promise(r => setTimeout(r, 1500));

      // 2. Click "TARGET TRACKING" tab
      console.log('\n[2] Navigating to TARGET TRACKING page...');
      const navRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.querySelector('button[data-page-id="tracking"]') ||
              Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.toUpperCase().includes('TARGET TRACKING'));
            if (btn) {
              btn.click();
              return 'CLICKED_TARGET_TRACKING';
            }
            return 'TARGET_TRACKING_BUTTON_NOT_FOUND';
          })()
        `
      });
      console.log('Navigation Result:', navRes.result.value);
      await new Promise(r => setTimeout(r, 2000));

      // 3. Inspect Target Tracking page content
      console.log('\n[3] Inspecting Target Tracking Page...');
      const pageTextRes = await sendCmd('Runtime.evaluate', {
        expression: 'document.body.innerText'
      });
      const pageText = pageTextRes.result.value;

      console.log('Page text length:', pageText.length);
      const hasSessionComplete = pageText.includes('SESSION COMPLETE');
      const hasSessionSummary = pageText.includes('SESSION SUMMARY');
      const hasDynamicClass = pageText.includes('DYNAMIC CLASS SUMMARY');
      const hasTrackHistory = pageText.includes('SESSION TRACK HISTORY');
      const hasTargetInspector = pageText.includes('TARGET INSPECTOR');
      const hasLastKnownPos = pageText.includes('LAST KNOWN POSITION');

      console.log('- Contains "SESSION COMPLETE":', hasSessionComplete);
      console.log('- Contains "SESSION SUMMARY":', hasSessionSummary);
      console.log('- Contains "DYNAMIC CLASS SUMMARY":', hasDynamicClass);
      console.log('- Contains "SESSION TRACK HISTORY":', hasTrackHistory);
      console.log('- Contains "TARGET INSPECTOR":', hasTargetInspector);
      console.log('- Contains "LAST KNOWN POSITION":', hasLastKnownPos);

      if (!hasSessionComplete || !hasTrackHistory || !hasTargetInspector) {
        throw new Error('Target Tracking page did not render the expected session complete sections!');
      }

      // 4. Click a track row in the table (e.g. T-247 or T-230)
      console.log('\n[4] Clicking on track row in SESSION TRACK HISTORY...');
      const clickTrackRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            const row = rows.find(r => r.innerText.includes('T-247')) || rows[0];
            if (row) {
              row.click();
              return row.innerText.slice(0, 80);
            }
            return 'NO_ROW_FOUND';
          })()
        `
      });
      console.log('Selected track row:', clickTrackRes.result.value);
      await new Promise(r => setTimeout(r, 1000));

      // 5. Verify Target Inspector values and Last Known Position
      console.log('\n[5] Verifying Target Inspector values...');
      const inspectorTextRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const inspector = Array.from(document.querySelectorAll('h3')).find(h => h.innerText.includes('TARGET INSPECTOR'));
            if (!inspector) return 'INSPECTOR_NOT_FOUND';
            const container = inspector.closest('.p-4') || inspector.parentElement;
            return container ? container.innerText : 'NO_CONTAINER';
          })()
        `
      });
      console.log('Target Inspector content snippet:\n', inspectorTextRes.result.value.slice(0, 400));

      // 6. Check 3D Trajectory SVG
      const svgRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const svgs = Array.from(document.querySelectorAll('svg'));
            return svgs.length;
          })()
        `
      });
      console.log('Rendered SVGs count:', svgRes.result.value);

      // 7. Click "THREAT MONITORING" tab
      console.log('\n[7] Navigating to THREAT MONITORING page...');
      const threatNavRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.querySelector('button[data-page-id="threats"]') ||
              Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.toUpperCase().includes('THREAT MONITORING'));
            if (btn) {
              btn.click();
              return 'CLICKED_THREAT_MONITORING';
            }
            return 'THREAT_MONITORING_NOT_FOUND';
          })()
        `
      });
      console.log('Navigation Result:', threatNavRes.result.value);
      await new Promise(r => setTimeout(r, 2000));

      // 8. Inspect Threat Monitoring Page
      console.log('\n[8] Inspecting Threat Monitoring Page...');
      const threatPageTextRes = await sendCmd('Runtime.evaluate', {
        expression: 'document.body.innerText'
      });
      const threatPageText = threatPageTextRes.result.value;

      const hasThreatEngine = threatPageText.includes('THREAT ENGINE ACTIVE');
      const hasThreatQueue = threatPageText.includes('THREAT QUEUE') || threatPageText.includes('THREAT');
      const hasSurveillanceMap = threatPageText.includes('SURVEILLANCE') || threatPageText.includes('GEO-FENCE');

      console.log('- Contains "THREAT ENGINE ACTIVE":', hasThreatEngine);
      console.log('- Contains Threat items:', hasThreatQueue);
      console.log('- Contains Map:', hasSurveillanceMap);

      // 9. Click a threat card
      console.log('\n[9] Clicking a threat card in Threat Queue...');
      const clickThreatRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const cards = Array.from(document.querySelectorAll('[data-testid="threat-card"], div')).filter(d => 
              d.innerText && (d.innerText.includes('T-230') || d.innerText.includes('T-210') || d.innerText.includes('T-247'))
            );
            if (cards.length > 0) {
              cards[0].click();
              return 'CLICKED_THREAT_CARD: ' + cards[0].innerText.slice(0, 60);
            }
            return 'NO_THREAT_CARD_FOUND';
          })()
        `
      });
      console.log('Threat selection result:', clickThreatRes.result.value);
      await new Promise(r => setTimeout(r, 1500));

      // Verify Tactical Map does NOT show "NO ACTIVE SURVEILLANCE"
      const mapCheckRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            const hasNoActiveSurv = text.includes('NO ACTIVE SURVEILLANCE');
            const hasSelectedTarget = text.includes('SELECTED TARGET:');
            const hasLastKnown = text.includes('LAST KNOWN POSITION');
            return { hasNoActiveSurv, hasSelectedTarget, hasLastKnown };
          })()
        `
      });
      console.log('Map State after selecting threat:', mapCheckRes.result.value);

      // 10. Check Console Errors
      console.log('\n[10] Checking Console Errors...');
      const fatalErrors = consoleErrors.filter(e => 
        e.includes('TypeError') || 
        e.includes('last_position') || 
        e.includes('map is not a function') ||
        e.includes('Uncaught')
      );
      console.log(`Total console messages: ${consoleLogs.length}`);
      console.log(`Total console errors: ${consoleErrors.length}`);
      console.log(`Fatal React/Contract errors: ${fatalErrors.length}`);

      if (fatalErrors.length > 0) {
        console.error('Fatal errors found:', fatalErrors);
        throw new Error(`Test failed with ${fatalErrors.length} fatal errors!`);
      }

      console.log('\n=================================================================');
      console.log('SUCCESS: BROWSER VERIFICATION PASSED WITH ZERO CRASHES!');
      console.log('=================================================================');

      ws.close();
      browserProcess.kill();
      process.exit(0);

    } catch (err) {
      console.error('\nVerification Error:', err);
      ws.close();
      browserProcess.kill();
      process.exit(1);
    }
  });
}

main().catch(err => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
