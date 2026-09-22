const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const PORTRAIT_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\IMG_3394_grayscale.mp4';
const LANDSCAPE_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

const OUT_PORTRAIT = path.join(__dirname, 'output_snapshot_portrait.png');
const OUT_LANDSCAPE = path.join(__dirname, 'output_snapshot_landscape.png');

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
  console.log('TESTING AI SURVEILLANCE SNAPSHOT (PORTRAIT & LANDSCAPE)');
  console.log('=============================================================');

  if (!fs.existsSync(PORTRAIT_VIDEO_PATH)) {
    throw new Error(`Portrait video not found at: ${PORTRAIT_VIDEO_PATH}`);
  }
  if (!fs.existsSync(LANDSCAPE_VIDEO_PATH)) {
    throw new Error(`Landscape video not found at: ${LANDSCAPE_VIDEO_PATH}`);
  }

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9230',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  const consoleErrors = [];

  try {
    await new Promise((r) => setTimeout(r, 2000));
    let wsUrl = null;
    for (let i = 0; i < 15; i++) {
      try {
        const targets = await getJson('http://127.0.0.1:9230/json/list');
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!wsUrl) throw new Error('Could not connect to Edge DevTools');

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
        if (msg.params.type === 'error') consoleErrors.push(text);
      }
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
    await send('DOM.enable');

    console.log('[STEP 1] Entering Command Center & Navigating to Live Surveillance...');
    await new Promise((r) => setTimeout(r, 2000));
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const target = asideBtns.find(b =>
          (b.getAttribute('data-page-id') && b.getAttribute('data-page-id').toLowerCase() === 'live') ||
          (b.innerText && b.innerText.toLowerCase().includes('live'))
        );
        if (target) target.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Hook download trigger to intercept snapshots
    await send('Runtime.evaluate', {
      expression: `(() => {
        window.__snapshotDownloads = [];
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
          if (this.download && (this.download.includes('snapshot') || this.download.endsWith('.png'))) {
            const downloadName = this.download;
            const dataUrl = this.href;
            if (dataUrl.startsWith('data:image/png;base64,')) {
              window.__snapshotDownloads.push({
                filename: downloadName,
                b64: dataUrl.split(',')[1]
              });
            }
          }
          return origClick.apply(this, arguments);
        };
      })()`,
    });

    // Helper to upload a video
    async function uploadVideoFile(filePath, fileName) {
      const buffer = fs.readFileSync(filePath);
      const b64 = buffer.toString('base64');
      await send('Runtime.evaluate', {
        expression: `
          (async () => {
            const b64 = "${b64}";
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'video/mp4' });
            const file = new File([blob], '${fileName}', { type: 'video/mp4' });

            const input = document.querySelector('input[type="file"]');
            if (!input) throw new Error('Input element not found');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });
    }

    // Helper to wait for a downloaded snapshot
    async function waitForSnapshot(expectedIndex) {
      for (let w = 0; w < 20; w++) {
        const check = await send('Runtime.evaluate', {
          expression: `(() => {
            if (window.__snapshotDownloads && window.__snapshotDownloads.length > ${expectedIndex}) {
              const d = window.__snapshotDownloads[${expectedIndex}];
              return d && d.b64 ? { filename: d.filename, b64: d.b64 } : null;
            }
            return null;
          })()`,
          returnByValue: true,
        });
        if (check.result.value) return check.result.value;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`Timeout waiting for snapshot download #${expectedIndex}`);
    }

    // =========================================================================
    // TEST A: PORTRAIT VIDEO (IMG_3394_grayscale.mp4 — 480 × 640)
    // =========================================================================
    console.log('\n[TEST A] Uploading Portrait Video: IMG_3394_grayscale.mp4...');
    await uploadVideoFile(PORTRAIT_VIDEO_PATH, 'IMG_3394_grayscale.mp4');
    await new Promise((r) => setTimeout(r, 2000));

    console.log('[TEST A] Starting AI Detection...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b =>
          b.innerText && (b.innerText.includes('START AI DETECTION') || b.innerText.includes('PROCESS FULL VIDEO'))
        );
        if (startBtn) startBtn.click();
      })()`,
    });

    console.log('[TEST A] Waiting for active ByteTrack detections to stabilize...');
    await new Promise((r) => setTimeout(r, 4500));

    console.log('[TEST A] Clicking SNAPSHOT button...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const snapBtn = btns.find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
        else throw new Error('SNAPSHOT button not found');
      })()`,
    });

    console.log('[TEST A] Waiting for portrait snapshot download...');
    const snapA = await waitForSnapshot(0);
    const snapABuffer = Buffer.from(snapA.b64, 'base64');
    fs.writeFileSync(OUT_PORTRAIT, snapABuffer);
    console.log(`✓ Test A Snapshot Captured: ${snapA.filename} (${snapABuffer.length} bytes)`);

    // =========================================================================
    // TEST B: SNAPSHOT WHILE PAUSED
    // =========================================================================
    console.log('\n[TEST B] Pausing feed and taking snapshot while PAUSED...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const pauseBtn = btns.find(b => b.innerText && b.innerText.includes('PAUSE'));
        if (pauseBtn) pauseBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1000));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const snapBtn = btns.find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()`,
    });

    const snapB = await waitForSnapshot(1);
    console.log(`✓ Test B Snapshot (Paused) Captured: ${snapB.filename}`);

    // =========================================================================
    // TEST C: LANDSCAPE VIDEO (thermal_exam_demo_20s.mp4 — 640 × 512)
    // =========================================================================
    console.log('\n[TEST C] Clearing video & uploading Landscape Video: thermal_exam_demo_20s.mp4...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        if (clearBtn) clearBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    await uploadVideoFile(LANDSCAPE_VIDEO_PATH, 'thermal_exam_demo_20s.mp4');
    await new Promise((r) => setTimeout(r, 2000));

    console.log('[TEST C] Starting AI Detection on landscape video...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b =>
          b.innerText && (b.innerText.includes('START AI DETECTION') || b.innerText.includes('PROCESS FULL VIDEO'))
        );
        if (startBtn) startBtn.click();
      })()`,
    });

    console.log('[TEST C] Waiting for detections on landscape video...');
    await new Promise((r) => setTimeout(r, 4500));

    console.log('[TEST C] Clicking SNAPSHOT on Landscape video...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const snapBtn = btns.find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()`,
    });

    console.log('[TEST C] Waiting for landscape snapshot download...');
    const snapC = await waitForSnapshot(2);
    const snapCBuffer = Buffer.from(snapC.b64, 'base64');
    fs.writeFileSync(OUT_LANDSCAPE, snapCBuffer);
    console.log(`✓ Test C Snapshot Captured: ${snapC.filename} (${snapCBuffer.length} bytes)`);

    console.log('\n=============================================================');
    console.log('AI SNAPSHOT BROWSER TESTS ALL PASSED');
    console.log(`Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors);
    }
    console.log('=============================================================');

    ws.close();
  } finally {
    browserProcess.kill();
  }
}

run().catch((err) => {
  console.error('Snapshot E2E test failed:', err);
  process.exit(1);
});
