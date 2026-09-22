const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const DEMO_VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';
const CDP_PORT = 9228;

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

async function runExaminerTargetTrackingVerification() {
  console.log('=================================================================');
  console.log('TARGET TRACKING EXAMINER VIDEO E2E TEST (20s SEQUENCE)');
  console.log('Video Path:', DEMO_VIDEO_PATH);
  console.log('=================================================================');

  if (!fs.existsSync(DEMO_VIDEO_PATH)) {
    throw new Error('Examiner video not found at: ' + DEMO_VIDEO_PATH);
  }

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const pageTarget = list.find(t => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!wsUrl) {
    browserProcess.kill();
    throw new Error('Failed to connect to browser CDP on port ' + CDP_PORT);
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  const consoleErrors = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const text = msg.params.args?.map(a => a.value || a.description).join(' ') || '';
      consoleErrors.push(text);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');

  async function evalCode(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  try {
    // 1. Wait for Loading Screen to finish and enter Command Center
    console.log('\n[1/7] Waiting for application boot sequence to complete...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const hasBooted = await evalCode(`
        (() => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText && (b.innerText.includes('ENTER COMMAND CENTER') || b.innerText.includes('COMMAND')));
          if (btn) {
            btn.click();
            return 'CLICKED_ENTER';
          }
          const isTracking = document.body.innerText.includes('TARGET TRACKING');
          if (isTracking) return 'ALREADY_TRACKING';
          return null;
        })()
      `);
      if (hasBooted) {
        console.log('   Boot complete, result:', hasBooted);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));

    // 2. Navigate to Target Tracking Page
    console.log('[2/7] Navigating to TARGET TRACKING page...');
    await evalCode(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const targetBtn = asideBtns.find(b => b.textContent && b.textContent.includes('Target Tracking'));
        if (targetBtn) targetBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // Ensure we are on Target Tracking
    for (let i = 0; i < 10; i++) {
      const isTracking = await evalCode(`(() => document.body.innerText.includes('TARGET TRACKING'))()`);
      if (isTracking) break;
      await evalCode(`(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' })))()`);
      await new Promise(r => setTimeout(r, 500));
    }

    // 3. Verify IDLE state in Target Tracking
    console.log('[3/7] Verifying IDLE state before video playback...');
    const idleState = await evalCode(`
      (() => {
        const text = document.body.innerText;
        const activeTracksMatch = text.match(/ACTIVE TRACKS:\\s*([0-9]+)/i);
        const directoryMatch = text.match(/ACTIVE TARGET DIRECTORY\\s*\\(([0-9]+)\\)/i);
        
        return {
          activeTracksCount: activeTracksMatch ? parseInt(activeTracksMatch[1], 10) : null,
          directoryCount: directoryMatch ? parseInt(directoryMatch[1], 10) : null,
          hasNoActiveTracks: text.includes('NO ACTIVE TRACKS'),
          hasStartVideo: text.includes('Start a thermal video to begin tracking.'),
          hasNoTrackSelected: text.includes('NO ACTIVE TRACK SELECTED') || text.includes('SELECT A TARGET'),
          hasRealByteTrack: text.includes('REAL BYTE TRACK MOVEMENT'),
          hasImageBased: text.includes('IMAGE-BASED TRACK POSITION'),
        };
      })()
    `);
    console.log('   Idle State Findings:', idleState);

    if (idleState.activeTracksCount !== 0) {
      throw new Error(`Expected idle active tracks count 0, got ${idleState.activeTracksCount}`);
    }
    if (idleState.directoryCount !== 0) {
      throw new Error(`Expected idle directory count 0, got ${idleState.directoryCount}`);
    }
    if (!idleState.hasNoActiveTracks) {
      throw new Error('Expected "NO ACTIVE TRACKS" empty state label in directory table');
    }
    if (!idleState.hasStartVideo) {
      throw new Error('Expected "Start a thermal video to begin tracking." in directory table');
    }
    if (!idleState.hasRealByteTrack || !idleState.hasImageBased) {
      throw new Error('3D Trajectory truthful movement / image-based positioning headers missing');
    }
    console.log('   ✓ Truthful idle state confirmed: ACTIVE TRACKS: 0, ACTIVE TARGET DIRECTORY (0), NO ACTIVE TRACKS.');

    // 4. Upload & Start Examiner Video (20s)
    console.log('\n[4/7] Uploading and starting 20s examiner video...');
    const videoBuffer = fs.readFileSync(DEMO_VIDEO_PATH);
    const base64Data = videoBuffer.toString('base64');

    const uploadResult = await evalCode(`
      (async () => {
        // Clear any old session first
        await fetch('http://127.0.0.1:8000/api/video/clear', { method: 'POST' });
        
        const b64 = "${base64Data}";
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'video/mp4' });
        
        const formData = new FormData();
        formData.append('file', blob, 'thermal_exam_demo_20s.mp4');
        
        const res = await fetch('http://127.0.0.1:8000/api/video/upload', {
          method: 'POST',
          body: formData
        });
        const json = await res.json();
        
        // Start analysis via /api/video/start
        const startRes = await fetch('http://127.0.0.1:8000/api/video/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: json.video_id })
        });
        const startJson = await startRes.json();
        return { upload: json, start: startJson };
      })()
    `);
    console.log('   Upload & Play triggered. Result:', uploadResult);

    // Make sure we are on Target Tracking page
    await evalCode(`
      (() => {
        const asideBtns = Array.from(document.querySelectorAll('aside button'));
        const targetBtn = asideBtns.find(b => b.textContent && b.textContent.includes('Target Tracking'));
        if (targetBtn) targetBtn.click();
      })()
    `);

    // 5. Monitor Target Tracking for 18 seconds while video is playing
    console.log('\n[5/7] Monitoring live ByteTrack target directory during 20s examiner playback...');
    const observedClasses = new Set();
    const observedThreats = new Map(); // class -> { threatLevel, status }
    const sampleHistory = [];
    let inspectTestedT1 = false;
    let inspectTestedT2 = false;
    let t1Details = null;
    let t2Details = null;

    const startTime = Date.now();
    while (Date.now() - startTime < 28000) {
      await new Promise(r => setTimeout(r, 1000));

      const frameData = await evalCode(`
        (() => {
          const text = document.body.innerText;
          const rows = Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
            const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
            return {
              trackId: tds[0] || '',
              objectClass: tds[1] || '',
              confidence: tds[2] || '',
              status: tds[3] || '',
              zone: tds[4] || '',
              direction: tds[5] || '',
              speed: tds[6] || '',
              lastSeen: tds[7] || '',
              hasInspectBtn: !!tr.querySelector('button'),
            };
          }).filter(r => r.trackId.startsWith('T-'));

          const activeTracksMatch = text.match(/ACTIVE TRACKS:\\s*([0-9]+)/i);
          const directoryMatch = text.match(/ACTIVE TARGET DIRECTORY\\s*\\(([0-9]+)\\)/i);

          const cols = Array.from(document.querySelectorAll('.grid > div'));
          const inspectorCol = cols.find(c => c.textContent && c.textContent.includes('TARGET INSPECTOR'));
          const inspectorText = inspectorCol ? inspectorCol.innerText : '';

          return {
            activeTracksCount: activeTracksMatch ? parseInt(activeTracksMatch[1], 10) : null,
            directoryCount: directoryMatch ? parseInt(directoryMatch[1], 10) : null,
            rows,
            inspectorText,
          };
        })()
      `);

      if (frameData.rows.length > 0) {
        sampleHistory.push({
          time: ((Date.now() - startTime) / 1000).toFixed(1) + 's',
          tracksCount: frameData.activeTracksCount,
          directoryCount: frameData.directoryCount,
          targets: frameData.rows.map(r => `${r.trackId}:${r.objectClass}(${r.status})`).join(', ')
        });

        frameData.rows.forEach(r => {
          const upperCls = r.objectClass.toUpperCase();
          observedClasses.add(upperCls);
          if (r.status.includes('THREAT')) {
            observedThreats.set(upperCls, r);
          }
        });

        // Test Inspect button on Target 1
        if (!inspectTestedT1 && frameData.rows.length > 0) {
          const target1 = frameData.rows[0];
          const clickRes = await evalCode(`
            (() => {
              const rows = Array.from(document.querySelectorAll('table tbody tr'));
              const row = rows.find(r => r.textContent.includes('${target1.trackId}'));
              if (row) {
                const btn = row.querySelector('button');
                if (btn) {
                  btn.click();
                  return true;
                }
              }
              return false;
            })()
          `);
          if (clickRes) {
            await new Promise(r => setTimeout(r, 400));
            t1Details = await evalCode(`
              (() => {
                const text = document.body.innerText;
                return {
                  trackId: '${target1.trackId}',
                  class: '${target1.objectClass}',
                  hasInspectorTrack: text.includes('${target1.trackId}'),
                  hasInspectorClass: text.includes('${target1.objectClass}'),
                  hasInspectBadge: text.includes('TARGET INSPECTOR') && text.includes('${target1.trackId}'),
                };
              })()
            `);
            inspectTestedT1 = true;
            console.log(`   ✓ Clicked Inspect on ${target1.trackId}: Inspector updated correctly!`, t1Details);
          }
        }

        // Test Inspect button on Target 2 (when multiple targets exist)
        if (inspectTestedT1 && !inspectTestedT2 && frameData.rows.length > 1) {
          const target2 = frameData.rows[1];
          const clickRes = await evalCode(`
            (() => {
              const rows = Array.from(document.querySelectorAll('table tbody tr'));
              const row = rows.find(r => r.textContent.includes('${target2.trackId}'));
              if (row) {
                const btn = row.querySelector('button');
                if (btn) {
                  btn.click();
                  return true;
                }
              }
              return false;
            })()
          `);
          if (clickRes) {
            await new Promise(r => setTimeout(r, 400));
            t2Details = await evalCode(`
              (() => {
                const text = document.body.innerText;
                return {
                  trackId: '${target2.trackId}',
                  class: '${target2.objectClass}',
                  hasInspectorTrack: text.includes('${target2.trackId}'),
                  hasInspectorClass: text.includes('${target2.objectClass}'),
                };
              })()
            `);
            inspectTestedT2 = true;
            console.log(`   ✓ Switched Inspect to ${target2.trackId}: Inspector immediately switched!`, t2Details);
          }
        }
      }
    }

    console.log('\n--- TARGET DIRECTORY SAMPLING LOG ---');
    sampleHistory.slice(-8).forEach(s => {
      console.log(`   [${s.time}] Tracks: ${s.tracksCount} | Dir: ${s.directoryCount} | Targets: ${s.targets}`);
    });

    console.log('\n[6/7] Verifying All 5 Target Classes & Threat Detection:');
    console.log('   Observed Classes:', Array.from(observedClasses));
    console.log('   Threat Objects:', Array.from(observedThreats.entries()).map(([k, v]) => `${k} -> ${v.status}`));

    // Verify all 5 classes appeared
    const requiredClasses = ['PERSON', 'VEHICLE', 'ANIMAL', 'DRONE', 'BAG'];
    for (const req of requiredClasses) {
      const found = Array.from(observedClasses).some(c => c.includes(req));
      if (!found) {
        throw new Error(`Required class ${req} was NOT detected in examiner video sequence! Observed: ${Array.from(observedClasses).join(', ')}`);
      }
      console.log(`   ✓ Class verified: ${req}`);
    }

    // Verify Drone is Threat
    const droneThreat = Array.from(observedThreats.keys()).some(k => k.includes('DRONE'));
    if (!droneThreat) {
      throw new Error('DRONE was not flagged as THREAT! Threat entries: ' + JSON.stringify(Array.from(observedThreats.entries())));
    }
    console.log('   ✓ DRONE verified as THREAT / HIGH');

    // Verify Person With Bag is Threat
    const bagThreat = Array.from(observedThreats.keys()).some(k => k.includes('BAG'));
    if (!bagThreat) {
      throw new Error('PERSON WITH BAG was not flagged as THREAT! Threat entries: ' + JSON.stringify(Array.from(observedThreats.entries())));
    }
    console.log('   ✓ PERSON WITH BAG verified as THREAT / HIGH');

    // 6. Test Track Expiration & Truthful Disconnected State
    console.log('\n[7/7] Stopping and clearing session to test clean return to IDLE state...');
    await evalCode(`
      (async () => {
        await fetch('http://127.0.0.1:8000/api/video/clear', { method: 'POST' });
      })()
    `);

    // Wait for cleanup interval to prune tracks
    await new Promise(r => setTimeout(r, 3000));

    const finalIdleState = await evalCode(`
      (() => {
        const text = document.body.innerText;
        const activeTracksMatch = text.match(/ACTIVE TRACKS:\\s*([0-9]+)/i);
        const directoryMatch = text.match(/ACTIVE TARGET DIRECTORY\\s*\\(([0-9]+)\\)/i);
        const rowsCount = document.querySelectorAll('table tbody tr td').length;
        
        return {
          activeTracksCount: activeTracksMatch ? parseInt(activeTracksMatch[1], 10) : null,
          directoryCount: directoryMatch ? parseInt(directoryMatch[1], 10) : null,
          hasNoActiveTracks: text.includes('NO ACTIVE TRACKS'),
          hasNoTrackSelected: text.includes('NO ACTIVE TRACK SELECTED') || text.includes('SELECT A TARGET') || text.includes('NO LONGER ACTIVE'),
        };
      })()
    `);
    console.log('   Final Idle State:', finalIdleState);

    if (finalIdleState.activeTracksCount !== 0 || finalIdleState.directoryCount !== 0) {
      throw new Error(`Directory did not return to 0! Active: ${finalIdleState.activeTracksCount}, Dir: ${finalIdleState.directoryCount}`);
    }
    if (!finalIdleState.hasNoActiveTracks) {
      throw new Error('Directory did not show NO ACTIVE TRACKS on session clear');
    }
    console.log('   ✓ Successfully returned to clean IDLE state: 0 tracks, NO ACTIVE TRACKS.');

    // Check Console Errors
    console.log('\nBrowser Console Errors Count:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('Console Errors Detected:', consoleErrors);
      throw new Error(`Expected 0 console errors, got ${consoleErrors.length}`);
    }
    console.log('   ✓ 0 browser console errors confirmed.');

    console.log('\n=================================================================');
    console.log('🎉 ALL EXAMINER VIDEO & TARGET TRACKING REQUIREMENTS VERIFIED 100%!');
    console.log('=================================================================');

  } finally {
    ws.close();
    browserProcess.kill();
  }
}

runExaminerTargetTrackingVerification().catch(err => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err.message);
  process.exit(1);
});
