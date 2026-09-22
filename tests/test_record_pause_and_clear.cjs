const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
  console.log('TESTING RECORD: PAUSE/RESUME, MULTIPLE RUNS & CLEAR VIDEO');
  console.log('=============================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9227',
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
        const targets = await getJson('http://127.0.0.1:9227/json/list');
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

    // Hook downloads
    await send('Runtime.evaluate', {
      expression: `(() => {
        window.__recordedDownloads = [];
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
          if (this.download && this.download.startsWith('AI-MULTISENSE_Record_')) {
            const downloadName = this.download;
            const blobUrl = this.href;
            fetch(blobUrl)
              .then(r => r.blob())
              .then(blob => {
                window.__recordedDownloads.push({
                  filename: downloadName,
                  size: blob.size,
                  type: blob.type
                });
              });
          }
          return origClick.apply(this, arguments);
        };
      })()`,
    });

    console.log('[STEP 2] Uploading video and starting AI detection...');
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
          const blob = new Blob([byteArray], { type: 'video/mp4' });
          const file = new File([blob], 'thermal_exam_demo_20s.mp4', { type: 'video/mp4' });

          const input = document.querySelector('input[type="file"]');
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

    await new Promise((r) => setTimeout(r, 3500));

    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()`,
    });

    await new Promise((r) => setTimeout(r, 3000));

    console.log('[STEP 3] Test Scenario A: Recording during PAUSE and RESUME...');
    // Click RECORD
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && b.innerText.trim() === 'RECORD');
        if (recBtn) recBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Click PAUSE
    console.log('Pausing playback during active recording...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const pauseBtn = btns.find(b => b.innerText && b.innerText.includes('PAUSE'));
        if (pauseBtn) pauseBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));

    // Click RESUME
    console.log('Resuming playback during active recording...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const resumeBtn = btns.find(b => b.innerText && b.innerText.includes('RESUME'));
        if (resumeBtn) resumeBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));

    // Click STOP RECORDING
    console.log('Stopping recording after pause/resume cycle...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && b.innerText.includes('STOP RECORDING'));
        if (recBtn) recBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));

    console.log('[STEP 4] Test Scenario B: CLEAR VIDEO while recording is active...');
    // Click RECORD again
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && b.innerText.trim() === 'RECORD');
        if (recBtn) recBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Click CLEAR VIDEO
    console.log('Clicking CLEAR VIDEO while recording is running...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        if (clearBtn) clearBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 3000));

    // Inspect downloaded records count and sizes
    const downloadsCheck = await send('Runtime.evaluate', {
      expression: `(() => window.__recordedDownloads || [])()`,
      returnByValue: true,
    });

    const downloads = downloadsCheck.result.value || [];
    console.log(`Total recordings generated across both tests: ${downloads.length}`);
    downloads.forEach((d, idx) => {
      console.log(`  Recording #${idx + 1}: ${d.filename} (${d.size} bytes / ${(d.size / 1024).toFixed(1)} KB, type: ${d.type})`);
      if (d.size <= 0) {
        throw new Error(`FAIL: Recording #${idx + 1} has 0 bytes!`);
      }
    });

    if (downloads.length < 2) {
      throw new Error(`FAIL: Expected at least 2 recordings, got ${downloads.length}`);
    }

    console.log(`Console errors during test: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors);
    }

    console.log('=============================================================');
    console.log('ALL EDGE CASE RECORDING TESTS PASSED!');
    console.log('=============================================================');

    return { success: true, count: downloads.length, downloads };
  } finally {
    try { browserProcess.kill('SIGKILL'); } catch (e) {}
  }
}

run()
  .then((res) => {
    console.log('RESULT:', JSON.stringify(res));
    process.exit(0);
  })
  .catch((err) => {
    console.error('TEST ERROR:', err);
    process.exit(1);
  });
