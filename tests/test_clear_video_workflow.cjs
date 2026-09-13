const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\MAJOR_WEB - Copy\\data\\combined_thermal_test.mp4';
const SNAPSHOTS_DIR = 'D:\\MAJOR_WEB - Copy\\data\\snapshots';

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
  console.log('TESTING CLEAR/REMOVE UPLOADED VIDEO FEATURE (E2E)');
  console.log('-------------------------------------------------------------');

  const snapshotCountBefore = fs.existsSync(SNAPSHOTS_DIR) ? fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png')).length : 0;

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
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
        const targets = await getJson('http://127.0.0.1:9225/json/list');
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
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
        console.log('    [BROWSER CONSOLE]', text);
      }
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

    console.log('[1] Navigating to Live Surveillance...');
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

    // Enter Command Center and ensure Live Surveillance is active
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
        const btns = Array.from(document.querySelectorAll('button'));
        const vidBtn = btns.find(b => b.innerText && b.innerText.includes('VIDEO FILE'));
        if (vidBtn) vidBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // Initial check: CLEAR VIDEO button should NOT be visible when no video is loaded
    const initialClearBtnVisible = await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return !!btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
      })()
    `);
    console.log('[2] Initial state: CLEAR VIDEO visible:', initialClearBtnVisible);
    if (initialClearBtnVisible) {
      // If a previous video was still loaded from earlier session, click CLEAR VIDEO now to test it
      console.log('Clearing existing video from earlier session...');
      await evalCode(`
        (() => {
          const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
          if (clearBtn) clearBtn.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 1000));
    }

    // Verify initial cleared state
    const cleanState = await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        const text = document.body.innerText;
        return {
          hasClearBtn: !!clearBtn,
          hasNoVideoText: text.includes('NO VIDEO SELECTED')
        };
      })()
    `);
    console.log('[3] Verified clean state without video:', cleanState);
    if (cleanState.hasClearBtn) {
      throw new Error('CLEAR VIDEO button is visible when no video is loaded!');
    }

    // Read test video buffer
    const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    const videoBase64 = videoBuffer.toString('base64');

    // STEP A: Upload VIDEO A
    console.log('[4] Uploading VIDEO A...');
    await evalCode(`
      (() => {
        const b64 = "${videoBase64}";
        const byteChars = atob(b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'video/mp4' });
        const file = new File([blob], 'thermal_patrol_a.mp4', { type: 'video/mp4' });

        const input = document.querySelector('input[type="file"]');
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);

    // Wait until upload finishes and Start button is enabled
    console.log('Waiting for VIDEO A upload to finish...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const isReady = await evalCode(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const startBtn = btns.find(b => b.innerText && (b.innerText.includes('START AI DETECTION') || b.innerText.includes('DETECTION IN PROGRESS')));
          const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
          return !!clearBtn && startBtn && !startBtn.disabled;
        })()
      `);
      if (isReady) break;
    }

    // Verify CLEAR VIDEO button appeared
    const clearBtnAfterUploadA = await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return !!btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
      })()
    `);
    console.log('[5] CLEAR VIDEO visible after VIDEO A uploaded:', clearBtnAfterUploadA);
    if (!clearBtnAfterUploadA) {
      throw new Error('CLEAR VIDEO button did not appear after uploading video!');
    }

    // Change speed to 1.5x
    console.log('[6] Changing speed to 1.5x...');
    await evalCode(`
      (() => {
        const btn15 = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '1.5×');
        if (btn15) btn15.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 300));

    // Start video & AI detection
    console.log('[7] Starting AI Detection on VIDEO A...');
    await evalCode(`
      (() => {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('START AI DETECTION') || b.innerText.includes('DETECTION IN PROGRESS')));
        if (startBtn && !startBtn.disabled) startBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // Pause video
    console.log('[8] Pausing video...');
    await evalCode(`
      (() => {
        const pauseBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('PAUSE'));
        if (pauseBtn) pauseBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // Click CLEAR VIDEO while video is paused
    console.log('[9] Clicking CLEAR VIDEO while paused...');
    const clickInfo = await evalCode(`
      (() => {
        const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        if (!clearBtn) return { found: false };
        const disabled = clearBtn.disabled;
        const className = clearBtn.className;
        clearBtn.click();
        return { found: true, disabled, className };
      })()
    `);
    console.log('[9] Click info:', clickInfo);

    // Wait for clear to take effect
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 300));
      const hasClear = await evalCode(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return !!btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        })()
      `);
      if (!hasClear) break;
    }

    // Verify after CLEAR:
    const afterClearCheck = await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        const btn1x = btns.find(b => b.innerText.trim() === '1×');
        const video = document.querySelector('video');
        const text = document.body.innerText;
        return {
          hasClearBtn: !!clearBtn,
          is1xActive: btn1x && btn1x.className.includes('bg-[var(--thermal-cyan)]'),
          videoSrcCleared: !video || !video.src || video.src === '' || video.src === window.location.href,
          hasNoVideoText: text.includes('NO VIDEO SELECTED'),
        };
      })()
    `);
    console.log('[10] Verification after CLEAR VIDEO:', afterClearCheck);
    if (afterClearCheck.hasClearBtn) {
      throw new Error('CLEAR VIDEO button still visible after clear!');
    }
    if (!afterClearCheck.is1xActive) {
      throw new Error('Playback speed was not reset to 1× after clear!');
    }
    if (!afterClearCheck.videoSrcCleared) {
      throw new Error('Video source was not cleared!');
    }

    // STEP B: Upload VIDEO B
    console.log('[11] Uploading VIDEO B to verify replacement...');
    await evalCode(`
      (() => {
        const b64 = "${videoBase64}";
        const byteChars = atob(b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'video/mp4' });
        const file = new File([blob], 'thermal_patrol_b.mp4', { type: 'video/mp4' });

        const input = document.querySelector('input[type="file"]');
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);

    // Wait until VIDEO B upload finishes and Start button is enabled
    console.log('Waiting for VIDEO B upload to finish...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const isReady = await evalCode(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const startBtn = btns.find(b => b.innerText && (b.innerText.includes('START AI DETECTION') || b.innerText.includes('DETECTION IN PROGRESS')));
          const clearBtn = btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
          return !!clearBtn && startBtn && !startBtn.disabled;
        })()
      `);
      if (isReady) break;
    }

    // Verify CLEAR VIDEO appeared for VIDEO B
    const clearBtnAfterUploadB = await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return !!btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
      })()
    `);
    console.log('[12] CLEAR VIDEO visible for VIDEO B:', clearBtnAfterUploadB);
    if (!clearBtnAfterUploadB) {
      throw new Error('CLEAR VIDEO button did not appear for VIDEO B');
    }

    // Start VIDEO B playback
    console.log('[13] Starting analysis on VIDEO B...');
    await evalCode(`
      (() => {
        const startBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.includes('START AI DETECTION') || b.innerText.includes('DETECTION IN PROGRESS')));
        if (startBtn && !startBtn.disabled) startBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Stop VIDEO B
    console.log('[14] Stopping analysis on VIDEO B...');
    await evalCode(`
      (() => {
        const stopBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('STOP'));
        if (stopBtn && !stopBtn.disabled) stopBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Click CLEAR VIDEO after STOP
    console.log('[15] Clicking CLEAR VIDEO after STOP...');
    await evalCode(`
      (() => {
        const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        if (clearBtn) clearBtn.click();
      })()
    `);

    // Wait for clear to take effect
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 300));
      const hasClear = await evalCode(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return !!btns.find(b => b.innerText && b.innerText.includes('CLEAR VIDEO'));
        })()
      `);
      if (!hasClear) break;
    }

    // Verify snapshots were not deleted
    const snapshotCountAfter = fs.existsSync(SNAPSHOTS_DIR) ? fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.png')).length : 0;
    console.log(`[16] Snapshots count before: ${snapshotCountBefore}, after: ${snapshotCountAfter}`);
    if (snapshotCountAfter < snapshotCountBefore) {
      throw new Error('CLEAR VIDEO deleted snapshots!');
    }

    // Verify Demo Mode still works
    console.log('[17] Verifying Demo Mode...');
    const demoModeOk = await evalCode(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('DEMO FEED'));
        if (demoBtn) demoBtn.click();
        const canvas = document.querySelector('canvas');
        return !!canvas;
      })()
    `);
    console.log('Demo mode operational:', demoModeOk);
    if (!demoModeOk) {
      throw new Error('Demo mode was broken by CLEAR VIDEO');
    }

    console.log('-------------------------------------------------------------');
    console.log('ALL CLEAR/REMOVE UPLOADED VIDEO TESTS PASSED SUCCESSFULLY!');
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
