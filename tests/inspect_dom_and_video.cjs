const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- STARTING CDP DOM & VIDEO DEEP INSPECTION ---');
  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
    const list = await getJson('http://127.0.0.1:9228/json/list');
    const pageTarget = list.find(t => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(m.error); else res(m.result);
      }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const curId = id++;
      pending.set(curId, { res, rej });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    console.log('[1] Entering Command Center...');
    await new Promise(r => setTimeout(r, 2000));
    await send('Runtime.evaluate', {
      expression: `(() => {
        const enter = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1500));

    console.log('[2] Navigating to Live Surveillance...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const asideBtn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent && b.textContent.includes('Live Surveillance'));
        if (asideBtn) asideBtn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 2500));

    console.log('[3] Inspecting DOM BEFORE new upload (with whatever session currently exists)...');
    const beforeState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        const c = document.querySelector('canvas');
        const vRect = v ? v.getBoundingClientRect() : null;
        const cRect = c ? c.getBoundingClientRect() : null;
        const vStyle = v ? window.getComputedStyle(v) : null;
        const cStyle = c ? window.getComputedStyle(c) : null;
        
        // Element at center of viewport
        let centerElemTag = null;
        let centerElemClass = null;
        if (cRect) {
          const el = document.elementFromPoint(cRect.left + cRect.width / 2, cRect.top + cRect.height / 2);
          if (el) {
            centerElemTag = el.tagName;
            centerElemClass = el.className;
          }
        }

        return {
          video: v ? {
            src: v.src,
            currentSrc: v.currentSrc,
            readyState: v.readyState,
            networkState: v.networkState,
            duration: v.duration,
            currentTime: v.currentTime,
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            paused: v.paused,
            ended: v.ended,
            autoplay: v.autoplay,
            muted: v.muted,
            error: v.error ? { code: v.error.code, message: v.error.message } : null,
            rect: vRect ? { width: vRect.width, height: vRect.height, top: vRect.top, left: vRect.left } : null,
            style: vStyle ? {
              display: vStyle.display,
              visibility: vStyle.visibility,
              opacity: vStyle.opacity,
              position: vStyle.position,
              zIndex: vStyle.zIndex,
              objectFit: vStyle.objectFit
            } : null
          } : null,
          canvas: c ? {
            width: c.width,
            height: c.height,
            rect: cRect ? { width: cRect.width, height: cRect.height, top: cRect.top, left: cRect.left } : null,
            style: cStyle ? {
              display: cStyle.display,
              visibility: cStyle.visibility,
              opacity: cStyle.opacity,
              position: cStyle.position,
              zIndex: cStyle.zIndex
            } : null
          } : null,
          elementFromPointAtCenter: {
            tag: centerElemTag,
            class: centerElemClass
          }
        };
      })()`,
      returnByValue: true
    });
    console.log('BEFORE UPLOAD DOM STATE:\n', JSON.stringify(beforeState.result.value, null, 2));

    console.log('\n[4] Uploading test video via file picker (thermal_exam_demo_20s.mp4)...');
    const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    const base64Data = videoBuffer.toString('base64');
    await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const b64 = "${base64Data}";
          const byteCharacters = atob(b64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'video/mp4' });
          const file = new File([blob], 'thermal_exam_demo_20s.mp4', { type: 'video/mp4' });

          const input = document.querySelector('input[type="file"]');
          if (!input) return;
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        })()
      `,
      awaitPromise: true
    });

    console.log('Waiting 3.5s for video upload...');
    await new Promise(r => setTimeout(r, 3500));

    console.log('[5] Inspecting DOM in READY STATE (before starting)...');
    const readyState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        const c = document.querySelector('canvas');
        const vRect = v ? v.getBoundingClientRect() : null;
        const cRect = c ? c.getBoundingClientRect() : null;
        const vStyle = v ? window.getComputedStyle(v) : null;
        const cStyle = c ? window.getComputedStyle(c) : null;

        let centerElemTag = null;
        let centerElemClass = null;
        if (cRect) {
          const el = document.elementFromPoint(cRect.left + cRect.width / 2, cRect.top + cRect.height / 2);
          if (el) {
            centerElemTag = el.tagName;
            centerElemClass = el.className;
          }
        }

        return {
          video: v ? {
            src: v.src,
            currentSrc: v.currentSrc,
            readyState: v.readyState,
            networkState: v.networkState,
            duration: v.duration,
            currentTime: v.currentTime,
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            paused: v.paused,
            error: v.error ? { code: v.error.code, message: v.error.message } : null,
            rect: vRect ? { width: vRect.width, height: vRect.height, top: vRect.top, left: vRect.left } : null,
            style: vStyle ? {
              display: vStyle.display,
              visibility: vStyle.visibility,
              opacity: vStyle.opacity,
              position: vStyle.position,
              zIndex: vStyle.zIndex,
              objectFit: vStyle.objectFit
            } : null
          } : null,
          canvas: c ? {
            width: c.width,
            height: c.height,
            rect: cRect ? { width: cRect.width, height: cRect.height } : null,
            style: cStyle ? {
              display: cStyle.display,
              visibility: cStyle.visibility,
              opacity: cStyle.opacity,
              position: cStyle.position,
              zIndex: cStyle.zIndex
            } : null
          } : null,
          elementFromPointAtCenter: {
            tag: centerElemTag,
            class: centerElemClass
          }
        };
      })()`,
      returnByValue: true
    });
    console.log('READY STATE DOM STATE:\n', JSON.stringify(readyState.result.value, null, 2));

    console.log('\n[6] Clicking START AI DETECTION...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START'));
        if (startBtn) startBtn.click();
      })()`
    });

    console.log('Waiting 3s for playback to start...');
    await new Promise(r => setTimeout(r, 3000));

    // Test currentTime twice
    const t1 = await send('Runtime.evaluate', { expression: `document.querySelector('video').currentTime`, returnByValue: true });
    await new Promise(r => setTimeout(r, 2000));
    const t2 = await send('Runtime.evaluate', { expression: `document.querySelector('video').currentTime`, returnByValue: true });

    console.log(`currentTime check: t1 = ${t1.result.value}s, t2 = ${t2.result.value}s (delta = ${(t2.result.value - t1.result.value).toFixed(2)}s)`);

    console.log('\n[7] Testing canvas pixel samples at center...');
    const pixelCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const c = document.querySelector('canvas');
        if (!c) return null;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        const img = ctx.getImageData(c.width / 2, c.height / 2, 5, 5);
        return Array.from(img.data.slice(0, 20));
      })()`,
      returnByValue: true
    });
    console.log('Canvas Center Pixels (RGBA 5px):', JSON.stringify(pixelCheck.result.value));

    ws.close();
  } catch (err) {
    console.error('Error during deep inspection:', err);
  } finally {
    browserProcess.kill();
  }
}

run();
