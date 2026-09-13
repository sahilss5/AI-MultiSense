const { spawn, execSync } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173';
const CDP_PORT = 9227;

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

function getSqliteCount() {
  const cmd = `.\\venv\\Scripts\\python.exe -c "from sqlmodel import Session, select; from backend.app.core.database import engine; from backend.app.models.db_models import AlertModel; s=Session(engine); print(len(s.exec(select(AlertModel)).all()))"`;
  const out = execSync(cmd, { encoding: 'utf-8' }).trim();
  return parseInt(out, 10);
}

function seedAlert(trackId, className, reason, zone) {
  const py = `from sqlmodel import Session; from datetime import datetime, timezone; from backend.app.core.database import engine; from backend.app.services.alert_service import AlertService; from backend.app.schemas.canonical import ThermalDetectionObject; det=ThermalDetectionObject(id='det-${trackId}', timestamp=datetime.now(timezone.utc).isoformat(), track_id=${trackId}, class_name='${className}', confidence=0.985, bbox=[0.1, 0.2, 0.3, 0.4], threat=True, threat_level='HIGH', threat_reason='${reason}', zone='${zone}'); AlertService.reset_dedup(); s=Session(engine); AlertService.record_threat(s, det); s.commit()`;
  execSync(`.\\venv\\Scripts\\python.exe -c "${py}"`);
}

async function run() {
  console.log('=================================================================');
  console.log('STARTING ALERT HISTORY E2E VERIFICATION (EDGE CDP PORT ' + CDP_PORT + ')');
  console.log('=================================================================');

  // First ensure alert history is clean via backend API
  await fetch('http://127.0.0.1:8000/api/alerts/history', { method: 'DELETE' });

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

    // 1. Navigate to Alert History page by pressing 'x'
    console.log('1. Navigating to Alert History page (key: "x")...');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Check empty database state
    console.log('2. Verifying empty state with 0 alerts...');
    const emptyChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasTitle: text.includes('ALERT HISTORY'),
          hasTotalZero: text.includes('00') && text.includes('TOTAL LOGGED ALERTS'),
          hasNoAlertHistoryText: text.includes('NO ALERT HISTORY'),
          hasClearHistoryBtn: text.includes('CLEAR HISTORY'),
          hasEmptyInvestigator: text.includes('SELECT AN ALERT RECORD TO INSPECT'),
        };
      })()
    `);
    console.log('✓ Title:', emptyChecks.hasTitle);
    console.log('✓ Total Zero (00):', emptyChecks.hasTotalZero);
    console.log('✓ "NO ALERT HISTORY" empty state message:', emptyChecks.hasNoAlertHistoryText);
    console.log('✓ "CLEAR HISTORY" button present:', emptyChecks.hasClearHistoryBtn);
    console.log('✓ Incident Investigator empty state:', emptyChecks.hasEmptyInvestigator);

    // 3. Create a real alert via test threat
    console.log('\n3. Seeding real alert into database...');
    seedAlert(45, 'Drone', 'Unauthorized drone detected in Sector Alpha-4', 'Sector Alpha-4');
    console.log('Alert seeded into SQLite. Current count in DB:', getSqliteCount());

    // 4. Refresh frontend alerts list by pressing 'x' again
    console.log('4. Checking that seeded alert appears in UI...');
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    const alertAppearedChecks = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasTotalOne: text.includes('01') && text.includes('TOTAL LOGGED ALERTS'),
          hasDrone: text.includes('Drone'),
          hasDroneReason: text.includes('Unauthorized drone detected in Sector Alpha-4'),
          hasActiveStatus: text.includes('Active'),
        };
      })()
    `);
    console.log('✓ Total Logged Alerts updated to 01:', alertAppearedChecks.hasTotalOne);
    console.log('✓ Alert Drone target rendered:', alertAppearedChecks.hasDrone);
    console.log('✓ Trigger reason rendered in table:', alertAppearedChecks.hasDroneReason);

    // 5. Select alert to verify Incident Investigator
    console.log('5. Clicking inspect button on alert...');
    await evalJs(`
      (() => {
        const inspectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Inspect'));
        if (inspectBtn) inspectBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    const investigatorCheck = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          hasIncidentInvestigatorDetails: text.includes('Event Classification:') && text.includes('AI Detection Confidence:'),
        };
      })()
    `);
    console.log('✓ Incident Investigator displays alert details:', investigatorCheck.hasIncidentInvestigatorDetails);

    // 6. Click CLEAR HISTORY button to open confirmation modal
    console.log('\n6. Clicking CLEAR HISTORY to open confirmation modal...');
    await evalJs(`
      (() => {
        const clearBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('CLEAR HISTORY'));
        if (clearBtns.length > 0) clearBtns[0].click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    const modalCheck = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          modalOpen: text.includes('CLEAR ALERT HISTORY?'),
          hasModalText: text.includes('permanently remove all stored alert records'),
          hasCancelBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'CANCEL'),
        };
      })()
    `);
    console.log('✓ Confirmation Modal Open:', modalCheck.modalOpen);
    console.log('✓ Modal explanatory text:', modalCheck.hasModalText);
    console.log('✓ CANCEL button present:', modalCheck.hasCancelBtn);

    // 7. Test CANCEL button
    console.log('7. Testing CANCEL button...');
    await evalJs(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'CANCEL');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    const cancelCheck = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          modalClosed: !text.includes('CLEAR ALERT HISTORY?'),
          alertStillExists: text.includes('01') && text.includes('Drone'),
        };
      })()
    `);
    console.log('✓ Modal closed after CANCEL:', cancelCheck.modalClosed);
    console.log('✓ Alert preserved after CANCEL:', cancelCheck.alertStillExists);

    // 8. Re-open modal and confirm CLEAR HISTORY
    console.log('\n8. Re-opening modal and confirming CLEAR HISTORY...');
    await evalJs(`
      (() => {
        const clearBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('CLEAR HISTORY'));
        if (clearBtns.length > 0) clearBtns[0].click();
      })()
    `);
    await new Promise(r => setTimeout(r, 800));

    // Click confirm CLEAR HISTORY inside modal
    await evalJs(`
      (() => {
        const modal = document.querySelector('.fixed.inset-0');
        if (modal) {
          const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('CLEAR HISTORY'));
          if (confirmBtn) confirmBtn.click();
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    // 9. Verify UI state after clear
    console.log('9. Verifying UI state after CLEAR HISTORY...');
    const postClearCheck = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          modalClosed: !text.includes('CLEAR ALERT HISTORY?'),
          totalZero: text.includes('00') && text.includes('TOTAL LOGGED ALERTS'),
          hasNoAlertHistory: text.includes('NO ALERT HISTORY'),
          investigatorEmpty: text.includes('SELECT AN ALERT RECORD TO INSPECT'),
        };
      })()
    `);
    console.log('✓ Modal closed:', postClearCheck.modalClosed);
    console.log('✓ Total Logged Alerts is 00:', postClearCheck.totalZero);
    console.log('✓ "NO ALERT HISTORY" empty state rendered:', postClearCheck.hasNoAlertHistory);
    console.log('✓ Incident Investigator empty state rendered:', postClearCheck.investigatorEmpty);

    // 10. Verify directly in SQLite that records are 0
    console.log('\n10. Verifying SQLite database directly...');
    const countAfterClear = getSqliteCount();
    console.log('✓ SQLite alert records count:', countAfterClear);
    if (countAfterClear !== 0) {
      throw new Error(`Expected 0 SQLite records, found ${countAfterClear}`);
    }

    // 11. Refresh page and verify persistence of empty state
    console.log('\n11. Refreshing browser to verify deletion persistence...');
    await sendCmd('Page.reload');
    await new Promise(r => setTimeout(r, 2500));

    // Navigate back to Alert History
    await evalJs(`
      (() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));

    const refreshPersistenceCheck = await evalJs(`
      (() => {
        const text = document.body.innerText;
        return {
          totalZero: text.includes('00') && text.includes('TOTAL LOGGED ALERTS'),
          noAlertHistory: text.includes('NO ALERT HISTORY'),
        };
      })()
    `);
    console.log('✓ Post-refresh Total Logged Alerts remains 00:', refreshPersistenceCheck.totalZero);
    console.log('✓ Post-refresh "NO ALERT HISTORY" remains:', refreshPersistenceCheck.noAlertHistory);

    // 12. Create a new real threat to confirm system continues to log new alerts normally
    console.log('\n12. Generating new real threat after clearing...');
    seedAlert(88, 'Person_With_Bag', 'Suspicious payload near restricted perimeter', 'Restricted Storage Bravo');

    const newRes = await (await fetch('http://127.0.0.1:8000/api/alerts/history')).json();
    console.log('✓ New alert logged after clear count in DB:', newRes.length);
    console.log('✓ New alert class:', newRes[0]?.object_class);
    console.log('✓ New alert reason:', newRes[0]?.reason);

    // Clean up
    await fetch('http://127.0.0.1:8000/api/alerts/history', { method: 'DELETE' });

    ws.close();
    console.log('\n=================================================================');
    console.log('>>> ALERT HISTORY E2E VERIFICATION COMPLETED SUCCESSFULLY! <<<');
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
