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
  console.log('STEP 5 BROWSER VERIFICATION (REAL EDGE ENGINE)');
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

  ws.addEventListener('open', async () => {
    try {
      // Enable domains
      await sendCmd('Runtime.enable');
      await sendCmd('Console.enable');
      await sendCmd('Page.enable');

      console.log('Browser devtools domains enabled.');

      // Wait 3 seconds for React hydration and initial fetch
      await new Promise(r => setTimeout(r, 3000));

      // 1. Check page title & body content
      const titleRes = await sendCmd('Runtime.evaluate', { expression: 'document.title' });
      console.log('Page Title:', titleRes.result.value);

      const htmlSnippetRes = await sendCmd('Runtime.evaluate', {
        expression: 'document.body.innerText.slice(0, 300)'
      });
      console.log('\nPage Rendered Content Sample:');
      console.log(htmlSnippetRes.result.value.replace(/\n+/g, ' | '));

      // 2. Click "ENTER COMMAND CENTER"
      console.log('\nClicking "ENTER COMMAND CENTER" to enter main surveillance dashboard...');
      const enterRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const enterBtn = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
            if (enterBtn) {
              enterBtn.click();
              return 'Clicked ENTER COMMAND CENTER successfully';
            }
            return 'Enter button not found';
          })()
        `,
        returnByValue: true
      });
      console.log('Enter Command Center result:', enterRes.result.value);

      await new Promise(r => setTimeout(r, 2000));

      // 3. Test Navigation: Switch to Live Surveillance
      console.log('\nTesting UI Navigation to Live Surveillance...');
      const liveNavRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const btn = btns.find(b => b.innerText && b.innerText.includes('Live Surveillance'));
            if (btn) { btn.click(); return 'Clicked Live Surveillance nav'; }
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
            return 'Triggered key l';
          })()
        `,
        returnByValue: true
      });
      console.log('Live Surveillance Nav:', liveNavRes.result.value);

      await new Promise(r => setTimeout(r, 2000));

      // 4. Verify Live Surveillance Elements
      const liveCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasSurveillanceHeader: text.includes('SURVEILLANCE') || text.includes('LIVE'),
              hasVideoFileOption: text.includes('VIDEO FILE'),
              hasThermalCameraOption: text.includes('THERMAL CAMERA'),
              hasCanvas: Boolean(document.querySelector('canvas')),
              hasStartButton: text.includes('START AI DETECTION') || text.includes('DETECTION')
            };
          })()
        `,
        returnByValue: true
      });
      console.log('Live Surveillance UI Verification:', liveCheck.result.value);

      // 5. Navigate to Threat Monitoring
      console.log('\nTesting UI Navigation to Threat Monitoring...');
      const threatNavRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const btn = btns.find(b => b.innerText && b.innerText.includes('Threat Monitoring'));
            if (btn) { btn.click(); return 'Clicked Threat Monitoring nav'; }
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
            return 'Triggered key t';
          })()
        `,
        returnByValue: true
      });
      console.log('Threat Monitoring Nav:', threatNavRes.result.value);

      await new Promise(r => setTimeout(r, 2000));

      const threatCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasThreatHeader: text.includes('THREAT') || text.includes('MONITORING'),
              hasThreatBadge: text.includes('HIGH') || text.includes('CRITICAL') || text.includes('ACTIVE') || text.includes('THREAT'),
            };
          })()
        `,
        returnByValue: true
      });
      console.log('Threat Monitoring UI Verification:', threatCheck.result.value);

      // 6. Navigate to Alert History
      console.log('\nTesting UI Navigation to Alert History...');
      const alertNavRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const btn = btns.find(b => b.innerText && b.innerText.includes('Alert History'));
            if (btn) { btn.click(); return 'Clicked Alert History nav'; }
            return 'Alert button not found';
          })()
        `,
        returnByValue: true
      });
      console.log('Alert History Nav:', alertNavRes.result.value);

      await new Promise(r => setTimeout(r, 2000));

      const alertCheck = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              hasAlertsHeader: text.includes('ALERT') || text.includes('AUDIT') || text.includes('HISTORY'),
              hasTableOrCards: Boolean(document.querySelector('table, .grid, [class*="card"]'))
            };
          })()
        `,
        returnByValue: true
      });
      console.log('Alert History UI Verification:', alertCheck.result.value);


      console.log('\n=================================================================');
      console.log('BROWSER CONSOLE REPORT:');
      console.log('Total Console Messages:', consoleLogs.length);
      console.log('Total Console Errors:', consoleErrors.length);
      if (consoleErrors.length > 0) {
        console.log('Errors:', consoleErrors);
      } else {
        console.log('No fatal application errors detected in browser console.');
      }
      console.log('=================================================================');

      ws.close();
      browserProcess.kill();
      process.exit(0);
    } catch (err) {
      console.error('Test execution error:', err);
      ws.close();
      browserProcess.kill();
      process.exit(1);
    }
  });

  ws.addEventListener('message', (event) => {
    const parsed = JSON.parse(event.data);
    if (parsed.id && pendingRequests.has(parsed.id)) {
      const { resolve, reject } = pendingRequests.get(parsed.id);
      pendingRequests.delete(parsed.id);
      if (parsed.error) reject(new Error(parsed.error.message));
      else resolve(parsed.result);
    }

    // Capture console messages
    if (parsed.method === 'Runtime.consoleAPICalled') {
      const type = parsed.params.type;
      const text = (parsed.params.args || []).map(a => a.value || a.description || '').join(' ');
      consoleLogs.push(`[${type}] ${text}`);
      if (type === 'error' && !text.includes('favicon')) {
        consoleErrors.push(text);
      }
    } else if (parsed.method === 'Runtime.exceptionThrown') {
      const text = parsed.params.exceptionDetails.text || '';
      consoleErrors.push(text);
    }
  });

}

main().catch(console.error);
