import http from 'http';

function post(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  try {
    console.log('=== Triggering Student Boarded Scan ===');
    const boardRes = await post('http://localhost:5000/api/scan', {
      qr_student_id: 'STU001',
      action: 'board',
      bus_number: 'BUS-12',
      scanner_token: 'SCANNER_BUS12'
    });
    console.log('Board Scan Response:', JSON.stringify(boardRes, null, 2));

    console.log('\n=== Triggering Student Dropped Scan ===');
    const dropRes = await post('http://localhost:5000/api/scan', {
      qr_student_id: 'STU001',
      action: 'dropoff',
      bus_number: 'BUS-12',
      scanner_token: 'SCANNER_BUS12'
    });
    console.log('Drop Scan Response:', JSON.stringify(dropRes, null, 2));
  } catch (err) {
    console.error('Scan request failed:', err.message);
  }
}

run();
