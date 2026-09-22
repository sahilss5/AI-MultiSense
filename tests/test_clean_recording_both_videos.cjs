const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const PORTRAIT_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\IMG_3394_grayscale.mp4';
const LANDSCAPE_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

const OUT_PORTRAIT = path.join(__dirname, 'output_clean_portrait.webm');
const OUT_LANDSCAPE = path.join(__dirname, 'output_clean_landscape.webm');

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
  console.log('TESTING CLEAN DEDICATED SURVEILLANCE RECORDING (PORTRAIT & LANDSCAPE)');
  console.log('=============================================================');

  if (!fs.existsSync(PORTRAIT_VIDEO_PATH)) {
    throw new Error(`Portrait video not found at: ${PORTRAIT_VIDEO_PATH}`);
  }
  if (!fs.existsSync(LANDSCAPE_VIDEO_PATH)) {
    throw new Error(`Landscape video not found at: ${LANDSCAPE_VIDEO_PATH}`);
  }

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9228',
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
        const targets = await getJson('http://127.0.0.1:9228/json/list');
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

    // Hook download trigger
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
                const reader = new FileReader();
                reader.onload = function() {
                  window.__recordedDownloads.push({
                    filename: downloadName,
                    size: blob.size,
                    type: blob.type,
                    b64: reader.result.split(',')[1]
                  });
                };
                reader.readAsDataURL(blob);
              });
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

    // Helper to wait for a downloaded recording
    async function waitForDownload(expectedIndex) {
      for (let w = 0; w < 16; w++) {
        const check = await send('Runtime.evaluate', {
          expression: `(() => {
            if (window.__recordedDownloads && window.__recordedDownloads.length > ${expectedIndex}) {
              const d = window.__recordedDownloads[${expectedIndex}];
              return d && d.b64 ? { filename: d.filename, size: d.size, type: d.type, b64: d.b64 } : null;
            }
            return null;
          })()`,
          returnByValue: true,
        });
        if (check.result.value) return check.result.value;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`Timeout waiting for download index ${expectedIndex}`);
    }

    // -------------------------------------------------------------------------
    // TEST 1: PORTRAIT VIDEO (IMG_3394_grayscale.mp4, 480 × 640)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Uploading PORTRAIT video (IMG_3394_grayscale.mp4: 480 × 640)...');
    await uploadVideoFile(PORTRAIT_VIDEO_PATH, 'IMG_3394_grayscale.mp4');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('[TEST 1] Starting AI detection on portrait video...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 3500));

    console.log('[TEST 1] Clicking RECORD to capture clean portrait surveillance video...');
    const click1 = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => (b.title && b.title.includes('Record')) || (b.innerText && b.innerText.includes('RECORD')));
        if (recBtn) {
          recBtn.click();
          return { clicked: true, text: recBtn.innerText };
        }
        return { clicked: false, available: btns.map(b => b.innerText) };
      })()`,
      returnByValue: true,
    });
    console.log('[TEST 1] Click record result:', JSON.stringify(click1.result.value));

    console.log('[TEST 1] Recording for 6 seconds...');
    for (let s = 1; s <= 6; s++) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await send('Runtime.evaluate', {
        expression: `(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const recBtn = btns.find(b => (b.title && b.title.includes('stop recording')) || (b.innerText && b.innerText.includes('STOP RECORDING')));
          return recBtn ? recBtn.innerText.trim() : 'NOT_RECORDING';
        })()`,
        returnByValue: true,
      });
      console.log(`  -> Portrait recording second ${s}/6: ${status.result.value}`);
    }

    console.log('[TEST 1] Stopping recording...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => (b.title && b.title.includes('stop recording')) || (b.innerText && b.innerText.includes('STOP RECORDING')));
        if (recBtn) recBtn.click();
      })()`,
    });

    console.log('[TEST 1] Waiting for portrait video download...');
    const portraitDownload = await waitForDownload(0);
    console.log(`Portrait Download Captured: ${portraitDownload.filename}, size: ${portraitDownload.size} bytes (${(portraitDownload.size / 1024).toFixed(1)} KB), type: ${portraitDownload.type}`);
    fs.writeFileSync(OUT_PORTRAIT, Buffer.from(portraitDownload.b64, 'base64'));
    console.log(`Saved portrait recording to: ${OUT_PORTRAIT}`);

    // -------------------------------------------------------------------------
    // TEST 2: LANDSCAPE VIDEO (thermal_exam_demo_20s.mp4, 640 × 512)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Clearing video...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        if (clearBtn) clearBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));

    console.log('[TEST 2] Uploading LANDSCAPE video (thermal_exam_demo_20s.mp4: 640 × 512)...');
    await uploadVideoFile(LANDSCAPE_VIDEO_PATH, 'thermal_exam_demo_20s.mp4');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('[TEST 2] Starting AI detection on landscape video...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 3500));

    console.log('[TEST 2] Clicking RECORD to capture clean landscape surveillance video...');
    const click2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => (b.title && b.title.includes('Record')) || (b.innerText && b.innerText.includes('RECORD')));
        if (recBtn) {
          recBtn.click();
          return { clicked: true, text: recBtn.innerText };
        }
        return { clicked: false, available: btns.map(b => b.innerText) };
      })()`,
      returnByValue: true,
    });
    console.log('[TEST 2] Click record result:', JSON.stringify(click2.result.value));

    console.log('[TEST 2] Recording for 6 seconds...');
    for (let s = 1; s <= 6; s++) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await send('Runtime.evaluate', {
        expression: `(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const recBtn = btns.find(b => (b.title && b.title.includes('stop recording')) || (b.innerText && b.innerText.includes('STOP RECORDING')));
          return recBtn ? recBtn.innerText.trim() : 'NOT_RECORDING';
        })()`,
        returnByValue: true,
      });
      console.log(`  -> Landscape recording second ${s}/6: ${status.result.value}`);
    }

    console.log('[TEST 2] Stopping recording...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => (b.title && b.title.includes('stop recording')) || (b.innerText && b.innerText.includes('STOP RECORDING')));
        if (recBtn) recBtn.click();
      })()`,
    });

    console.log('[TEST 2] Waiting for landscape video download...');
    const landscapeDownload = await waitForDownload(1);
    console.log(`Landscape Download Captured: ${landscapeDownload.filename}, size: ${landscapeDownload.size} bytes (${(landscapeDownload.size / 1024).toFixed(1)} KB), type: ${landscapeDownload.type}`);
    fs.writeFileSync(OUT_LANDSCAPE, Buffer.from(landscapeDownload.b64, 'base64'));
    console.log(`Saved landscape recording to: ${OUT_LANDSCAPE}`);

    console.log(`\nTotal console errors during entire test run: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors);
    }

    console.log('=============================================================');
    console.log('ALL BROWSER RECORDING STEPS COMPLETED SUCCESSFULLY!');
    console.log('=============================================================');

    return {
      success: true,
      portrait: {
        filename: portraitDownload.filename,
        size: portraitDownload.size,
        path: OUT_PORTRAIT
      },
      landscape: {
        filename: landscapeDownload.filename,
        size: landscapeDownload.size,
        path: OUT_LANDSCAPE
      },
      consoleErrors: consoleErrors.length
    };
  } finally {
    try { browserProcess.kill('SIGKILL'); } catch (e) {}
  }
}

run()
  .then((res) => {
    console.log('RESULT_JSON:', JSON.stringify(res));
    process.exit(0);
  })
  .catch((err) => {
    console.error('TEST ERROR:', err);
    process.exit(1);
  });
