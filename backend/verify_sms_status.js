import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

http.get('http://localhost:5000/api/sms/status', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('GET /api/sms/status response:');
    console.log(JSON.stringify(JSON.parse(data), null, 2));
    console.log('\n=== Environment Variable Check ===');
    console.log('TWILIO_ACCOUNT_SID exists:', !!process.env.TWILIO_ACCOUNT_SID);
    console.log('TWILIO_AUTH_TOKEN exists:', !!process.env.TWILIO_AUTH_TOKEN);
    console.log('TWILIO_FROM_NUMBER exists:', !!process.env.TWILIO_FROM_NUMBER);
  });
}).on('error', (err) => {
  console.error('API request failed:', err.message);
});
