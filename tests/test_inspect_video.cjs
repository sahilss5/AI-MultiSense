const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Starting Edge browser...');
  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  try {
    await new Promise(r => setTimeout(r, 2000));
    let wsUrl = null;
    for (let i = 0; i < 15; i++) {
      try {
        const targets = await getJson('http://127.0.0.1:9224/json/list');
        const pageTarget = targets.find(t => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!wsUrl) throw new Error('Could not connect to Edge debugger');

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

    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    console.log('Entering Command Center...');
    await new Promise(r => setTimeout(r, 2000));
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1500));

    console.log('Navigating to Live Surveillance...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const target = asideBtns.find(b => 
          (b.getAttribute('data-page-id') && b.getAttribute('data-page-id').toLowerCase() === 'live') ||
          (b.innerText && b.innerText.toLowerCase().includes('live')) ||
          (b.getAttribute('title') && b.getAttribute('title').toLowerCase().includes('live'))
        );
        if (target) target.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 2000));

    // Evaluate initial state of video element in Live Surveillance
    const initialVideoState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        const c = document.querySelector('canvas');
        return {
          hasVideo: !!v,
          videoSrc: v ? v.src : null,
          videoCurrentSrc: v ? v.currentSrc : null,
          readyState: v ? v.readyState : null,
          videoWidth: v ? v.videoWidth : null,
          videoHeight: v ? v.videoHeight : null,
          duration: v ? v.duration : null,
          paused: v ? v.paused : null,
          error: v && v.error ? { code: v.error.code, message: v.error.message } : null,
          hasCanvas: !!c,
          canvasWidth: c ? c.width : null,
          canvasHeight: c ? c.height : null,
          videoComputedStyle: v ? {
            display: window.getComputedStyle(v).display,
            visibility: window.getComputedStyle(v).visibility,
            opacity: window.getComputedStyle(v).opacity,
            position: window.getComputedStyle(v).position,
            width: window.getComputedStyle(v).width,
            height: window.getComputedStyle(v).height,
            top: window.getComputedStyle(v).top,
            left: window.getComputedStyle(v).left,
            zIndex: window.getComputedStyle(v).zIndex
          } : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Initial Video State in Live Surveillance:', JSON.stringify(initialVideoState.result.value, null, 2));

    // Check if test video file exists
    console.log('Checking test video at:', TEST_VIDEO);
    const videoExists = fs.existsSync(TEST_VIDEO);
    console.log('Test video exists:', videoExists);

    if (videoExists) {
      console.log('Uploading test video via File / DataTransfer...');
      const videoBuffer = fs.readFileSync(TEST_VIDEO);
      const base64Data = videoBuffer.toString('base64');

      const uploadEval = await send('Runtime.evaluate', {
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
            if (!input) return { error: 'File input not found' };

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));

            return { success: true, filename: file.name, size: file.size };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Upload evaluated:', JSON.stringify(uploadEval.result.value, null, 2));

      console.log('Waiting 3 seconds for upload & state update...');
      await new Promise(r => setTimeout(r, 3000));

        const postUploadVideoState = await send('Runtime.evaluate', {
          expression: `(() => {
            const v = document.querySelector('video');
            const c = document.querySelector('canvas');
            return {
              hasVideo: !!v,
              videoSrc: v ? v.src : null,
              videoCurrentSrc: v ? v.currentSrc : null,
              readyState: v ? v.readyState : null,
              videoWidth: v ? v.videoWidth : null,
              videoHeight: v ? v.videoHeight : null,
              duration: v ? v.duration : null,
              paused: v ? v.paused : null,
              error: v && v.error ? { code: v.error.code, message: v.error.message } : null,
              canvasWidth: c ? c.width : null,
              canvasHeight: c ? c.height : null
            };
          })()`,
          returnByValue: true
        });
        console.log('Post Upload Video State:', JSON.stringify(postUploadVideoState.result.value, null, 2));

        // Click Start AI Detection button
        console.log('Clicking START AI DETECTION button...');
        await send('Runtime.evaluate', {
          expression: `(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const startBtn = btns.find(b => b.textContent && b.textContent.includes('START'));
            if (startBtn) {
              startBtn.click();
              return 'Clicked START: ' + startBtn.textContent.trim();
            }
            return 'START button not found';
          })()`
        });

        console.log('Waiting 5 seconds during detection...');
        await new Promise(r => setTimeout(r, 5000));

        const runningVideoState = await send('Runtime.evaluate', {
          expression: `(() => {
            const v = document.querySelector('video');
            const c = document.querySelector('canvas');
            // Test if canvas has non-dark pixels or tactical pixels
            let pixelSample = null;
            if (c) {
              const ctx = c.getContext('2d');
              if (ctx) {
                const imgData = ctx.getImageData(c.width / 2, c.height / 2, 5, 5);
                pixelSample = Array.from(imgData.data.slice(0, 20));
              }
            }
            return {
              hasVideo: !!v,
              videoSrc: v ? v.src : null,
              readyState: v ? v.readyState : null,
              currentTime: v ? v.currentTime : null,
              videoWidth: v ? v.videoWidth : null,
              videoHeight: v ? v.videoHeight : null,
              duration: v ? v.duration : null,
              paused: v ? v.paused : null,
              error: v && v.error ? { code: v.error.code, message: v.error.message } : null,
              pixelSample
            };
          })()`,
          returnByValue: true
        });
        console.log('Running Video State:', JSON.stringify(runningVideoState.result.value, null, 2));
      }

      ws.close();
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    browserProcess.kill();
  }
}

run();
