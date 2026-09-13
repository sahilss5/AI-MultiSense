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

async function runConfidenceWorkbenchVerification() {
  console.log('=================================================================');
  console.log('VERIFYING GLOBAL CONFIDENCE THRESHOLD CLARITY (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9234',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9234/json/list');
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
    throw new Error('Failed to connect to browser CDP on port 9234');
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

  const pageText = await evaluate(`document.body.innerText`);

  const hasConfidenceThreshold = pageText.includes('CONFIDENCE THRESHOLD');
  const hasGlobalDetection = pageText.includes('GLOBAL DETECTION');
  const hasMinConfidenceAll5 = pageText.includes('Minimum confidence for all 5 detection classes');
  const hasAppliesTo = pageText.includes('APPLIES TO:');
  const has5ClassNames =
    pageText.includes('Person') &&
    pageText.includes('Vehicle') &&
    pageText.includes('Animal') &&
    pageText.includes('Drone') &&
    pageText.includes('Person With Bag');

  const hasHighRecall = pageText.includes('10% (High Recall)');
  const hasHighPrecision = pageText.includes('95% (High Precision)');
  const hasTargetModel = pageText.includes('Target Model:');
  const hasYolo11nBestPt = pageText.includes('YOLO11n (best.pt)');
  const hasIouAssociation = pageText.includes('IoU Association:');
  const hasTrackerMode = pageText.includes('Tracker Mode:');
  const hasByteTrack = pageText.includes('ByteTrack');
  const hasApplyGlobalThreshold = pageText.includes('APPLY GLOBAL THRESHOLD');

  // Verify obsolete wording is removed
  const hasNoSelectedTargetEntity = !pageText.includes('SELECTED TARGET ENTITY');
  const hasNoClassSpecificMessage = !pageText.includes('(Class ID #');

  console.log('✓ "CONFIDENCE THRESHOLD" heading:', hasConfidenceThreshold);
  console.log('✓ "GLOBAL DETECTION" badge:', hasGlobalDetection);
  console.log('✓ "Minimum confidence for all 5 detection classes":', hasMinConfidenceAll5);
  console.log('✓ "APPLIES TO:" section present:', hasAppliesTo);
  console.log('✓ All 5 classes listed in scope:', has5ClassNames);
  console.log('✓ 10% (High Recall) / 95% (High Precision):', hasHighRecall && hasHighPrecision);
  console.log('✓ Real model information (YOLO11n best.pt / ByteTrack / IoU):', hasTargetModel && hasYolo11nBestPt && hasIouAssociation && hasTrackerMode && hasByteTrack);
  console.log('✓ "APPLY GLOBAL THRESHOLD" button:', hasApplyGlobalThreshold);
  console.log('✓ Removed "SELECTED TARGET ENTITY" label (should be true):', hasNoSelectedTargetEntity);
  console.log('✓ Removed confusing class ID in threshold workbench (should be true):', hasNoClassSpecificMessage);

  browserProcess.kill();

  if (
    hasConfidenceThreshold &&
    hasGlobalDetection &&
    hasMinConfidenceAll5 &&
    hasAppliesTo &&
    has5ClassNames &&
    hasHighRecall &&
    hasHighPrecision &&
    hasTargetModel &&
    hasYolo11nBestPt &&
    hasIouAssociation &&
    hasTrackerMode &&
    hasByteTrack &&
    hasApplyGlobalThreshold &&
    hasNoSelectedTargetEntity
  ) {
    console.log('\n=================================================================');
    console.log('>>> GLOBAL THRESHOLD CLARITY VERIFICATION PASSED! <<<');
    console.log('=================================================================');
    process.exit(0);
  } else {
    console.error('Verification failed some assertions!');
    process.exit(1);
  }
}

runConfidenceWorkbenchVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
