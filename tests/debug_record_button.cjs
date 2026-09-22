const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const PORTRAIT_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\IMG_3394_grayscale.mp4';

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
    '--remote-debugging-port=9229',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  try {
    await new Promise((r) => setTimeout(r, 2000));
    let wsUrl = null;
    for (let i = 0; i < 15; i++) {
      try {
        const targets = await getJson('http://127.0.0.1:9229/json/list');
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pending = new Map();
    const consoleLogs = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
        consoleLogs.push({ type: msg.params.type, text });
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

    await new Promise((r) => setTimeout(r, 2000));
    // Enter Command Center
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Navigate to Live
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

    // Upload video
    console.log('Uploading video...');
    const buffer = fs.readFileSync(PORTRAIT_VIDEO_PATH);
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
          const file = new File([blob], 'IMG_3394_grayscale.mp4', { type: 'video/mp4' });

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

    // Start AI Detection
    console.log('Starting AI detection...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 3500));

    // Check all buttons and canvases on the page
    const inspection = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText.trim(),
          title: b.title,
          disabled: b.disabled,
          class: b.className
        }));
        const canvases = Array.from(document.querySelectorAll('canvas')).map(c => ({
          width: c.width,
          height: c.height,
          style: c.getAttribute('style'),
          hasCaptureStream: typeof c.captureStream === 'function'
        }));
        const video = document.querySelector('video');
        return {
          buttons: btns,
          canvases: canvases,
          video: video ? {
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            paused: video.paused,
            src: video.src
          } : null
        };
      })()`,
      returnByValue: true,
    });
    console.log('DOM Inspection Result:\n', JSON.stringify(inspection.result.value, null, 2));

    // Try clicking RECORD and see what happens
    console.log('Attempting to click RECORD...');
    const clickRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && b.innerText.includes('RECORD'));
        if (!recBtn) return { error: 'Record button not found' };
        recBtn.click();
        return { clicked: true, text: recBtn.innerText.trim() };
      })()`,
      returnByValue: true,
    });
    console.log('Click Result:\n', JSON.stringify(clickRes.result.value, null, 2));

    await new Promise((r) => setTimeout(r, 1000));
    console.log('Console Logs during run:\n', JSON.stringify(consoleLogs, null, 2));

  } finally {
    try { browserProcess.kill('SIGKILL'); } catch (e) {}
  }
}

run();
