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

async function runAIEngineVerification() {
  console.log('=================================================================');
  console.log('AI ENGINE PAGE E2E BROWSER VERIFICATION (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9230',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9230/json/list');
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
    throw new Error('Failed to connect to browser CDP on port 9230');
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

  const bodyText = await evaluate(`document.body.innerText`);

  console.log('\n--- 1. Checking Model Name & File ---');
  const hasYolo11n = bodyText.includes('YOLO11n');
  const hasBestPt = bodyText.includes('best.pt');
  const hasLoadedVerified = bodyText.includes('Loaded & Verified');
  console.log('✓ "YOLO11n" present:', hasYolo11n);
  console.log('✓ "best.pt" present:', hasBestPt);
  console.log('✓ "Loaded & Verified" present:', hasLoadedVerified);

  console.log('\n--- 2. Checking Device Target & Acceleration ---');
  const hasCudaGpu = bodyText.includes('CUDA GPU') || bodyText.includes('CUDA');
  const hasCudaAccelerated = bodyText.includes('CUDA Accelerated');
  const hasNoFP16 = !bodyText.includes('FP16');
  const hasNoTensorRT = !bodyText.includes('TensorRT');
  console.log('✓ CUDA GPU target present:', hasCudaGpu);
  console.log('✓ "CUDA Accelerated" present:', hasCudaAccelerated);
  console.log('✓ No fake "FP16" present:', hasNoFP16);
  console.log('✓ No fake "TensorRT" present:', hasNoTensorRT);

  console.log('\n--- 3. Checking Inference Status ---');
  const hasInferenceStatus = bodyText.includes('INFERENCE STATUS');
  const hasReadyStatus = bodyText.includes('READY');
  const hasStartsWhenVideo = bodyText.includes('Starts when video processing begins');
  const hasNoLiveStandby = !bodyText.includes('Live Standby');
  console.log('✓ "INFERENCE STATUS" present:', hasInferenceStatus);
  console.log('✓ "READY" status present:', hasReadyStatus);
  console.log('✓ "Starts when video processing begins" present:', hasStartsWhenVideo);
  console.log('✓ No fake "Live Standby" present:', hasNoLiveStandby);

  console.log('\n--- 4. Checking Pipeline 6 Stages ---');
  const hasStage1 = bodyText.includes('THERMAL INPUT') && bodyText.includes('Recorded Thermal Video');
  const hasStage2 = bodyText.includes('PREPROCESSING') && bodyText.includes('Image Resize & Normalization');
  const hasStage3 = bodyText.includes('YOLO11n INFERENCE') && bodyText.includes('best.pt Model');
  const hasStage4 = bodyText.includes('5-CLASS DETECTION') && bodyText.includes('Confidence Filtering');
  const hasStage5 = bodyText.includes('BYTETRACK TRACKER') && bodyText.includes('Object ID Tracking');
  const hasStage6 = bodyText.includes('THREAT ENGINE') && bodyText.includes('Threat & Zone Rules');
  console.log('✓ Stage 01 (Recorded Thermal Video):', hasStage1);
  console.log('✓ Stage 02 (Image Resize & Normalization):', hasStage2);
  console.log('✓ Stage 03 (YOLO11n INFERENCE best.pt Model):', hasStage3);
  console.log('✓ Stage 04 (5-CLASS DETECTION Confidence Filtering):', hasStage4);
  console.log('✓ Stage 05 (BYTETRACK TRACKER Object ID Tracking):', hasStage5);
  console.log('✓ Stage 06 (THREAT ENGINE Threat & Zone Rules):', hasStage6);

  console.log('\n--- 5. Checking Input Resolution & Sensor Terminology ---');
  const hasThermalInputRes = bodyText.includes('Thermal Image Input');
  const hasNoFLIR = !bodyText.includes('FLIR');
  const hasNoLWIR = !bodyText.includes('LWIR');
  console.log('✓ "Thermal Image Input" present:', hasThermalInputRes);
  console.log('✓ No "FLIR" sensor claims:', hasNoFLIR);
  console.log('✓ No "LWIR" claims:', hasNoLWIR);

  console.log('\n--- 6. Checking 5 Core Classes & Benchmark mAP@50 Audit ---');
  const hasPerson = bodyText.includes('Person');
  const hasVehicle = bodyText.includes('Vehicle');
  const hasAnimal = bodyText.includes('Animal');
  const hasDrone = bodyText.includes('Drone');
  const hasPersonWithBag = bodyText.includes('Person With Bag');
  const hasNoFakeMap = !bodyText.includes('Benchmark mAP@50');
  const hasThermalTrainedClass = bodyText.includes('Thermal-trained class');
  console.log('✓ 5 Classes present:', { hasPerson, hasVehicle, hasAnimal, hasDrone, hasPersonWithBag });
  console.log('✓ Fake "Benchmark mAP@50" removed:', hasNoFakeMap);
  console.log('✓ Truthful "Thermal-trained class" badge present:', hasThermalTrainedClass);

  console.log('\n--- 7. Checking Confidence Threshold Workbench ---');
  const hasThresholdWorkbench = bodyText.includes('CONFIDENCE THRESHOLD') && bodyText.includes('Controls minimum detection confidence');
  console.log('✓ "CONFIDENCE THRESHOLD" workbench present:', hasThresholdWorkbench);

  browserProcess.kill();

  if (
    hasYolo11n &&
    hasBestPt &&
    hasLoadedVerified &&
    hasCudaAccelerated &&
    hasNoFP16 &&
    hasNoTensorRT &&
    hasInferenceStatus &&
    hasStartsWhenVideo &&
    hasNoLiveStandby &&
    hasStage1 &&
    hasStage2 &&
    hasStage3 &&
    hasStage4 &&
    hasStage5 &&
    hasStage6 &&
    hasThermalInputRes &&
    hasNoFLIR &&
    hasNoLWIR &&
    hasNoFakeMap &&
    hasThermalTrainedClass &&
    hasThresholdWorkbench
  ) {
    console.log('\n=================================================================');
    console.log('>>> ALL AI ENGINE VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<');
    console.log('=================================================================');
    process.exit(0);
  } else {
    console.error('FAILED some checks!');
    process.exit(1);
  }
}

runAIEngineVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
