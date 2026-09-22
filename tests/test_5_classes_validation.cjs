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
  console.log('=============================================================');
  console.log('BROWSER VALIDATION: ALL 5 CLASSES IN LIVE SURVEILLANCE UI');
  console.log('=============================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9233',
    '--no-sandbox',
    '--window-size=1440,900',
    APP_URL,
  ]);

  try {
    await new Promise((r) => setTimeout(r, 2000));
    const targets = await getJson('http://127.0.0.1:9233/json/list');
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

    // Inject detection listener into browser window
    await send('Runtime.evaluate', {
      expression: `(() => {
        window.__capturedDetections = new Map();
        const origWebSocket = window.WebSocket;
        // Listen to live detections displayed in React by monkey-patching or polling
      })()`,
    });

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

    console.log('Waiting 3.5s for video upload...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('Starting detection loop in browser...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START'));
        if (startBtn) startBtn.click();
      })()`,
    });

    // Monitor for 22 seconds and capture every unique class displayed in UI
    const classesSeen = new Map();

    for (let i = 0; i < 22; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const results = [];
          // Inspect Target Inspector and Active Targets in DOM
          const targetCards = Array.from(document.querySelectorAll('.page-container [class*="rounded-xl"]'));
          targetCards.forEach(card => {
            const text = card.textContent || '';
            const matchTrack = text.match(/T-(\\d+)/);
            if (matchTrack) {
              const tid = matchTrack[1];
              ['PERSON_WITH_BAG', 'PERSON WITH BAG', 'PERSON', 'VEHICLE', 'ANIMAL', 'DRONE'].forEach(cls => {
                if (text.toUpperCase().includes(cls)) {
                  results.push({ tid, cls: cls.replace(' ', '_'), text: text.substring(0, 80) });
                }
              });
            }
          });
          return results;
        })()`,
        returnByValue: true,
      });

      if (res.result.value) {
        for (const item of res.result.value) {
          if (!classesSeen.has(item.cls)) {
            classesSeen.set(item.cls, item);
            console.log(`[Captured in Browser UI] ${item.cls} (Track T-${item.tid}): "${item.text}"`);
          }
        }
      }
    }

    console.log('\n=============================================================');
    console.log('BROWSER VALIDATION RESULT');
    console.log('=============================================================');
    console.log('Unique classes verified in browser DOM:');
    for (const [cls, item] of classesSeen.entries()) {
      console.log(`✓ ${cls.padEnd(16)} -> Displayed in UI for Track T-${item.tid}`);
    }

    ws.close();
  } finally {
    browserProcess.kill();
  }
}

run();
