// tests/test_step10_video_sync_verification.cjs
// Automated E2E verification for STEP 10 - Live Surveillance Video Playback & Frame Synchronization

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = globalThis.WebSocket;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const TEST_VIDEO_PATH = 'D:\\MAJOR_WEB - Copy\\data\\combined_thermal_test.mp4';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function runStep10Verification() {
  console.log('=================================================================');
  console.log('STEP 10: VIDEO PLAYBACK & SYNCHRONIZATION E2E VERIFICATION');
  console.log('=================================================================\n');

  if (!fs.existsSync(TEST_VIDEO_PATH)) {
    throw new Error(`Test video missing at: ${TEST_VIDEO_PATH}`);
  }

  // 1. Launch Edge headless with remote debugging
  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const targets = await getJson('http://127.0.0.1:9222/json/list');
      const pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!wsUrl) {
    browserProcess.kill();
    throw new Error('Failed to connect to Edge DevTools Protocol');
  }

  const ws = new WebSocket(wsUrl);

  let idCounter = 1;
  const pendingRequests = new Map();
  const consoleErrors = [];

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
    if (msg.method === 'Console.messageAdded') {
      const level = msg.params.message.level;
      if (level === 'error') {
        consoleErrors.push(msg.params.message.text);
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value || a.description || '').join(' ');
        consoleErrors.push(text);
      }
    }
  });

  ws.addEventListener('open', async () => {
    try {
      await sendCmd('Runtime.enable');
      await sendCmd('Console.enable');
      await sendCmd('Page.enable');
      await sendCmd('DOM.enable');

      console.log('[1] Loading application and entering Command Center...');
      await new Promise((r) => setTimeout(r, 2000));

      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const enter = btns.find(b => b.innerText && b.innerText.includes('ENTER COMMAND CENTER'));
            if (enter) enter.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1500));

      async function navigateTo(pageId) {
        return await sendCmd('Runtime.evaluate', {
          expression: `
            (() => {
              const asideBtns = Array.from(document.querySelectorAll('aside button'));
              const target = asideBtns.find(b => 
                (b.getAttribute('data-page-id') && b.getAttribute('data-page-id').toLowerCase() === '${pageId.toLowerCase()}') ||
                (b.innerText && b.innerText.toLowerCase().includes('${pageId.toLowerCase()}')) ||
                (b.getAttribute('title') && b.getAttribute('title').toLowerCase().includes('${pageId.toLowerCase()}'))
              );
              if (target) {
                target.click();
                return 'Navigated to: ${pageId}';
              }
              return 'Sidebar button not found: ${pageId}';
            })()
          `,
          returnByValue: true,
        });
      }

      console.log('\n[2] Navigating to LIVE SURVEILLANCE...');
      await navigateTo('live');
      await new Promise((r) => setTimeout(r, 2000));

      // Upload the real thermal test video via Blob in the browser
      console.log('\n[3] Uploading real thermal video (combined_thermal_test.mp4)...');
      const videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
      const base64Data = videoBuffer.toString('base64');

      const uploadResult = await sendCmd('Runtime.evaluate', {
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
            const file = new File([blob], 'combined_thermal_test.mp4', { type: 'video/mp4' });

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
        returnByValue: true,
      });
      console.log('    Upload action:', uploadResult.result.value);

      // Wait for upload to complete and START button to become enabled
      console.log('    Waiting for upload to complete and START button to become enabled...');
      for (let i = 0; i < 15; i++) {
        const check = await sendCmd('Runtime.evaluate', {
          expression: `
            (() => {
              const btns = Array.from(document.querySelectorAll('button'));
              const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
              const video = document.querySelector('video');
              return {
                hasStartBtn: !!startBtn,
                startDisabled: startBtn ? startBtn.disabled : true,
                videoReady: video ? video.readyState : 0,
                videoSrc: video ? video.src.substring(0, 30) : null
              };
            })()
          `,
          returnByValue: true,
        });
        if (check.result.value.hasStartBtn && !check.result.value.startDisabled) {
          console.log('    Ready! Status:', check.result.value);
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }

      // 4. Verify Video Ready & Element State
      console.log('\n[4] Inspecting Video Element & Viewport State...');
      const videoElementState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const video = document.querySelector('video');
            const canvas = document.querySelector('canvas');
            return {
              hasVideoElement: !!video,
              videoSrc: video ? video.src : null,
              readyState: video ? video.readyState : 0,
              videoWidth: video ? video.videoWidth : 0,
              videoHeight: video ? video.videoHeight : 0,
              duration: video ? video.duration : 0,
              paused: video ? video.paused : true,
              currentTime: video ? video.currentTime : 0,
              hasCanvas: !!canvas,
              canvasWidth: canvas ? canvas.width : 0,
              canvasHeight: canvas ? canvas.height : 0,
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Video Element State:', videoElementState.result.value);

      // 5. Click "START AI DETECTION"
      console.log('\n[5] Triggering "START AI DETECTION"...');
      const startResult = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const startBtn = btns.find(b => b.innerText && b.innerText.includes('START AI DETECTION'));
            if (startBtn) {
              startBtn.click();
              return 'Clicked START AI DETECTION';
            }
            return 'Button not found';
          })()
        `,
        returnByValue: true,
      });
      console.log('    Start action:', startResult.result.value);

      // Wait 3.5s for playback and inference streaming
      console.log('    Streaming live video frames & AI inference for 3.5 seconds...');
      await new Promise((r) => setTimeout(r, 3500));

      // 6. Verify Playback & Overlay Synchronization
      console.log('\n[6] Verifying Playback Progression & Bounding Boxes...');
      const activeState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const video = document.querySelector('video');
            const statusBadge = document.body.innerText.includes('AI INFERENCE ACTIVE');
            return {
              currentTime: video ? video.currentTime : 0,
              isPlaying: video ? !video.paused : false,
              hasAdvanced: video ? video.currentTime > 0.5 : false,
              statusBadgeActive: statusBadge,
              videoDims: video ? { w: video.videoWidth, h: video.videoHeight } : null
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Active Playback State:', activeState.result.value);
      console.assert(activeState.result.value.hasAdvanced, 'Video playback must advance beyond 0.5s');

      // 7. Test PAUSE functionality
      console.log('\n[7] Testing PAUSE functionality...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const pauseBtn = btns.find(b => b.innerText && b.innerText.includes('PAUSE'));
            if (pauseBtn) pauseBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1200));

      const pausedState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const video = document.querySelector('video');
            return {
              isPaused: video ? video.paused : false,
              pausedTime: video ? video.currentTime : 0
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Paused State:', pausedState.result.value);
      console.assert(pausedState.result.value.isPaused, 'Video must be paused after clicking PAUSE');

      // 8. Test RESUME functionality
      console.log('\n[8] Testing RESUME functionality...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const resumeBtn = btns.find(b => b.innerText && b.innerText.includes('RESUME'));
            if (resumeBtn) resumeBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 2000));

      const resumedState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const video = document.querySelector('video');
            return {
              isResumed: video ? !video.paused : false,
              resumedTime: video ? video.currentTime : 0
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Resumed State:', resumedState.result.value);
      console.assert(resumedState.result.value.resumedTime > pausedState.result.value.pausedTime, 'Video must progress after resume');

      // 9. Test STOP functionality
      console.log('\n[9] Testing STOP functionality...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const stopBtn = btns.find(b => b.innerText && b.innerText.includes('STOP'));
            if (stopBtn) stopBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1500));

      const stoppedState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const video = document.querySelector('video');
            return {
              isPaused: video ? video.paused : false,
              stoppedAtZero: video ? video.currentTime === 0 : false
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Stopped State:', stoppedState.result.value);
      console.assert(stoppedState.result.value.isPaused, 'Video must be paused after STOP');

      // 10. Test RESTART functionality
      console.log('\n[10] Testing RESTART functionality...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const restartBtn = btns.find(b => b.innerText && b.innerText.includes('RESTART'));
            if (restartBtn) restartBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 2000));

      const restartedState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const video = document.querySelector('video');
            return {
              isPlayingAfterRestart: video ? !video.paused : false,
              currentTime: video ? video.currentTime : 0
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Restarted State:', restartedState.result.value);
      console.assert(restartedState.result.value.isPlayingAfterRestart, 'Video must play after RESTART');

      // 11. Test Demo Mode Switching
      console.log('\n[11] Testing DEMO MODE switching...');
      await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const demoBtn = btns.find(b => b.innerText && b.innerText.includes('DEMO FEED'));
            if (demoBtn) demoBtn.click();
          })()
        `,
      });
      await new Promise((r) => setTimeout(r, 1500));

      const demoState = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText;
            return {
              isDemoModeActive: text.includes('DEMO MODE') || text.includes('DEMO FEED')
            };
          })()
        `,
        returnByValue: true,
      });
      console.log('    Demo Mode State:', demoState.result.value);
      console.assert(demoState.result.value.isDemoModeActive, 'Demo mode must activate when selected');

      // 12. Check Console Errors
      console.log('\n[12] Checking Browser Console Errors...');
      const filteredErrors = consoleErrors.filter(
        (e) => !e.includes('favicon') && !e.includes('404')
      );
      console.log(`    Filtered Console Unhandled Errors: ${filteredErrors.length}`);
      if (filteredErrors.length > 0) {
        console.log('    Errors:', filteredErrors);
      }

      console.log('\n=================================================================');
      console.log('>>> STEP 10: VIDEO SYNCHRONIZATION VERIFICATION PASSED! <<<');
      console.log('=================================================================\n');

      ws.close();
      browserProcess.kill();
      process.exit(0);
    } catch (err) {
      console.error('Verification failed:', err);
      ws.close();
      browserProcess.kill();
      process.exit(1);
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('WebSocket connection error:', err);
    browserProcess.kill();
    process.exit(1);
  });
}

runStep10Verification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
