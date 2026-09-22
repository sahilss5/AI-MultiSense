const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const SECOND_VIDEO = 'd:\\MAJOR VERSIONS\\MAJOR_WEB - Copy\\data\\uploads\\vid_b5f10fb4.mp4';

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
  console.log('Testing Clear and Re-upload of another video...');
  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--no-sandbox',
    APP_URL,
  ]);

  try {
    await new Promise((r) => setTimeout(r, 2000));
    const targets = await getJson('http://127.0.0.1:9229/json/list');
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
    // Click Enter Command Center
    await send('Runtime.evaluate', {
      expression: `(() => {
        const enter = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Navigate to Live Surveillance
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

    // Upload second video
    const videoBuffer = fs.readFileSync(SECOND_VIDEO);
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
          const file = new File([new Blob([byteArray], { type: 'video/mp4' })], 'second_video.mp4', { type: 'video/mp4' });

          const input = document.querySelector('input[type="file"]');
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `,
      awaitPromise: true,
    });

    console.log('Waiting for second video upload and load...');
    await new Promise((r) => setTimeout(r, 4000));

    const check = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        return {
          videoFound: !!v,
          src: v ? v.src : null,
          readyState: v ? v.readyState : null,
          width: v ? v.videoWidth : null,
          height: v ? v.videoHeight : null,
          duration: v ? v.duration : null,
          opacity: v ? window.getComputedStyle(v).opacity : null
        };
      })()`,
      returnByValue: true,
    });

    console.log('Second Video State:', JSON.stringify(check.result.value, null, 2));
    const data = check.result.value;
    if (!data.videoFound || data.opacity !== '1' || data.readyState < 2 || data.width <= 0) {
      throw new Error('Second video failed to load properly!');
    }
    console.log('✓ Second video upload verified successfully!');
    ws.close();
  } finally {
    browserProcess.kill();
  }
}

run();
