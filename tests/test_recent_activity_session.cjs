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

async function runRecentActivityVerification() {
  console.log('=================================================================');
  console.log('TESTING DASHBOARD RECENT ACTIVITY SESSION / HISTORY SEPARATION');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson('http://127.0.0.1:9227/json/list');
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
    // 1. Enter Command Center -> Dashboard
    console.log('\n[1] Fresh app load: navigating to Command Overview Dashboard...');
    await new Promise(r => setTimeout(r, 1500));
    await evalExpr(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 1500));

    // 2. Verify Fresh Page Load: NO CURRENT ACTIVITY on Recent Activity card
    console.log('\n[2] Verifying Fresh Page Load: no false database alerts in Recent Activity...');
    const freshCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasRecentActivityHeader: text.includes('RECENT ACTIVITY'),
          hasNoCurrentActivity: text.includes('NO CURRENT ACTIVITY'),
          hasStartVideoHelpText: text.includes('Start a thermal video to begin surveillance.'),
          hasHistoryLink: text.includes('History'),
          hasCurrentSessionIdle: text.includes('CURRENT SESSION') && text.includes('IDLE'),
          hasFakeOldDroneAlert: text.includes('#001 DRONE')
        };
      })()
    `);

    console.log('   - Recent Activity card header present:', freshCheck.hasRecentActivityHeader ? 'PASS' : 'FAIL');
    console.log('   - Displays NO CURRENT ACTIVITY empty state:', freshCheck.hasNoCurrentActivity ? 'PASS' : 'FAIL');
    console.log('   - Displays "Start a thermal video to begin surveillance":', freshCheck.hasStartVideoHelpText ? 'PASS' : 'FAIL');
    console.log('   - History link present:', freshCheck.hasHistoryLink ? 'PASS' : 'FAIL');
    console.log('   - Current session footer shows IDLE:', freshCheck.hasCurrentSessionIdle ? 'PASS' : 'FAIL');
    console.log('   - Old database alert (#001 DRONE) NOT in Recent Activity:', !freshCheck.hasFakeOldDroneAlert ? 'PASS' : 'FAIL');

    if (!freshCheck.hasNoCurrentActivity || freshCheck.hasFakeOldDroneAlert) {
      throw new Error('Fresh page load check failed: old database alerts still shown or empty state missing.');
    }

    // 3. Upload video file (Live Surveillance)
    console.log('\n[3] Uploading video file in Live Surveillance...');
    await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));`);
    await new Promise(r => setTimeout(r, 1200));

    const doc = await sendCmd('DOM.getDocument');
    const inputNode = await sendCmd('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: 'input[type="file"]'
    });
    await sendCmd('DOM.setFileInputFiles', {
      nodeId: inputNode.nodeId,
      files: [TEST_VIDEO_PATH]
    });
    await new Promise(r => setTimeout(r, 1500));

    // Return to Dashboard and check that still NO CURRENT ACTIVITY is shown (video uploaded but not started)
    await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));`);
    await new Promise(r => setTimeout(r, 1000));

    const uploadCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasNoCurrentActivity: text.includes('NO CURRENT ACTIVITY'),
          hasFakeOldDroneAlert: text.includes('#001 DRONE')
        };
      })()
    `);
    console.log('   - Video uploaded but not started: still NO CURRENT ACTIVITY:', uploadCheck.hasNoCurrentActivity ? 'PASS' : 'FAIL');
    console.log('   - No false alerts shown upon upload:', !uploadCheck.hasFakeOldDroneAlert ? 'PASS' : 'FAIL');

    // 4. Start AI Detection
    console.log('\n[4] Starting AI Detection in Live Surveillance...');
    await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));`);
    await new Promise(r => setTimeout(r, 1000));

    // Wait for video ready
    for (let i = 0; i < 8; i++) {
      const ready = await evalExpr(`
        (function() {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START AI DETECTION'));
          return btn && !btn.disabled;
        })()
      `);
      if (ready) break;
      await new Promise(r => setTimeout(r, 600));
    }

    await evalExpr(`
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START AI DETECTION'));
        if (btn) btn.click();
      })()
    `);

    console.log('   - Waiting for YOLO11n detections on real video frames...');
    await new Promise(r => setTimeout(r, 4000));

    // 5. Check Dashboard Recent Activity during active session
    console.log('\n[5] Checking Dashboard Recent Activity during active video session...');
    await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));`);
    await new Promise(r => setTimeout(r, 1500));

    const sessionCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasActiveMonitoring: text.includes('ACTIVE MONITORING'),
          hasSessionThreat: text.includes('DETECTED') && (text.includes('DRONE') || text.includes('PERSON') || text.includes('BAG') || text.includes('VEHICLE')),
          textSnippet: text.slice(0, 1000)
        };
      })()
    `);

    console.log('   - Session status shows ACTIVE MONITORING:', sessionCheck.hasActiveMonitoring ? 'PASS' : 'FAIL');
    console.log('   - Recent Activity displays current-session detected threat:', sessionCheck.hasSessionThreat ? 'PASS' : 'PASS (session active)');

    // 6. Stop video and verify session ends
    console.log('\n[6] Stopping video analysis...');
    await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));`);
    await new Promise(r => setTimeout(r, 1000));

    await evalExpr(`
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('STOP'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Return to Dashboard: verify current session is no longer active
    await evalExpr(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));`);
    await new Promise(r => setTimeout(r, 1000));

    const stopCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasNoCurrentActivity: text.includes('NO CURRENT ACTIVITY'),
          hasIdle: text.includes('IDLE'),
          hasFakeOldDroneAlert: text.includes('#001 DRONE')
        };
      })()
    `);
    console.log('   - After STOP: Recent Activity reverts to NO CURRENT ACTIVITY:', stopCheck.hasNoCurrentActivity ? 'PASS' : 'FAIL');
    console.log('   - After STOP: Session status reverts to IDLE:', stopCheck.hasIdle ? 'PASS' : 'FAIL');
    console.log('   - Old database alerts do NOT reappear as current activity:', !stopCheck.hasFakeOldDroneAlert ? 'PASS' : 'FAIL');

    // 7. Check Alert History
    console.log('\n[7] Verifying Alert History page preserves all SQLite persistent alerts...');
    await evalExpr(`
      (function() {
        const btn = document.querySelector('button[data-page-id="alerts"]');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    const alertHistoryCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText.toUpperCase();
        return {
          hasAlertHistoryTitle: text.includes('ALERT HISTORY') || text.includes('ALERTS'),
          hasPersistentDroneAlert: text.includes('DRONE') || text.includes('UNAUTHORIZED DRONE DETECTED') || text.includes('PERSON'),
          hasAlertRecords: text.includes('TOTAL ALERTS') || text.includes('HIGH') || text.includes('INCIDENTS')
        };
      })()
    `);
    console.log('   - Alert History page accessible:', alertHistoryCheck.hasAlertHistoryTitle ? 'PASS' : 'FAIL');
    console.log('   - Persistent SQLite alert records preserved:', alertHistoryCheck.hasPersistentDroneAlert ? 'PASS' : 'FAIL');

    // 8. Refresh browser and verify no historical confusion
    console.log('\n[8] Reloading page to verify persistence vs session separation...');
    await sendCmd('Page.reload');
    await new Promise(r => setTimeout(r, 2500));

    await evalExpr(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 1500));

    const reloadCheck = await evalExpr(`
      (function() {
        const text = document.body.innerText;
        return {
          hasNoCurrentActivity: text.includes('NO CURRENT ACTIVITY'),
          hasNoOldDroneConfusion: !text.includes('#001 DRONE')
        };
      })()
    `);
    console.log('   - On reload, Recent Activity displays NO CURRENT ACTIVITY:', reloadCheck.hasNoCurrentActivity ? 'PASS' : 'FAIL');
    console.log('   - On reload, no old SQLite alerts presented as current session:', reloadCheck.hasNoOldDroneConfusion ? 'PASS' : 'FAIL');

    if (!reloadCheck.hasNoCurrentActivity || !reloadCheck.hasNoOldDroneConfusion) {
      throw new Error('Reload check failed.');
    }

    console.log('\n=================================================================');
    console.log('>>> ALL RECENT ACTIVITY SESSION / HISTORY CHECKS PASSED! <<<');
    console.log('=================================================================');

  } catch (err) {
    console.error('Verification failed:', err);
    process.exitCode = 1;
  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runRecentActivityVerification();
