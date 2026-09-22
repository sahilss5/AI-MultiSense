const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function run() {
  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9235',
    '--no-sandbox',
    '--window-size=1440,900',
    APP_URL,
  ]);

  try {
    await new Promise((r) => setTimeout(r, 2000));
    const targets = await getJson('http://127.0.0.1:9235/json/list');
    const pageTarget = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let idCounter = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idCounter++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((r) => (ws.onopen = r));
    await send('Page.enable');
    await send('Runtime.enable');

    await new Promise((r) => setTimeout(r, 2000));
    await send('Runtime.evaluate', {
      expression: `(() => {
        const enter = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const target = asideBtns.find(b =>
          (b.getAttribute('data-page-id') && b.getAttribute('data-page-id').toLowerCase() === 'live') ||
          (b.innerText && b.innerText.toLowerCase().includes('live')) ||
          (b.getAttribute('title') && b.getAttribute('title').toLowerCase().includes('live'))
        );
        if (target) target.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    const base64Data = videoBuffer.toString('base64');

    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const b64 = "${base64Data}";
          const byteCharacters = atob(b64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const file = new File([new Blob([byteArray], { type: 'video/mp4' })], 'thermal_exam_demo_20s.mp4', { type: 'video/mp4' });

          const input = document.querySelector('input[type="file"]');
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `,
      awaitPromise: true,
    });

    console.log('Waiting 3.5s for upload...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('Starting detection...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.textContent && b.textContent.includes('START'));
        if (startBtn) startBtn.click();
      })()`,
    });

    const recordedActivityEvents = new Set();
    const recordedTargetClasses = new Set();

    for (let i = 0; i < 22; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const allTextNodes = Array.from(document.querySelectorAll('*'))
            .map(el => el.textContent ? el.textContent.trim() : '');

          const activities = allTextNodes.filter(t => (t.includes('TRACKED') || t.includes('DETECTED')) && t.length < 80);
          const targetBadges = allTextNodes.filter(t => ['PERSON', 'VEHICLE', 'ANIMAL', 'DRONE', 'PERSON_WITH_BAG'].includes(t));

          return { activities, targetBadges };
        })()`,
        returnByValue: true,
      });

      if (res.result.value) {
        res.result.value.activities.forEach(a => recordedActivityEvents.add(a));
        res.result.value.targetBadges.forEach(b => recordedTargetClasses.add(b));
      }
    }

    console.log('====================================================');
    console.log('VERIFIED FRONTEND ACTIVITY STREAM DETECTIONS:');
    console.log('====================================================');
    const sortedActs = Array.from(recordedActivityEvents).sort();
    sortedActs.forEach(a => console.log('  -', a));

    console.log('\n====================================================');
    console.log('VERIFIED FRONTEND TARGET CLASSES:');
    console.log('====================================================');
    Array.from(recordedTargetClasses).forEach(c => console.log('  ✓', c));

    ws.close();
  } finally {
    browserProcess.kill();
  }
}

run();
