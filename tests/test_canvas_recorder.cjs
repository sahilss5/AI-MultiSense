const { spawn } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';

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
    '--remote-debugging-port=9230',
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

    const ws = new WebSocket(wsUrl);
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

    // Test MediaRecorder on offscreen canvas
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        try {
          const c = document.createElement('canvas');
          c.width = 480;
          c.height = 640;
          const ctx = c.getContext('2d');
          ctx.fillStyle = 'red';
          ctx.fillRect(0, 0, 480, 640);
          const stream = c.captureStream(30);
          const tracks = stream.getVideoTracks();
          const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
          rec.start();
          const state = rec.state;
          rec.stop();
          return { success: true, tracks: tracks.length, state };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()`,
      returnByValue: true
    });
    console.log('Offscreen canvas test result:', res.result.value);

  } finally {
    try { browserProcess.kill('SIGKILL'); } catch (e) {}
  }
}
run();
