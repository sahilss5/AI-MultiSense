const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const SNAPSHOTS_DIR = 'D:\\MAJOR_WEB - Copy\\data\\snapshots';
const TEST_VIDEO_PATH = 'D:\\MAJOR_WEB - Copy\\data\\combined_thermal_test.mp4';

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
  console.log('-------------------------------------------------------------');
  console.log('TESTING SNAPSHOT STORAGE FEATURE (END-TO-END)');
  console.log('-------------------------------------------------------------');

  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  // Clear snapshots dir before test to have clean state
  const existingFiles = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
  for (const f of existingFiles) {
    fs.unlinkSync(path.join(SNAPSHOTS_DIR, f));
  }

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

    if (!wsUrl) throw new Error('Could not connect to Edge remote debugging WebSocket');

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

    await new Promise((res) => ws.onopen = res);

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idCounter++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('[1] Connected. Navigating to Live Surveillance...');
    await new Promise(r => setTimeout(r, 2000));

    async function evalCode(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result?.value;
    }

    // Dismiss loading / enter command center
    await evalCode(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
        const enterBtn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enterBtn) enterBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    await evalCode(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Ensure VIDEO FILE mode
    await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const vidBtn = btns.find(b => b.innerText && b.innerText.includes('VIDEO FILE'));
        if (vidBtn) vidBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    console.log('[2] Loading thermal video file...');
    // Read the test video buffer into base64 and create a File in browser
    const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    const videoBase64 = videoBuffer.toString('base64');

    await evalCode(`
      (() => {
        const b64 = "${videoBase64}";
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'video/mp4' });
        const file = new File([blob], 'combined_thermal_test.mp4', { type: 'video/mp4' });

        const input = document.querySelector('input[type="file"]');
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);

    // Wait for video upload & loading
    console.log('[3] Waiting for video element readyState...');
    let isVideoReady = false;
    for (let i = 0; i < 20; i++) {
      const readyState = await evalCode(`
        (() => {
          const v = document.querySelector('video');
          return v ? v.readyState : 0;
        })()
      `);
      if (readyState >= 2) {
        isVideoReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    console.log('Video readyState >= 2:', isVideoReady);

    // Start video playback
    await evalCode(`
      (() => {
        const v = document.querySelector('video');
        if (v) v.play().catch(() => {});
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // TEST A: SNAPSHOT WHILE PLAYING
    console.log('[4] Testing SNAPSHOT while video is PLAYING...');
    await evalCode(`
      (() => {
        const snapBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    let filesOnDisk = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log('Snapshots on disk after playing snapshot:', filesOnDisk);
    if (filesOnDisk.length < 1) {
      throw new Error('No snapshot PNG was created on disk after clicking SNAPSHOT while playing');
    }

    // Verify confirmation toast
    const toastPlaying = await evalCode(`
      (() => {
        return document.body.innerText.includes('FRAME CAPTURED & SAVED');
      })()
    `);
    console.log('Confirmation toast displayed:', toastPlaying);

    // TEST B: MULTIPLE SNAPSHOTS CREATE SEPARATE FILES
    console.log('[5] Testing multiple SNAPSHOT clicks for separate files...');
    await evalCode(`
      (() => {
        const snapBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    filesOnDisk = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log('Snapshots on disk after 2nd click:', filesOnDisk);
    if (filesOnDisk.length < 2) {
      throw new Error('Multiple snapshot clicks did not create separate timestamped files');
    }

    // TEST C: SNAPSHOT WHILE PAUSED
    console.log('[6] Testing SNAPSHOT while video is PAUSED...');
    await evalCode(`
      (() => {
        const v = document.querySelector('video');
        if (v) v.pause();
        const snapBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    filesOnDisk = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log('Snapshots on disk after paused snapshot:', filesOnDisk);
    if (filesOnDisk.length < 3) {
      throw new Error('Snapshot while paused failed to create file');
    }

    // TEST D: SNAPSHOT AFTER CHANGING PLAYBACK SPEED
    console.log('[7] Testing SNAPSHOT after changing PLAYBACK SPEED to 2x...');
    await evalCode(`
      (() => {
        const btn2x = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '2×');
        if (btn2x) btn2x.click();
        const v = document.querySelector('video');
        if (v) v.play().catch(() => {});
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    await evalCode(`
      (() => {
        const snapBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    filesOnDisk = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log('Snapshots on disk after 2x speed snapshot:', filesOnDisk);
    if (filesOnDisk.length < 4) {
      throw new Error('Snapshot after speed change failed to create file');
    }

    // TEST E: PHYSICAL VERIFICATION OF SAVED PNG FILES ON DISK
    console.log('[8] Physically inspecting created PNG files on disk...');
    const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    for (const file of filesOnDisk) {
      const fullPath = path.join(SNAPSHOTS_DIR, file);
      const stat = fs.statSync(fullPath);
      console.log(`  File: ${file} | Size: ${stat.size} bytes`);
      if (stat.size < 1000) {
        throw new Error(`Snapshot file ${file} is suspiciously small: ${stat.size} bytes`);
      }
      const buffer = fs.readFileSync(fullPath);
      if (!buffer.subarray(0, 8).equals(PNG_HEADER)) {
        throw new Error(`Snapshot file ${file} does not have valid PNG header`);
      }
    }
    console.log('All files verified as valid PNG thermal captures on disk!');

    // TEST F: DEMO MODE TEST
    console.log('[9] Testing DEMO MODE snapshot...');
    await evalCode(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('DEMO FEED'));
        if (demoBtn) demoBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    await evalCode(`
      (() => {
        const snapBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    filesOnDisk = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log('Snapshots on disk after Demo Mode capture:', filesOnDisk.length);
    if (filesOnDisk.length < 5) {
      throw new Error('Demo mode snapshot failed to create file on disk');
    }

    console.log('-------------------------------------------------------------');
    console.log('ALL SNAPSHOT STORAGE FEATURE VERIFICATION TESTS PASSED!');
    console.log('-------------------------------------------------------------');

    ws.close();
  } finally {
    browserProcess.kill();
  }
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
