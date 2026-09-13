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
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function runModalVerification() {
  console.log('=================================================================');
  console.log('VERIFYING CONNECT MODEL MODAL IN BROWSER');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9232',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9232/json/list');
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
    throw new Error('Failed to connect to browser CDP on port 9232');
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

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r));

  async function evaluate(expression) {
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

  // Navigate directly to app
  await send('Page.navigate', { url: APP_URL });
  await new Promise(r => setTimeout(r, 2000));

  // If on landing page, click enter command center
  await evaluate(`
    (() => {
      const enterBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ENTER COMMAND CENTER'));
      if (enterBtn) enterBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  // Press 'e' to navigate to AI Engine page
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
  `);
  await new Promise(r => setTimeout(r, 2000));

  // Click CONNECT MODEL FILE button
  console.log('\n--- Clicking "CONNECT MODEL FILE" Button ---');
  await evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CONNECT MODEL FILE'));
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  const modalText = await evaluate(`document.body.innerText`);

  const hasModelAlreadyConnected = modalText.includes('MODEL ALREADY CONNECTED');
  const hasYolo11nDeployed = modalText.includes('YOLO11n Thermal (best.pt) is deployed and ready for inference');
  const hasModelsThermalBestPt = modalText.includes('models/thermal/best.pt');
  const hasLoadedVerifiedReady = modalText.includes('Loaded & Verified (READY)');
  const hasNoPending = !modalText.includes('PENDING MODEL DEPLOYMENT');
  const hasNoBackendModels = !modalText.includes('backend/models/best.pt');
  const hasNoPreviewDemoMissing = !modalText.includes('preview / demo mode until trained');

  console.log('✓ "MODEL ALREADY CONNECTED" banner present:', hasModelAlreadyConnected);
  console.log('✓ "YOLO11n Thermal (best.pt) is deployed and ready for inference" present:', hasYolo11nDeployed);
  console.log('✓ Real model path "models/thermal/best.pt" present:', hasModelsThermalBestPt);
  console.log('✓ "Loaded & Verified (READY)" present:', hasLoadedVerifiedReady);
  console.log('✓ No "PENDING MODEL DEPLOYMENT" present:', hasNoPending);
  console.log('✓ No "backend/models/best.pt" present:', hasNoBackendModels);
  console.log('✓ No "preview / demo mode until trained" present:', hasNoPreviewDemoMissing);

  browserProcess.kill();

  if (
    hasModelAlreadyConnected &&
    hasYolo11nDeployed &&
    hasModelsThermalBestPt &&
    hasLoadedVerifiedReady &&
    hasNoPending &&
    hasNoBackendModels &&
    hasNoPreviewDemoMissing
  ) {
    console.log('\n=================================================================');
    console.log('>>> MODAL VERIFICATION PASSED PERFECTLY! <<<');
    console.log('=================================================================');
    process.exit(0);
  } else {
    console.error('FAILED modal verification checks!');
    process.exit(1);
  }
}

runModalVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
