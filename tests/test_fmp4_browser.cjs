const http = require('http');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function test() {
  const p = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    'http://127.0.0.1:5173'
  ]);
  try {
    await new Promise(r => setTimeout(r, 2000));
    const list = await getJson('http://127.0.0.1:9227/json/list');
    const pageTarget = list.find(t => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const send = (method, params = {}) => new Promise(res => {
      const curId = id++;
      const handler = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === curId) {
          ws.removeEventListener('message', handler);
          res(m.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, curId, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');

    const evalRes = await send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const v = document.createElement('video');
          v.crossOrigin = 'anonymous';
          v.src = 'http://127.0.0.1:8000/api/video/file/vid_b5f10fb4';
          v.addEventListener('loadeddata', () => {
            resolve({ success: true, readyState: v.readyState, width: v.videoWidth, height: v.videoHeight });
          });
          v.addEventListener('error', () => {
            resolve({ success: false, error: v.error ? { code: v.error.code, message: v.error.message } : 'unknown' });
          });
          document.body.appendChild(v);
          v.load();
          setTimeout(() => resolve({ timeout: true, readyState: v.readyState, error: v.error ? { code: v.error.code, message: v.error.message } : null }), 5000);
        })
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Result with crossOrigin anonymous from http://127.0.0.1:5173:', JSON.stringify(evalRes.result.value, null, 2));
    ws.close();
  } finally {
    p.kill();
  }
}
test();
