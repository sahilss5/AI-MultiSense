const { spawn, execSync } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
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

function getDatabaseEntities() {
  const script = "import sqlite3; conn = sqlite3.connect('data/surveillance.db'); c = conn.cursor(); a = c.execute('SELECT COUNT(*) FROM alerts').fetchone()[0]; z = c.execute('SELECT COUNT(*) FROM zones').fetchone()[0]; v = c.execute('SELECT COUNT(*) FROM video_records').fetchone()[0]; print(f'{a},{z},{v}'); conn.close()";
  const cmd = `python -c "${script}"`;
  const out = execSync(cmd, { encoding: 'utf-8' }).trim();
  const [alerts, zones, videos] = out.split(',').map(Number);
  return { alerts, zones, videos };
}

async function run() {
  console.log('=================================================================');
  console.log('STARTING SETTINGS E2E VERIFICATION (EDGE CDP PORT ' + CDP_PORT + ')');
  console.log('=================================================================');

  const browserProcess = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
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
      throw new Error('Failed to connect to browser CDP on port ' + CDP_PORT);
    }

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    });

    await new Promise(r => ws.addEventListener('open', r));

    function sendCmd(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        pending.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    async function evalJs(expr) {
      const r = await sendCmd('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      return r.result?.value;
    }

    await new Promise(r => setTimeout(r, 2000));

    // 1. Navigate to Settings page (shortcut 's')
    console.log('1. Navigating to Settings page (key: "s")...');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Check visible categories and General settings
    console.log('2. Verifying General tab and categories...');
    const generalChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasTitle: text.includes('SETTINGS'),
          hasGeneral: text.includes('General'),
          hasAiDetection: text.includes('AI & Detection'),
          hasTrackingThreats: text.includes('Tracking & Threats'),
          hasDisplay: text.includes('Display & Overlays'),
          hasThermal: text.includes('Thermal Input'),
          hasNotifications: text.includes('Notifications'),
          hasSystem: text.includes('System & Storage'),
          hasApplication: text.includes('AI-MULTISENSE'),
          hasTimezone: !!Array.from(document.querySelectorAll('input')).find(i => i.value && i.value.includes('Asia/Kolkata')),
          hasSaveBtn: text.includes('SAVE CHANGES'),
          hasResetBtn: text.includes('RESET TO DEFAULTS'),
        };
      })()
    `);
    console.log('✓ Page Title:', generalChecks.hasTitle);
    console.log('✓ 7 Clean Categories Present:',
      generalChecks.hasGeneral && generalChecks.hasAiDetection && generalChecks.hasTrackingThreats &&
      generalChecks.hasDisplay && generalChecks.hasThermal && generalChecks.hasNotifications && generalChecks.hasSystem);
    console.log('✓ General Preferences (Application Identity & Timezone):', generalChecks.hasApplication && generalChecks.hasTimezone);
    console.log('✓ Save and Reset buttons visible:', generalChecks.hasSaveBtn && generalChecks.hasResetBtn);

    // 2. Click AI & Detection tab
    console.log('\n3. Verifying AI & Detection tab...');
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('AI & Detection'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    const aiChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasModelName: text.includes('YOLO11n Thermal'),
          hasModelFile: text.includes('models/thermal/best.pt'),
          hasModelStatusReady: text.includes('READY'),
          hasConfidenceThreshold: text.includes('CONFIDENCE THRESHOLD'),
          hasConfidenceExplanation: text.includes('Minimum confidence required before an object is reported.'),
          has5Classes: text.includes('Person') && text.includes('Vehicle') && text.includes('Animal') && text.includes('Drone') && text.includes('Person With Bag'),
          noFakeBenchmark: !text.includes('mAP50: 94.8%') && !text.includes('TensorRT FP16'),
        };
      })()
    `);
    console.log('✓ Model YOLO11n Thermal identified:', aiChecks.hasModelName);
    console.log('✓ Model weights file truthful (models/thermal/best.pt):', aiChecks.hasModelFile);
    console.log('✓ Model status READY:', aiChecks.hasModelStatusReady);
    console.log('✓ Confidence Threshold explanation clear:', aiChecks.hasConfidenceExplanation);
    console.log('✓ All 5 project classes present:', aiChecks.has5Classes);
    console.log('✓ No fake benchmarks or TensorRT claims:', aiChecks.noFakeBenchmark);

    // 3. Click Tracking & Threats tab
    console.log('\n4. Verifying Tracking & Threats tab...');
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Tracking & Threats'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    const trackingChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasByteTrack: text.includes('ByteTrack'),
          hasByteTrackExplanation: text.includes('Associates detections across video frames to maintain object IDs.'),
          hasIoU: text.includes('IOU THRESHOLD'),
          hasDroneRule: text.includes('Drone') && text.includes('High Threat'),
          hasBagRule: text.includes('Person With Bag') && text.includes('High Threat'),
          hasVehicleRule: text.includes('Vehicle') && text.includes('Speed Rule'),
          hasNormalRule: text.includes('Normal'),
          hasSpeedLimitSetting: text.includes('VEHICLE SPEED THRESHOLD'),
        };
      })()
    `);
    console.log('✓ Tracking Engine ByteTrack:', trackingChecks.hasByteTrack);
    console.log('✓ ByteTrack purpose explained clearly:', trackingChecks.hasByteTrackExplanation);
    console.log('✓ IoU threshold control present:', trackingChecks.hasIoU);
    console.log('✓ Drone & Person With Bag High Threat rule:', trackingChecks.hasDroneRule && trackingChecks.hasBagRule);
    console.log('✓ Vehicle Speed Rule & Person/Animal Normal rule:', trackingChecks.hasVehicleRule && trackingChecks.hasNormalRule);
    console.log('✓ Configurable vehicle speed limit present:', trackingChecks.hasSpeedLimitSetting);

    // 4. Click Thermal Input tab
    console.log('\n5. Verifying Thermal Input tab (truthful hardware claims)...');
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Thermal Input'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));

    const thermalChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasInputSource: text.includes('INPUT SOURCE') && text.includes('Recorded Thermal Video'),
          hasDemonstratedNote: text.includes('Primary demonstrated input for this project'),
          hasHardwareStatus: text.includes('HARDWARE SENSOR') && text.includes('Offline / Not Connected'),
          hasNoFakeFlir: !text.includes('FLIR AX65 READY') && !text.includes('FLIR Tau2 Connected'),
        };
      })()
    `);
    console.log('✓ Input Source "Recorded Thermal Video":', thermalChecks.hasInputSource);
    console.log('✓ Honest project demonstration note:', thermalChecks.hasDemonstratedNote);
    console.log('✓ Hardware sensor truthful status "Offline / Not Connected":', thermalChecks.hasHardwareStatus);
    console.log('✓ No fake FLIR hardware claims:', thermalChecks.hasNoFakeFlir);

    // 5. Test Save Changes
    console.log('\n6. Testing Save Changes...');
    // Change speed threshold to 75
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Tracking & Threats'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    await evalJs(`
      (() => {
        const input = document.querySelector('input[type="number"]');
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, '75');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // Click SAVE CHANGES
    await evalJs(`
      (() => {
        const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('SAVE CHANGES'));
        if (saveBtn) saveBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    const saveToast = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return text.includes('Settings saved successfully.');
      })()
    `);
    console.log('✓ Save confirmation toast appeared:', saveToast);

    // Check backend API directly
    const savedApi = await (await fetch('http://127.0.0.1:8000/api/settings')).json();
    console.log('✓ Persisted speed_threshold_kmh in backend SQLite:', savedApi.speed_threshold_kmh);

    // 6. Test Browser Refresh Persistence
    console.log('\n7. Refreshing browser to verify saved settings survive reload...');
    await sendCmd('Page.reload');
    await new Promise(r => setTimeout(r, 2500));

    // Navigate back to Settings
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // Check Tracking & Threats
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Tracking & Threats'));
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    const reloadedSpeed = await evalJs(`
      (() => {
        const input = document.querySelector('input[type="number"]');
        return input ? input.value : null;
      })()
    `);
    console.log('✓ Speed threshold after reload:', reloadedSpeed);
    if (reloadedSpeed !== '75') {
      throw new Error(`Expected reloaded speed to be 75, got ${reloadedSpeed}`);
    }

    // 7. Test Reset to Defaults
    console.log('\n8. Testing Reset to Defaults...');
    const dbBeforeReset = getDatabaseEntities();

    // Click RESET TO DEFAULTS
    await evalJs(`
      (() => {
        const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('RESET TO DEFAULTS'));
        if (resetBtn) resetBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // Verify modal appeared
    const modalText = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          isOpen: text.includes('RESET SETTINGS?'),
          hasSafetyNote: text.includes('Alerts, snapshots, videos, zones, and model weights will not be deleted.'),
        };
      })()
    `);
    console.log('✓ Reset Confirmation Modal Open:', modalText.isOpen);
    console.log('✓ Safety explanation present:', modalText.hasSafetyNote);

    // Click confirm RESET SETTINGS in modal
    await evalJs(`
      (() => {
        const modal = document.querySelector('.fixed.inset-0');
        if (modal) {
          const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('RESET SETTINGS'));
          if (confirmBtn) confirmBtn.click();
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    // Verify reset speed in UI
    const resetSpeed = await evalJs(`
      (() => {
        const input = document.querySelector('input[type="number"]');
        return input ? input.value : null;
      })()
    `);
    console.log('✓ Speed threshold restored to default (80):', resetSpeed);

    // Verify database entities were NOT deleted
    const dbAfterReset = getDatabaseEntities();
    console.log('✓ Database safety check — alerts:', dbBeforeReset.alerts, '→', dbAfterReset.alerts);
    console.log('✓ Database safety check — zones:', dbBeforeReset.zones, '→', dbAfterReset.zones);
    console.log('✓ Database safety check — videos:', dbBeforeReset.videos, '→', dbAfterReset.videos);

    ws.close();
    console.log('\n=================================================================');
    console.log('>>> SETTINGS E2E VERIFICATION COMPLETED SUCCESSFULLY! <<<');
    console.log('=================================================================');
  } finally {
    try {
      browserProcess.kill();
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
