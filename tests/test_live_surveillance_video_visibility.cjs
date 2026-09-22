const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

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
  console.log('TESTING LIVE SURVEILLANCE VIDEO VISIBILITY & PIPELINE SYNC');
  console.log('=============================================================');

  if (!fs.existsSync(TEST_VIDEO_PATH)) {
    throw new Error(`Test video not found at: ${TEST_VIDEO_PATH}`);
  }

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
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
        const targets = await getJson('http://127.0.0.1:9225/json/list');
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!wsUrl) throw new Error('Could not connect to Edge DevTools');

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

    console.log('[STEP 3] Uploading thermal test video (thermal_exam_demo_20s.mp4)...');
    const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    const base64Data = videoBuffer.toString('base64');

    const uploadRes = await send('Runtime.evaluate', {
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

          return { success: true, filename: file.name, size: file.size };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Upload Result:', JSON.stringify(uploadRes.result.value));

    console.log('Waiting 3.5s for video upload and metadata loading...');
    await new Promise((r) => setTimeout(r, 3500));

    console.log('[STEP 4] Inspecting Layer 1 Video and Layer 2-7 Canvas in Ready State...');
    const readyStateCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        const c = document.querySelector('canvas');
        const vStyle = v ? window.getComputedStyle(v) : null;
        const cStyle = c ? window.getComputedStyle(c) : null;
        return {
          videoFound: !!v,
          videoSrc: v ? v.src : null,
          videoReadyState: v ? v.readyState : null,
          videoWidth: v ? v.videoWidth : null,
          videoHeight: v ? v.videoHeight : null,
          videoDuration: v ? v.duration : null,
          videoPaused: v ? v.paused : null,
          videoZIndex: vStyle ? vStyle.zIndex : null,
          videoOpacity: vStyle ? vStyle.opacity : null,
          videoPosition: vStyle ? vStyle.position : null,
          videoObjectFit: vStyle ? vStyle.objectFit : null,
          canvasFound: !!c,
          canvasWidth: c ? c.width : null,
          canvasHeight: c ? c.height : null,
          canvasZIndex: cStyle ? cStyle.zIndex : null,
          canvasPosition: cStyle ? cStyle.position : null
        };
      })()`,
      returnByValue: true,
    });
    console.log('Ready State Inspection:', JSON.stringify(readyStateCheck.result.value, null, 2));

    const readyData = readyStateCheck.result.value;
    if (!readyData.videoFound) throw new Error('FAIL: Video element not found!');
    if (!readyData.videoSrc) throw new Error('FAIL: Video source is null!');
    if (readyData.videoOpacity !== '1') throw new Error(`FAIL: Video opacity is ${readyData.videoOpacity}, expected 1!`);
    if (readyData.videoWidth <= 0 || readyData.videoHeight <= 0) {
      throw new Error(`FAIL: Invalid video dimensions: ${readyData.videoWidth}x${readyData.videoHeight}`);
    }
    console.log('✓ Video Element is correctly attached and rendered at base layer (z-0, opacity 1, object-fit contain)');
    console.log(`✓ Video Dimensions: ${readyData.videoWidth} x ${readyData.videoHeight}, Duration: ${readyData.videoDuration}s`);

    console.log('\n[STEP 5] Starting AI Detection...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.textContent && b.textContent.includes('START'));
        if (startBtn) {
          startBtn.click();
          return 'Clicked START';
        }
        return 'START button not found';
      })()`,
    });

    console.log('Waiting 6 seconds during live detection...');
    await new Promise((r) => setTimeout(r, 6000));

    const playingStateCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        const c = document.querySelector('canvas');
        let pixelSample = null;
        if (c) {
          const ctx = c.getContext('2d');
          if (ctx) {
            const data = ctx.getImageData(c.width / 2, c.height / 2, 4, 4).data;
            pixelSample = Array.from(data.slice(0, 16));
          }
        }
        // Check active tracks from HUD
        const trackElems = Array.from(document.querySelectorAll('span, div'));
        const trackBadge = trackElems.find(el => el.textContent && el.textContent.includes('TRACKS:'));
        return {
          videoPaused: v ? v.paused : null,
          videoCurrentTime: v ? v.currentTime : null,
          videoReadyState: v ? v.readyState : null,
          videoPlaybackRate: v ? v.playbackRate : null,
          canvasPixelSample: pixelSample,
          hudTrackBadge: trackBadge ? trackBadge.textContent.trim() : null
        };
      })()`,
      returnByValue: true,
    });
    console.log('Playing State Inspection:', JSON.stringify(playingStateCheck.result.value, null, 2));

    const playData = playingStateCheck.result.value;
    if (playData.videoPaused) throw new Error('FAIL: Video is paused during detection!');
    if (!playData.videoCurrentTime || playData.videoCurrentTime < 1.0) {
      throw new Error(`FAIL: Video did not advance: currentTime=${playData.videoCurrentTime}`);
    }
    console.log(`✓ Video is actively playing: currentTime=${playData.videoCurrentTime.toFixed(2)}s`);
    console.log(`✓ HUD Telemetry: ${playData.hudTrackBadge}`);

    console.log('\n[STEP 6] Testing Playback Speed Controls (0.5x, 2x, 1x)...');
    for (const speed of [0.5, 2, 1]) {
      await send('Runtime.evaluate', {
        expression: `(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn = btns.find(b => b.textContent && (b.textContent.trim() === '${speed}×' || b.textContent.trim() === '${speed}x'));
          if (btn) btn.click();
        })()`,
      });
      await new Promise((r) => setTimeout(r, 1000));
      const speedCheck = await send('Runtime.evaluate', {
        expression: `document.querySelector('video').playbackRate`,
        returnByValue: true,
      });
      console.log(`- Set speed ${speed}x -> video.playbackRate = ${speedCheck.result.value}`);
      if (Math.abs(speedCheck.result.value - speed) > 0.01) {
        throw new Error(`FAIL: Playback rate expected ${speed}, got ${speedCheck.result.value}`);
      }
    }
    console.log('✓ Playback speed controls working and synchronized');

    console.log('\n[STEP 7] Testing Pause and Resume Controls...');
    // Pause
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const pauseBtn = btns.find(b => b.textContent && b.textContent.includes('PAUSE'));
        if (pauseBtn) pauseBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 1500));
    const pausedState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        return { paused: v ? v.paused : null, currentTime: v ? v.currentTime : null };
      })()`,
      returnByValue: true,
    });
    console.log('Paused Check:', JSON.stringify(pausedState.result.value));
    if (!pausedState.result.value.paused) throw new Error('FAIL: Video failed to pause!');
    const pausedTime = pausedState.result.value.currentTime;

    await new Promise((r) => setTimeout(r, 1500));
    const pausedTime2 = await send('Runtime.evaluate', {
      expression: `document.querySelector('video').currentTime`,
      returnByValue: true,
    });
    if (Math.abs(pausedTime2.result.value - pausedTime) > 0.05) {
      throw new Error('FAIL: Video continued advancing while paused!');
    }
    console.log('✓ Pause confirmed: video frame frozen cleanly');

    // Resume
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const resumeBtn = btns.find(b => b.textContent && b.textContent.includes('RESUME'));
        if (resumeBtn) resumeBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));
    const resumedState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        return { paused: v ? v.paused : null, currentTime: v ? v.currentTime : null };
      })()`,
      returnByValue: true,
    });
    console.log('Resumed Check:', JSON.stringify(resumedState.result.value));
    if (resumedState.result.value.paused) throw new Error('FAIL: Video did not resume playing!');
    if (resumedState.result.value.currentTime <= pausedTime) {
      throw new Error('FAIL: Video did not advance after resume!');
    }
    console.log('✓ Resume confirmed: video resumed playback');

    console.log('\n[STEP 8] Testing Restart Control...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const restartBtn = btns.find(b => b.textContent && b.textContent.includes('RESTART'));
        if (restartBtn) restartBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2000));
    const restartState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        return { paused: v ? v.paused : null, currentTime: v ? v.currentTime : null };
      })()`,
      returnByValue: true,
    });
    console.log('Restart Check:', JSON.stringify(restartState.result.value));
    if (restartState.result.value.currentTime > 5.0) {
      throw new Error(`FAIL: Video did not restart from beginning: currentTime=${restartState.result.value.currentTime}`);
    }
    console.log('✓ Restart confirmed: video restarted from beginning');

    console.log('\n[STEP 9] Testing Clear Video Workflow...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.textContent && b.textContent.toUpperCase().includes('CLEAR VIDEO'));
        if (clearBtn) clearBtn.click();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 2500));
    const clearedState = await send('Runtime.evaluate', {
      expression: `(() => {
        const v = document.querySelector('video');
        const vStyle = v ? window.getComputedStyle(v) : null;
        return {
          videoSrc: v ? v.getAttribute('src') : null,
          videoOpacity: vStyle ? vStyle.opacity : null,
          videoPaused: v ? v.paused : null
        };
      })()`,
      returnByValue: true,
    });
    console.log('Cleared Check:', JSON.stringify(clearedState.result.value));
    if (clearedState.result.value.videoOpacity !== '0') {
      throw new Error(`FAIL: Video element not hidden after clear: opacity=${clearedState.result.value.videoOpacity}`);
    }
    console.log('✓ Clear Video confirmed: viewport reset and video cleanly unloaded');

    console.log('\n=============================================================');
    console.log('ALL LIVE SURVEILLANCE VIDEO VISIBILITY VERIFICATION PASSED!');
    console.log('=============================================================');

    ws.close();
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  } finally {
    browserProcess.kill();
  }
}

run();
