import http from 'http';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  try {
    const buses = await get('http://localhost:5000/api/buses');
    console.log('\n=== Response for GET /api/buses ===');
    console.log(JSON.stringify(buses, null, 2));

    const routes = await get('http://localhost:5000/api/routes');
    console.log('\n=== Response for GET /api/routes ===');
    console.log(JSON.stringify(routes, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

run();
