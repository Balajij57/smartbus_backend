export function getConfigs() {
  const isDemo = process.env.DEMO_MODE === 'true';
  const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

  const configs = {
    DEMO_MODE: isDemo,
    TWILIO_ENABLED: hasTwilio && !isDemo,
    GPS_SIMULATION_ENABLED: isDemo,
    MOCK_SMS_ENABLED: isDemo || !hasTwilio,
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    LAST_CONFIG_RELOAD: new Date()
  };

  // Reject configuration conflicts: DEMO_MODE=true AND TWILIO_ENABLED=true
  if (configs.DEMO_MODE && configs.TWILIO_ENABLED) {
    throw new Error('Configuration conflict detected: DEMO_MODE and TWILIO_ENABLED cannot both be true.');
  }

  return configs;
}
