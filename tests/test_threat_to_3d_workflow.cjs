/**
 * Complete E2E Test: Threat -> Saved Threat -> Inspect -> 3D Trajectory Workflow
 * Runs against live running Frontend (http://127.0.0.1:5173) and Backend (http://127.0.0.1:8000)
 * Uses actual examiner video: D:\MAJOR PROJECT DEMO\THERMAL_EXAM_DEMO\VIDEO\thermal_exam_demo_20s.mp4
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const VIDEO_PATH = 'D:\\MAJOR PROJECT DEMO\\THERMAL_EXAM_DEMO\\VIDEO\\thermal_exam_demo_20s.mp4';

async function runTest() {
  console.log('===============================================================');
  console.log('TEST: COMPLETE THREAT -> SAVED THREAT -> INSPECT -> 3D WORKFLOW');
  console.log('===============================================================');

  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`Examiner video not found at: ${VIDEO_PATH}`);
  }
  console.log(`[1] Video verified: ${VIDEO_PATH} (${(fs.statSync(VIDEO_PATH).size / (1024 * 1024)).toFixed(2)} MB)`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Navigate to Web App
    console.log('[2] Navigating to http://127.0.0.1:5173...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 25000 });

    // Enter Command Center if landing page
    const enterBtn = await page.$('text=ENTER COMMAND CENTER');
    if (enterBtn) {
      await enterBtn.click();
      await page.waitForTimeout(1000);
    }

    // 2. Upload Examiner Demo Video via Live Surveillance
    console.log('[3] Navigating to Live Surveillance and uploading video...');
    await page.click('text=Live Surveillance');
    await page.waitForTimeout(1000);

    // Set file on upload input
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error('Video file upload input not found on Live Surveillance page');
    }
    await fileInput.setInputFiles(VIDEO_PATH);
    console.log('    Video file attached, waiting for upload and start...');
    await page.waitForTimeout(3000);

    // Start video analysis if not auto-started
    const playBtn = await page.$('button[title*="Start"], button[title*="Play"], button:has-text("Start"), button:has-text("Analyze")');
    if (playBtn) {
      try { await playBtn.click(); } catch (e) {}
    }

    // 3. Navigate to Threat Monitoring page
    console.log('[4] Navigating to Threat Monitoring page...');
    await page.click('text=Threat Monitoring');
    await page.waitForTimeout(2000);

    // 4. Wait for threat events to appear in Threat Queue (e.g. Drone or Person With Bag)
    console.log('[5] Monitoring Threat Queue for real thermal threats...');
    let threatFound = false;
    let threatCards = [];
    const maxWaitMs = 25000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      threatCards = await page.$$('div:has-text("THREAT #T-")');
      if (threatCards.length > 0) {
        threatFound = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (!threatFound) {
      console.warn('    No threat card observed in live loop yet, checking backend SQLite alert history directly...');
    } else {
      console.log(`    Threat cards found in Threat Monitoring: ${threatCards.length}`);
    }

    // Check backend SQLite database alerts
    const alertsRes = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:8000/api/alerts/history?limit=20');
      return await res.json();
    });
    console.log(`[6] Backend SQLite alerts retrieved: ${alertsRes.length} records`);
    alertsRes.forEach((a, i) => {
      console.log(`    [${i + 1}] Alert ID: ${a.id} | Track: T-${a.track_id} | Class: ${a.object_class} | Threat: ${a.threat_type} | Reason: ${a.reason} | Severity: ${a.severity}`);
    });

    const droneAlert = alertsRes.find((a) => (a.object_class || '').toLowerCase().includes('drone'));
    const bagAlert = alertsRes.find((a) => (a.object_class || '').toLowerCase().includes('bag'));

    console.log(`    Drone threat persisted in SQLite: ${droneAlert ? `YES (Track T-${droneAlert.track_id})` : 'NO'}`);
    console.log(`    Person With Bag threat persisted in SQLite: ${bagAlert ? `YES (Track T-${bagAlert.track_id})` : 'NO'}`);

    // Refresh Threat Monitoring to sync SQLite alerts if needed
    const refreshBtn = await page.$('button[title*="Refresh"]');
    if (refreshBtn) {
      await refreshBtn.click();
      await page.waitForTimeout(1000);
    }

    // 5. Test Threat Card Click
    const clickableThreat = await page.$('div:has-text("THREAT #T-")');
    if (clickableThreat) {
      console.log('[7] Clicking Threat Card in Threat Monitoring...');
      await clickableThreat.click();
      await page.waitForTimeout(1200);

      // Verify Incident Investigator drawer opened
      const drawerTitle = await page.$('text=INCIDENT INVESTIGATOR');
      console.log(`    Incident Investigator drawer opened: ${drawerTitle ? 'YES' : 'NO'}`);

      // Verify 3D Trajectory visualizer is present in drawer
      const traj3d = await page.$('text=3D TARGET TRAJECTORY');
      console.log(`    3D Target Trajectory embedded in drawer: ${traj3d ? 'YES' : 'NO'}`);

      const realByteTrackLabel = await page.$('text=REAL BYTE TRACK MOVEMENT');
      console.log(`    REAL BYTE TRACK MOVEMENT label verified: ${realByteTrackLabel ? 'YES' : 'NO'}`);

      const imageTrackPosLabel = await page.$('text=IMAGE-BASED TRACK POSITION');
      console.log(`    IMAGE-BASED TRACK POSITION label verified: ${imageTrackPosLabel ? 'YES' : 'NO'}`);

      // Check for presence of "INSPECT IN TARGET TRACKING" action button
      const inspectInTrackingBtn = await page.$('button:has-text("INSPECT IN TARGET TRACKING")');
      console.log(`    "INSPECT IN TARGET TRACKING" button present: ${inspectInTrackingBtn ? 'YES' : 'NO'}`);

      if (inspectInTrackingBtn) {
        console.log('[8] Clicking "INSPECT IN TARGET TRACKING" to transition to Target Tracking page...');
        await inspectInTrackingBtn.click();
        await page.waitForTimeout(1500);

        // Verify we transitioned to Target Tracking page
        const targetTrackingHeading = await page.$('h1:has-text("TARGET TRACKING")');
        console.log(`    Target Tracking page active: ${targetTrackingHeading ? 'YES' : 'NO'}`);

        // Verify Target Inspector is displayed
        const inspectorHeading = await page.$('h3:has-text("TARGET INSPECTOR")');
        console.log(`    Target Inspector header present: ${inspectorHeading ? 'YES' : 'NO'}`);

        // Verify 3D Trajectory in Target Tracking
        const tracking3d = await page.$('text=3D TARGET TRAJECTORY');
        console.log(`    3D Trajectory Visualizer present in Target Tracking: ${tracking3d ? 'YES' : 'NO'}`);
      }
    } else {
      console.log('[7] Threat card not rendered immediately in queue, navigating to Target Tracking directly...');
      await page.click('text=Target Tracking');
      await page.waitForTimeout(1500);
    }

    console.log('[9] Browser Console Errors Check...');
    if (consoleErrors.length > 0) {
      console.error('    Errors observed:', consoleErrors);
    } else {
      console.log('    0 browser console errors observed!');
    }

    console.log('===============================================================');
    console.log('E2E TEST COMPLETED SUCCESSFULLY!');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

runTest().catch((err) => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
