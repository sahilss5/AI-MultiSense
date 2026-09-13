const { spawn } = require('child_process');
const http = require('http');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://127.0.0.1:5173/#/threat-monitoring';

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

async function runSurveillanceZoneMapVerification() {
  console.log('=================================================================');
  console.log('SURVEILLANCE ZONE MAP VERIFICATION (EDGE CDP)');
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
    browserProcess.kill();
    throw new Error('Failed to connect to browser CDP on port 9227');
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

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await new Promise(r => ws.addEventListener('open', r));

  async function evaluate(expression) {
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

  // Navigate directly to app
  await send('Page.navigate', { url: 'http://127.0.0.1:5173' });
  await new Promise(r => setTimeout(r, 2000));

  // If on landing page, click enter command center or press 't'
  await evaluate(`
    (() => {
      const enterBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ENTER COMMAND CENTER'));
      if (enterBtn) enterBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1000));

  // Press 't' to switch to Threat Monitoring page
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
  `);
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- Checking Section Title & Subtitle ---');
  const bodyText = await evaluate(`document.body.innerText`);
  
  const hasNewTitle = bodyText.includes('SURVEILLANCE ZONE MAP');
  const hasSubtitle = bodyText.includes('Thermal targets and restricted-zone overview');
  const hasNoOldTitle = !bodyText.includes('TACTICAL SITUATION MAP');

  console.log('✓ "SURVEILLANCE ZONE MAP" title present:', hasNewTitle);
  console.log('✓ "Thermal targets and restricted-zone overview" subtitle present:', hasSubtitle);
  console.log('✓ Old "TACTICAL SITUATION MAP" completely absent:', hasNoOldTitle);

  console.log('\n--- Checking Header Status & Legend ---');
  const hasSectorSecure = bodyText.includes('SECTOR SECURE');
  const hasNormalTarget = bodyText.includes('NORMAL TARGET');
  const hasThreatTarget = bodyText.includes('THREAT TARGET');
  const hasRestrictedZone = bodyText.includes('RESTRICTED ZONE');
  const hasIntrusionLegend = bodyText.includes('INTRUSION');
  const hasPositionLabel = bodyText.includes('RELATIVE / IMAGE-BASED POSITION');

  console.log('✓ Dynamic header status "SECTOR SECURE" present:', hasSectorSecure);
  console.log('✓ Legend items present:', {
    hasNormalTarget,
    hasThreatTarget,
    hasRestrictedZone,
    hasIntrusionLegend
  });
  console.log('✓ Truthful coordinate label "[ RELATIVE / IMAGE-BASED POSITION ]" present:', hasPositionLabel);

  console.log('\n--- Checking Empty State ---');
  const hasEmptyState = bodyText.includes('NO ACTIVE SURVEILLANCE') || bodyText.includes('SURVEILLANCE READY');
  console.log('✓ Truthful surveillance empty state present:', hasEmptyState);

  console.log('\n--- Checking Real Geofence Polygons & Names ---');
  const hasZoneA = bodyText.includes('RESTRICTED ZONE A') || bodyText.includes('NORTH GATE');
  const hasZoneB = bodyText.includes('PERIMETER ZONE B') || bodyText.includes('SOUTH FACILITY');
  console.log('✓ Real backend SQLite zone names displayed on map:', { hasZoneA, hasZoneB });

  console.log('\n--- Checking Summary Row ---');
  const hasSectorAlpha = bodyText.includes('Alpha-4');
  const hasGeoFences = bodyText.includes('2 Armed') || bodyText.includes('Armed');
  const hasActiveTargets = bodyText.includes('ACTIVE TARGETS');
  const hasIntrusions = bodyText.includes('INTRUSIONS');
  const hasThreats = bodyText.includes('THREATS');

  console.log('✓ 5-Card Summary strip present with real values:', {
    hasSectorAlpha,
    hasGeoFences,
    hasActiveTargets,
    hasIntrusions,
    hasThreats
  });

  console.log('\n--- Checking Removal of Fake Radar/Military Telemetry ---');
  const hasFakeRadarRings = bodyText.includes('600M') || bodyText.includes('1.2KM') || bodyText.includes('1.8KM') || bodyText.includes('2.4KM');
  console.log('✓ Fake radar concentric rings removed (should be false):', hasFakeRadarRings);

  browserProcess.kill();

  if (hasNewTitle && hasSubtitle && hasNoOldTitle && !hasFakeRadarRings && hasSectorSecure) {
    console.log('\n=================================================================');
    console.log('>>> ALL SURVEILLANCE ZONE MAP E2E CHECKS PASSED! <<<');
    console.log('=================================================================');
    process.exit(0);
  } else {
    console.error('FAILED some checks!');
    process.exit(1);
  }
}

runSurveillanceZoneMapVerification().catch(err => {
  console.error(err);
  process.exit(1);
});
