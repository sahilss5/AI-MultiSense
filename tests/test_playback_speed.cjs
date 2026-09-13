const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';

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
  console.log('TESTING PLAYBACK SPEED CONTROL FEATURE');
  console.log('-------------------------------------------------------------');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9223',
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
        const targets = await getJson('http://127.0.0.1:9223/json/list');
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

    console.log('Connected to page. Waiting for DOM load...');
    await new Promise(r => setTimeout(r, 2500));

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

    // Dismiss loading screen / click ENTER COMMAND CENTER
    console.log('Navigating into Live Surveillance...');
    await evalCode(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
        const enterBtn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
        if (enterBtn) enterBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Also trigger key 'l' to ensure Live Surveillance is active
    await evalCode(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Ensure VIDEO FILE mode is selected
    await evalCode(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const vidBtn = btns.find(b => b.innerText && b.innerText.includes('VIDEO FILE'));
        if (vidBtn) vidBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // 1. Check if Live Surveillance page and Playback Speed buttons are rendered
    const speedButtons = await evalCode(`
      Array.from(document.querySelectorAll('button')).filter(b => /^(0\\.25|0\\.5|1|1\\.5|2)×$/.test(b.innerText.trim())).map(b => ({
        text: b.innerText.trim(),
        classes: b.className
      }))
    `);

    console.log(`Found ${speedButtons.length} speed buttons:`, speedButtons.map(s => s.text));
    if (speedButtons.length !== 5) {
      throw new Error(`Expected 5 speed buttons, found ${speedButtons.length}`);
    }

    // 2. Verify default speed is 1x
    const defaultSpeedActive = await evalCode(`
      (() => {
        const btn1x = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '1×');
        return btn1x && btn1x.className.includes('bg-[var(--thermal-cyan)]');
      })()
    `);
    console.log('Default speed is 1× active:', defaultSpeedActive);
    if (!defaultSpeedActive) {
      throw new Error('Default speed was not 1×');
    }

    // 3. Check HTML5 video element's default playbackRate
    const initialRate = await evalCode(`
      (() => {
        const video = document.querySelector('video');
        return video ? video.playbackRate : null;
      })()
    `);
    console.log('Initial video element playbackRate:', initialRate);
    if (initialRate !== 1) {
      throw new Error(`Expected initial video playbackRate 1, got ${initialRate}`);
    }

    // 4. Test clicking each speed: 0.25x, 0.5x, 1x, 1.5x, 2x
    const speeds = ['0.25×', '0.5×', '1×', '1.5×', '2×'];
    const expectedValues = [0.25, 0.5, 1, 1.5, 2];

    for (let i = 0; i < speeds.length; i++) {
      const spdText = speeds[i];
      const expectedVal = expectedValues[i];

      const rateAfterClick = await evalCode(`
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '${spdText}');
          if (btn) btn.click();
          const video = document.querySelector('video');
          return video ? video.playbackRate : null;
        })()
      `);

      console.log(`Clicked ${spdText} -> video.playbackRate = ${rateAfterClick} (expected ${expectedVal})`);
      if (rateAfterClick !== expectedVal) {
        throw new Error(`Expected playbackRate ${expectedVal} after clicking ${spdText}, got ${rateAfterClick}`);
      }

      // Check button style is active
      const isBtnActive = await evalCode(`
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '${spdText}');
          return btn && btn.className.includes('bg-[var(--thermal-cyan)]');
        })()
      `);
      if (!isBtnActive) {
        throw new Error(`Button ${spdText} did not receive active style`);
      }
    }

    // 5. Test paused state: changing speed while paused must NOT start playing
    const pausedCheck = await evalCode(`
      (() => {
        const video = document.querySelector('video');
        if (!video) return { error: 'No video' };
        video.pause();
        const wasPaused = video.paused;
        // Click 0.5x
        const btn05 = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '0.5×');
        if (btn05) btn05.click();
        const isStillPaused = video.paused;
        const currentRate = video.playbackRate;
        return { wasPaused, isStillPaused, currentRate };
      })()
    `);
    console.log('Paused behavior verification:', pausedCheck);
    if (!pausedCheck.isStillPaused) {
      throw new Error('Video automatically started playing when changing speed while paused!');
    }
    if (pausedCheck.currentRate !== 0.5) {
      throw new Error('Video playbackRate was not updated while paused!');
    }

    // 6. Test file selection reset: when a new video is selected, speed resets to 1x
    // First set speed to 2x
    await evalCode(`
      (() => {
        const btn2x = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '2×');
        if (btn2x) btn2x.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 200));

    const rateBeforeReset = await evalCode(`document.querySelector('video')?.playbackRate`);
    console.log('Rate before file selection reset:', rateBeforeReset);

    await evalCode(`
      (() => {
        const input = document.querySelector('input[type="file"]');
        if (input) {
          const file = new File(['dummy thermal test'], 'patrol_01.mp4', { type: 'video/mp4' });
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    const afterFileSelectCheck = await evalCode(`
      (() => {
        const btn1x = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '1×');
        const is1xActive = btn1x && btn1x.className.includes('bg-[var(--thermal-cyan)]');
        const video = document.querySelector('video');
        return { is1xActive, rate: video ? video.playbackRate : null };
      })()
    `);
    console.log('File selection reset verification (speed reset to 1×):', afterFileSelectCheck);
    if (!afterFileSelectCheck.is1xActive || afterFileSelectCheck.rate !== 1) {
      throw new Error(`File selection did not reset speed to 1×: ${JSON.stringify(afterFileSelectCheck)}`);
    }

    // 7. Test restart button reset to 1x
    // First change to 0.25x
    await evalCode(`
      (() => {
        const btn025 = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '0.25×');
        if (btn025) btn025.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 200));

    // Click Restart button (now enabled because video file is loaded)
    await evalCode(`
      (() => {
        const restartBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('RESTART'));
        if (restartBtn) restartBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    const restartCheck = await evalCode(`
      (() => {
        const btn1x = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '1×');
        const is1xActive = btn1x && btn1x.className.includes('bg-[var(--thermal-cyan)]');
        const video = document.querySelector('video');
        return { is1xActive, rate: video ? video.playbackRate : null };
      })()
    `);
    console.log('Restart reset verification (speed reset to 1×):', restartCheck);
    if (!restartCheck.is1xActive || restartCheck.rate !== 1) {
      throw new Error(`Restart did not reset speed to 1×: ${JSON.stringify(restartCheck)}`);
    }

    // 7. Verify visual display, canvas, bounding boxes layer exist
    const canvasCheck = await evalCode(`
      (() => {
        const canvas = document.querySelector('canvas');
        return {
          canvasExists: !!canvas,
          width: canvas ? canvas.width : 0,
          height: canvas ? canvas.height : 0
        };
      })()
    `);
    console.log('Canvas display check:', canvasCheck);
    if (!canvasCheck.canvasExists) {
      throw new Error('Canvas element missing from Live Surveillance view');
    }

    // 8. Verify Demo Mode unaffected
    const demoCheck = await evalCode(`
      (() => {
        const demoBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('DEMO FEED'));
        if (demoBtn) demoBtn.click();
        const canvas = document.querySelector('canvas');
        return { canvasExists: !!canvas };
      })()
    `);
    console.log('Demo mode verification:', demoCheck);
    if (!demoCheck.canvasExists) {
      throw new Error('Demo mode canvas failed');
    }

    console.log('-------------------------------------------------------------');
    console.log('ALL PLAYBACK SPEED CONTROL VERIFICATION TESTS PASSED SUCCESSFULLY!');
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
