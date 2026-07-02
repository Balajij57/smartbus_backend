// SMS service - supports Twilio. Falls back to console-only logging when not configured.
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { SmsLog } from './src/models/SmsLog.js';
import { getConfigs } from './src/config/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy import twilio so the server still starts even if it's not installed
let twilioClient = null;
let twilioFrom = null;
let twilioReady = false;

async function initTwilio() {
  const configs = getConfigs();
  console.log(`📱 SMS Environment Mode: DEMO_MODE=${configs.DEMO_MODE}`);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  
  console.log(`📱 Twilio Credentials Present: AccountSID=${!!sid}, AuthToken=${!!token}, FromNumber=${!!from}`);

  if (!sid || !token || !from) {
    console.warn('⚠️ Twilio config missing in production mode! Actual SMS sending is disabled.');
    return;
  }

  try {
    const twilioMod = await import('twilio');
    const twilio = twilioMod.default || twilioMod;
    twilioClient = twilio(sid, token);
    twilioFrom = from;
    twilioReady = true;
    console.log('📱 Twilio SMS is enabled. Sending from', from);
  } catch (e) {
    console.warn('⚠️  Twilio not installed or failed to init:', e?.message || e);
  }
}
initTwilio();

const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '+91';

// Normalise local 10-digit numbers to E.164 (eg +91XXXXXXXXXX)
function normalisePhone(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `${DEFAULT_COUNTRY_CODE}${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('0')) return `${DEFAULT_COUNTRY_CODE}${cleaned.slice(1)}`;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  return `+${cleaned}`;
}

// Log file for SMS history (so you can see what would be sent even without Twilio)
const SMS_LOG_PATH = path.join(__dirname, 'sms_log.json');
function readLog() {
  try { return JSON.parse(fs.readFileSync(SMS_LOG_PATH, 'utf-8')); } catch { return []; }
}
function appendLog(entry) {
  const log = readLog();
  log.unshift(entry);
  fs.writeFileSync(SMS_LOG_PATH, JSON.stringify(log.slice(0, 500), null, 2));
}

// Helper delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const smsLockMap = new Map(); // key: studentId:eventType, value: timestamp

export async function sendSMS(to, body, studentId = null, eventType = null, tripId = null) {
  const configs = getConfigs();

  if (studentId && eventType) {
    const key = `${studentId}:${eventType}`;
    const now = Date.now();
    if (smsLockMap.has(key)) {
      const lastSent = smsLockMap.get(key);
      if (now - lastSent < 5 * 60 * 1000) {
        console.log(`📱 SMS duplicate skipped: lock active for ${key}`);
        return {
          smsId: `SMS-SKIPPED-${Date.now()}`,
          to: to || '(missing)',
          body,
          provider: 'none',
          status: 'skipped',
          error: 'Duplicate SMS lock active',
          retryCount: 0
        };
      }
    }
    smsLockMap.set(key, now);
  }

  const phone = normalisePhone(to);
  const smsId = `SMS-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const entry = {
    smsId,
    to: phone || '(missing)',
    body,
    provider: configs.DEMO_MODE ? 'demo' : (twilioReady ? 'twilio' : 'console'),
    status: 'pending',
    error: null,
    retryCount: 0,
    isDemo: configs.DEMO_MODE,
    student_id: studentId,
    trip_id: tripId,
    scanMode: eventType,
  };

  if (configs.DEMO_MODE) {
    entry.status = 'sent';
    entry.retryCount = 0;
    appendLog(entry);
    try {
      await SmsLog.create(entry);
    } catch (dbErr) {
      console.error('Error saving SmsLog to MongoDB:', dbErr.message);
    }
    console.log(`📱 [SMS-DEMO-SENT] To ${phone}: ${body}`);
    return entry;
  }

  // If Twilio configuration is missing in production
  if (!twilioReady) {
    const errMessage = 'SMS provider not configured.';
    entry.status = 'failed';
    entry.error = errMessage;
    appendLog(entry);
    try {
      await SmsLog.create(entry);
    } catch (dbErr) {
      console.error('Error saving SmsLog to MongoDB:', dbErr.message);
    }
    throw new Error(errMessage);
  }

  if (!phone) {
    entry.status = 'failed';
    entry.error = 'No phone number';
    appendLog(entry);
    try {
      await SmsLog.create(entry);
    } catch (dbErr) {
      console.error('Error saving SmsLog to MongoDB:', dbErr.message);
    }
    console.warn('📱 SMS skipped — no phone number');
    return entry;
  }

  // Save to database as pending initially
  let mongoLog = null;
  try {
    mongoLog = await SmsLog.create(entry);
  } catch (dbErr) {
    console.error('Error creating initial SmsLog in MongoDB:', dbErr.message);
  }

  const maxRetries = 3;
  let success = false;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const msg = await twilioClient.messages.create({
        to: phone,
        from: twilioFrom,
        body,
      });
      success = true;
      entry.status = 'sent';
      entry.provider_id = msg.sid;
      entry.retryCount = attempt - 1;
      
      appendLog(entry);
      if (mongoLog) {
        mongoLog.status = 'sent';
        mongoLog.retryCount = attempt - 1;
        await mongoLog.save();
      }
      console.log(`📱 [SMS-SENT] To ${phone} via Twilio (sid ${msg.sid}, attempt ${attempt})`);
      break;
    } catch (e) {
      lastError = e?.message || String(e);
      console.warn(`📱 [SMS-TRY-FAIL] Attempt ${attempt} failed: ${lastError}`);
      if (attempt < maxRetries) {
        await delay(1000 * attempt); // exponential backoff
      }
    }
  }

  if (!success) {
    entry.status = 'failed';
    entry.error = lastError;
    entry.retryCount = maxRetries;
    appendLog(entry);
    if (mongoLog) {
      mongoLog.status = 'failed';
      mongoLog.error = lastError;
      mongoLog.retryCount = maxRetries;
      await mongoLog.save();
    }
    console.error('📱 [SMS-FAIL] Twilio failed after all attempts:', lastError);
  }

  return entry;
}

export function getSmsLog() {
  return readLog();
}

export function smsConfigured() {
  return twilioReady;
}
