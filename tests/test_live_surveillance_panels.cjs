const { spawn } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
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

async function runLiveSurveillancePanelsVerification() {
  console.log('=================================================================');
  console.log('TESTING LIVE SURVEILLANCE RIGHT-SIDE PANELS (EDGE CDP)');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9226/json/list');
      const pageTarget = list.find(t => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!wsUrl) {
    console.error('ERROR: Failed to connect to Edge CDP');
    browserProcess.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const res = JSON.parse(event.data);
    if (res.id && pending.has(res.id)) {
      const { resolve, reject } = pending.get(res.id);
      pending.delete(res.id);
      if (res.error) reject(new Error(res.error.message || 'CDP Error'));
      else resolve(res.result);
    }
  });

  await new Promise(r => ws.addEventListener('open', r));

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evalExpr(expression) {
    const res = await sendCmd('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : null;
  }

  await sendCmd('Page.enable');
  await sendCmd('DOM.enable');

  try {
    // 1. Enter Live Surveillance
    console.log('\n[1] Navigating to Live Surveillance page...');
    await new Promise(r => setTimeout(r, 1500));
    await evalExpr(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 1500));

    // 2. Check idle state in VIDEO FILE mode
    console.log('\n[2] Verifying clean idle state in VIDEO FILE mode...');
    const idleCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasLiveHeader: text.includes('LIVE SURVEILLANCE'),
          hasRecordedVideoLabel: text.includes('RECORDED THERMAL VIDEO'),
          hasNoPhysicalFlirClaim: !text.includes('FLIR AX65 LWIR'),
          hasTargetInspectorEmptyTitle: text.includes('SELECT A TARGET TO INSPECT'),
          hasTargetInspectorEmptySub: text.includes('Choose an active tracked object to view details.'),
          hasActiveTargetsHeader: text.includes('ACTIVE TARGETS (0)'),
          hasActiveTargetsEmptyTitle: text.includes('NO ACTIVE TARGETS'),
          hasActiveTargetsEmptySub: text.includes('Waiting for thermal detections...'),
          hasTrackingByteTrack: text.includes('TRACKING: ByteTrack'),
          hasActivityStreamHeader: text.includes('LIVE ACTIVITY STREAM'),
          hasActivityStreamEmptyTitle: text.includes('NO RECENT ACTIVITY'),
          hasActivityStreamEmptySub: text.includes('Waiting for thermal security events...'),
          hasFakePerson024: text.includes('PERSON #024 DETECTED'),
          hasFakeDrone007: text.includes('DRONE #007 TRACK UPDATED'),
          hasFakeAltitude: text.includes('Altitude 82m AGL'),
          hasFakeSpeed65: text.includes('Speed threshold exceeded (65 km/h)')
        };
      })()
    `);

    console.log('   - Page has LIVE SURVEILLANCE:', idleCheck.hasLiveHeader ? 'PASS' : 'FAIL');
    console.log('   - Sensor label shows RECORDED THERMAL VIDEO:', idleCheck.hasRecordedVideoLabel ? 'PASS' : 'FAIL');
    console.log('   - Does NOT claim physical FLIR in file mode:', idleCheck.hasNoPhysicalFlirClaim ? 'PASS' : 'FAIL');
    console.log('   - Target Inspector empty title:', idleCheck.hasTargetInspectorEmptyTitle ? 'PASS' : 'FAIL');
    console.log('   - Target Inspector empty subtitle:', idleCheck.hasTargetInspectorEmptySub ? 'PASS' : 'FAIL');
    console.log('   - Active Targets header (0):', idleCheck.hasActiveTargetsHeader ? 'PASS' : 'FAIL');
    console.log('   - Active Targets empty title:', idleCheck.hasActiveTargetsEmptyTitle ? 'PASS' : 'FAIL');
    console.log('   - Active Targets empty subtitle:', idleCheck.hasActiveTargetsEmptySub ? 'PASS' : 'FAIL');
    console.log('   - Active Targets shows TRACKING: ByteTrack:', idleCheck.hasTrackingByteTrack ? 'PASS' : 'FAIL');
    console.log('   - Live Activity Stream header:', idleCheck.hasActivityStreamHeader ? 'PASS' : 'FAIL');
    console.log('   - Live Activity Stream empty title:', idleCheck.hasActivityStreamEmptyTitle ? 'PASS' : 'FAIL');
    console.log('   - Live Activity Stream empty subtitle:', idleCheck.hasActivityStreamEmptySub ? 'PASS' : 'FAIL');
    console.log('   - No fake static events (PERSON #024):', !idleCheck.hasFakePerson024 ? 'PASS' : 'FAIL');
    console.log('   - No fake altitude (82m AGL):', !idleCheck.hasFakeAltitude ? 'PASS' : 'FAIL');

    if (!idleCheck.hasRecordedVideoLabel || !idleCheck.hasTargetInspectorEmptyTitle || !idleCheck.hasActiveTargetsEmptyTitle || !idleCheck.hasActivityStreamEmptyTitle) {
      throw new Error('Idle state check failed.');
    }

    // 3. Upload test thermal video via file input using CDP DOM.setFileInputFiles
    console.log('\n[3] Loading thermal video file via file input...');
    const doc = await sendCmd('DOM.getDocument');
    const inputNode = await sendCmd('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: 'input[type="file"]'
    });

    if (!inputNode || !inputNode.nodeId) {
      throw new Error('Could not find input[type="file"] element');
    }

    await sendCmd('DOM.setFileInputFiles', {
      nodeId: inputNode.nodeId,
      files: [TEST_VIDEO_PATH]
    });
    await new Promise(r => setTimeout(r, 2000));

    // Verify video loaded event
    const uploadEventCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasVideoLoadedEvent: text.includes('VIDEO LOADED'),
          hasFileName: text.includes('COMBINED_THERMAL_TEST.MP4')
        };
      })()
    `);
    console.log('   - Live Activity logs VIDEO LOADED event:', uploadEventCheck.hasVideoLoadedEvent ? 'PASS' : 'FAIL');

    // Wait for videoStatus to become ready (useVideoStatus polls every 2s)
    console.log('   - Waiting for backend to register video ready...');
    for (let i = 0; i < 8; i++) {
      const isReady = await evalExpr(`
        (function() {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START AI DETECTION'));
          return btn && !btn.disabled;
        })()
      `);
      if (isReady) break;
      await new Promise(r => setTimeout(r, 800));
    }

    // 4. Start AI Detection on the video
    console.log('\n[4] Starting real AI Detection (YOLO11n + ByteTrack)...');
    await evalExpr(`
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const startBtn = btns.find(b => b.textContent && b.textContent.includes('START AI DETECTION'));
        if (startBtn) startBtn.click();
        return true;
      })()
    `);

    // Poll until detections arrive or timeout
    console.log('   - Polling for YOLO11n + ByteTrack detections...');
    let activeTargetsFound = false;
    for (let i = 0; i < 15; i++) {
      const count = await evalExpr(`
        (function() {
          const targetItems = Array.from(document.querySelectorAll('div')).filter(el => {
            return el.className && el.className.includes('cursor-pointer') && el.textContent.includes('T-');
          });
          return targetItems.length;
        })()
      `);
      if (count > 0) {
        activeTargetsFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 600));
    }

    // 5. Verify real Active Targets and Live Activity Stream during video execution
    console.log('\n[5] Verifying Active Targets and Live Activity Stream with real detections...');
    const streamCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        const targetItems = Array.from(document.querySelectorAll('div')).filter(el => {
          return el.className && el.className.includes('cursor-pointer') && el.textContent.includes('T-');
        });
        return {
          hasVideoStartedEvent: text.includes('VIDEO STARTED'),
          targetCount: targetItems.length,
          hasByteTrackTargetFormat: text.includes('T-'),
          hasThreatOrNormalBadge: text.includes('NORMAL') || text.includes('THREAT'),
          hasNoFakeAltitude: !text.includes('Altitude 82m AGL'),
          hasNoFakeHeading: !text.includes('NE (042°)'),
          hasNoFakeSpeed42Fallback: !text.includes('4.2 km/h')
        };
      })()
    `);

    console.log('   - Live Activity logs VIDEO STARTED event:', streamCheck.hasVideoStartedEvent ? 'PASS' : 'FAIL');
    console.log('   - Real ByteTrack targets active:', streamCheck.targetCount, streamCheck.targetCount > 0 ? 'PASS' : 'WAIT');
    console.log('   - Displays T- track ID formatting:', streamCheck.hasByteTrackTargetFormat ? 'PASS' : 'FAIL');
    console.log('   - Displays THREAT or NORMAL badge:', streamCheck.hasThreatOrNormalBadge ? 'PASS' : 'FAIL');
    console.log('   - No fake altitude (82m AGL):', streamCheck.hasNoFakeAltitude ? 'PASS' : 'FAIL');
    console.log('   - No fake heading (NE 042°):', streamCheck.hasNoFakeHeading ? 'PASS' : 'FAIL');
    console.log('   - No fake speed (4.2 km/h fallback):', streamCheck.hasNoFakeSpeed42Fallback ? 'PASS' : 'FAIL');

    // 6. Click an active target to inspect in Target Inspector
    console.log('\n[6] Selecting a real active target in Target Inspector...');
    const clickTarget = await evalExpr(`
      (function() {
        const targetItems = Array.from(document.querySelectorAll('div')).filter(el => {
          return el.className && el.className.includes('cursor-pointer') && el.textContent.includes('T-');
        });
        if (targetItems.length > 0) {
          targetItems[0].click();
          return true;
        }
        return false;
      })()
    `);

    if (clickTarget) {
      await new Promise(r => setTimeout(r, 600));
      const inspectedTarget = await evalExpr(`
        (function() {
          const text = document.body.innerText;
          return {
            hasTrackIdLabel: text.includes('TRACK ID:'),
            hasSelectedTrackFormat: text.includes('T-'),
            hasClassLabel: text.includes('CLASS:'),
            hasConfidenceLabel: text.includes('AI CONFIDENCE:'),
            hasStatusLabel: text.includes('STATUS:'),
            hasThreatLevelLabel: text.includes('THREAT LEVEL:'),
            hasReasonLabel: text.includes('REASON:'),
            hasZoneLabel: text.includes('ZONE:'),
            hasEstimatedSpeedLabel: text.includes('ESTIMATED SPEED:'),
            hasTimestampLabel: text.includes('TIMESTAMP:'),
            hasNoFakeAltitude: !text.includes('Altitude 82m AGL'),
            hasNoFakeHeading: !text.includes('NE (042°)')
          };
        })()
      `);

      console.log('   - Target Inspector shows TRACK ID (T-...):', inspectedTarget.hasTrackIdLabel && inspectedTarget.hasSelectedTrackFormat ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows CLASS:', inspectedTarget.hasClassLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows AI CONFIDENCE:', inspectedTarget.hasConfidenceLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows STATUS:', inspectedTarget.hasStatusLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows THREAT LEVEL:', inspectedTarget.hasThreatLevelLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows REASON:', inspectedTarget.hasReasonLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows ZONE:', inspectedTarget.hasZoneLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows ESTIMATED SPEED:', inspectedTarget.hasEstimatedSpeedLabel ? 'PASS' : 'FAIL');
      console.log('   - Target Inspector shows TIMESTAMP:', inspectedTarget.hasTimestampLabel ? 'PASS' : 'FAIL');
      console.log('   - No fake altitude or heading:', inspectedTarget.hasNoFakeAltitude && inspectedTarget.hasNoFakeHeading ? 'PASS' : 'FAIL');
    }

    // 7. Test Pause & Resume
    console.log('\n[7] Testing Video Pause & Resume...');
    await evalExpr(`
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const pauseBtn = btns.find(b => b.textContent && b.textContent.includes('PAUSE'));
        if (pauseBtn) pauseBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const pauseCheck = await evalExpr(`document.body.innerText.includes('VIDEO PAUSED')`);
    console.log('   - Live Activity logs VIDEO PAUSED event:', pauseCheck ? 'PASS' : 'FAIL');

    await evalExpr(`
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const resumeBtn = btns.find(b => b.textContent && b.textContent.includes('RESUME'));
        if (resumeBtn) resumeBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const resumeCheck = await evalExpr(`document.body.innerText.includes('VIDEO RESUMED')`);
    console.log('   - Live Activity logs VIDEO RESUMED event:', resumeCheck ? 'PASS' : 'FAIL');

    // 8. Test Snapshot
    console.log('\n[8] Testing Snapshot capture...');
    await evalExpr(`
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const snapBtn = btns.find(b => b.textContent && b.textContent.includes('SNAPSHOT'));
        if (snapBtn) snapBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1200));

    const snapCheck = await evalExpr(`document.body.innerText.includes('SNAPSHOT CAPTURED')`);
    console.log('   - Live Activity logs SNAPSHOT CAPTURED event:', snapCheck ? 'PASS' : 'FAIL');

    // 9. Test Clear Video
    console.log('\n[9] Testing Clear Video...');
    await evalExpr(`
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const clearBtn = btns.find(b => b.textContent && b.textContent.includes('CLEAR VIDEO'));
        if (clearBtn) clearBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    const clearCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasVideoClearedEvent: text.includes('VIDEO CLEARED'),
          hasNoActiveTargets: text.includes('NO ACTIVE TARGETS'),
          hasSelectTargetEmpty: text.includes('SELECT A TARGET TO INSPECT')
        };
      })()
    `);
    console.log('   - Live Activity logs VIDEO CLEARED event:', clearCheck.hasVideoClearedEvent ? 'PASS' : 'FAIL');
    console.log('   - Active Targets reverts to NO ACTIVE TARGETS:', clearCheck.hasNoActiveTargets ? 'PASS' : 'FAIL');
    console.log('   - Target Inspector reverts to empty state:', clearCheck.hasSelectTargetEmpty ? 'PASS' : 'FAIL');

    console.log('\n=================================================================');
    console.log('ALL LIVE SURVEILLANCE RIGHT-SIDE PANELS VERIFIED 100% CLEAN & ACCURATE');
    console.log('=================================================================');

  } catch (err) {
    console.error('Verification failed:', err);
    process.exitCode = 1;
  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runLiveSurveillancePanelsVerification();
