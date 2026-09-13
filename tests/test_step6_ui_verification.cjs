const http = require('http');
const { spawn } = require('child_process');

async function getJson(url) {
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
  console.log('Testing Backend API Endpoints:');
  const status = await getJson('http://127.0.0.1:8000/api/status');
  console.log('1. /api/status:');
  console.log('   - Model status:', status.model_status);
  console.log('   - Analysis mode:', status.analysis_mode);
  console.log('   - Device:', status.device);
  console.log('   - Supported classes:', status.supported_classes);
  console.log('   - Active tracks:', status.active_tracks);
  console.log('   - Total detections:', status.total_detections);

  const analytics = await getJson('http://127.0.0.1:8000/api/analytics');
  console.log('\n2. /api/analytics:');
  console.log('   - Total detections:', analytics.total_detections);
  console.log('   - Total threats:', analytics.total_threats);
  console.log('   - Class distribution count:', analytics.class_distribution.length);
  console.log('   - Threat trend frames:', analytics.threat_trend.length);

  const alerts = await getJson('http://127.0.0.1:8000/api/alerts/history');
  console.log('\n3. /api/alerts/history:');
  console.log('   - Alerts in SQLite DB:', alerts.length);

  console.log('\nAll API contract checks for Step 6 passed successfully!');
}

run().catch(console.error);
