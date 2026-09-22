const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';
const RECORDING_OUT_PATH = path.join(__dirname, 'test_recording_output.webm');

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
  console.log('E2E TEST: LIVE SURVEILLANCE RECORD BUTTON VERIFICATION');
  console.log('=============================================================');

  if (!fs.existsSync(TEST_VIDEO_PATH)) {
    throw new Error(`Test video not found at: ${TEST_VIDEO_PATH}`);
  }

  // Launch Edge in headless mode with remote debugging
  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  const consoleLogs = [];
  const consoleErrors = [];

  try {
    await new Promise((r) => setTimeout(r, 2000));
    let wsUrl = null;
    for (let i = 0; i < 15; i++) {
      try {
        const targets = await getJson('http://127.0.0.1:9226/json/list');
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!wsUrl) throw new Error('Could not connect to Edge DevTools on port 9226');

    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
        if (msg.params.type === 'error') {
          consoleErrors.push(text);
        } else {
          consoleLogs.push(text);
        }
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

    console.log('[STEP 1] Entering Command Center...');
    await new Promise((r) => setTimeout(r, 2000));
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enter) enter.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));

    console.log('[STEP 2] Navigating to Live Surveillance...');
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

    console.log('[STEP 3] Hooking download trigger to capture recorded surveillance video...');
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

    console.log('[STEP 4] Checking MediaRecorder support in browser context...');
    const supportCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          hasMediaRecorder: typeof MediaRecorder !== 'undefined',
          hasCaptureStream: typeof HTMLCanvasElement.prototype.captureStream !== 'undefined',
          vp9: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
          vp8: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8'),
          webm: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm'),
          mp4: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')
        };
      })()`,
      returnByValue: true,
    });
    console.log('MediaRecorder Support Check:', JSON.stringify(supportCheck.result.value, null, 2));

    console.log('[STEP 5] Uploading test thermal video...');
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
          if (!input) return { error: 'File input element not found' };

          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    console.log('Waiting 3.5s for video upload and setup...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('[STEP 6] Starting AI detection...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
      })()`,
    });

    console.log('Waiting 3.5s for video playback and YOLO11n ByteTrack detections to stabilize...');
    await new Promise((r) => setTimeout(r, 3500));

    // Inspect RECORD button initial state
    const initialButtonState = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && (b.innerText.includes('RECORD') || b.innerText.includes('RECORDING')));
        return recBtn ? {
          found: true,
          text: recBtn.innerText.trim(),
          title: recBtn.getAttribute('title') || '',
          className: recBtn.className
        } : { found: false };
      })()`,
      returnByValue: true,
    });
    console.log('Initial RECORD button state:', JSON.stringify(initialButtonState.result.value));

    if (!initialButtonState.result.value.found || !initialButtonState.result.value.text.includes('RECORD')) {
      throw new Error(`FAIL: RECORD button not in initial RECORD state. Found: ${JSON.stringify(initialButtonState.result.value)}`);
    }

    console.log('[STEP 7] Clicking RECORD to start surveillance recording...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && b.innerText.trim() === 'RECORD');
        if (recBtn) recBtn.click();
      })()`,
    });

    await new Promise((r) => setTimeout(r, 1200));

    // Check button state after starting recording
    const recordingButtonState = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && (b.innerText.includes('STOP RECORDING') || b.innerText.includes('RECORDING')));
        return recBtn ? {
          found: true,
          text: recBtn.innerText.trim(),
          title: recBtn.getAttribute('title') || '',
          className: recBtn.className
        } : { found: false };
      })()`,
      returnByValue: true,
    });
    console.log('Button state during active recording:', JSON.stringify(recordingButtonState.result.value));

    if (!recordingButtonState.result.value.found || !recordingButtonState.result.value.text.includes('STOP RECORDING')) {
      throw new Error(`FAIL: Button state did not change to STOP RECORDING! Found: ${JSON.stringify(recordingButtonState.result.value)}`);
    }

    console.log('[STEP 8] Letting recording run for 5 seconds while video & detections are active...');
    for (let s = 1; s <= 5; s++) {
      await new Promise((r) => setTimeout(r, 1000));
      const midState = await send('Runtime.evaluate', {
        expression: `(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const recBtn = btns.find(b => b.innerText && b.innerText.includes('STOP RECORDING'));
          return recBtn ? recBtn.innerText.trim() : 'NOT_FOUND';
        })()`,
        returnByValue: true,
      });
      console.log(`  -> Recording second ${s}/5, button text: "${midState.result.value}"`);
    }

    console.log('[STEP 9] Clicking STOP RECORDING...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && b.innerText.includes('STOP RECORDING'));
        if (recBtn) recBtn.click();
      })()`,
    });

    console.log('Waiting 2.5s for MediaRecorder onstop to produce Blob and trigger download...');
    await new Promise((r) => setTimeout(r, 2500));

    // Verify button reverted to RECORD
    const stoppedButtonState = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const recBtn = btns.find(b => b.innerText && (b.innerText.trim() === 'RECORD' || b.innerText.includes('RECORDING')));
        return recBtn ? {
          found: true,
          text: recBtn.innerText.trim()
        } : { found: false };
      })()`,
      returnByValue: true,
    });
    console.log('Button state after stopping recording:', JSON.stringify(stoppedButtonState.result.value));

    if (!stoppedButtonState.result.value.found || stoppedButtonState.result.value.text !== 'RECORD') {
      throw new Error(`FAIL: Button did not reset back to RECORD! Text was: ${stoppedButtonState.result.value.text}`);
    }

    // Inspect intercepted downloaded recording
    let blobData = null;
    for (let wait = 0; wait < 10; wait++) {
      const check = await send('Runtime.evaluate', {
        expression: `(() => {
          return window.__recordedDownloads && window.__recordedDownloads.length > 0 ? {
            count: window.__recordedDownloads.length,
            filename: window.__recordedDownloads[0].filename,
            size: window.__recordedDownloads[0].size,
            type: window.__recordedDownloads[0].type,
            hasB64: !!window.__recordedDownloads[0].b64,
            b64: window.__recordedDownloads[0].b64
          } : null;
        })()`,
        returnByValue: true,
      });
      if (check.result.value && check.result.value.hasB64) {
        blobData = check.result.value;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log('[STEP 10] Validating recorded download metadata...');
    if (!blobData || blobData.count === 0 || blobData.size <= 0) {
      throw new Error(`FAIL: Recorded video download is empty or not captured! Data: ${JSON.stringify(blobData)}`);
    }

    console.log('Download count:', blobData.count);
    console.log('Filename:', blobData.filename);
    console.log('Size:', blobData.size, 'bytes', `(${(blobData.size / 1024).toFixed(1)} KB)`);
    console.log('MIME type:', blobData.type);

    // Write file to disk
    if (blobData.hasB64) {
      const vidBuffer = Buffer.from(blobData.b64, 'base64');
      fs.writeFileSync(RECORDING_OUT_PATH, vidBuffer);
      console.log(`Successfully saved recorded video to: ${RECORDING_OUT_PATH} (${vidBuffer.length} bytes)`);
    }

    console.log('[STEP 11] Checking console logs for errors...');
    const reactErrors = consoleErrors.filter((e) => e.includes('React') || e.includes('Uncaught') || e.includes('MediaRecorder'));
    console.log('Console errors captured:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('All console errors:', consoleErrors);
    }
    if (reactErrors.length > 0) {
      throw new Error(`FAIL: Uncaught React/MediaRecorder errors in console: ${JSON.stringify(reactErrors)}`);
    }

    console.log('=============================================================');
    console.log('ALL E2E RECORD BUTTON TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================================');

    return {
      success: true,
      blobSize: blobData.size,
      blobType: blobData.type,
      outputPath: RECORDING_OUT_PATH,
      consoleErrors: consoleErrors.length,
    };
  } finally {
    try {
      browserProcess.kill('SIGKILL');
    } catch (e) {}
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
