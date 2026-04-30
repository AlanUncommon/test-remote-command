const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '8768', 10),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-' + require('crypto').randomBytes(16).toString('hex'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10),
  enrollmentTokenTtl: process.env.ENROLLMENT_TOKEN_TTL || '1h',
  deviceTokenTtl: process.env.DEVICE_TOKEN_TTL || '7d',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  maxCommandLength: parseInt(process.env.MAX_COMMAND_LENGTH || '10000', 10),
  rateLimit: {
    connectionsPerMinute: parseInt(process.env.RATE_LIMIT_CONNECTIONS || '5', 10),
    commandsPerMinute: parseInt(process.env.RATE_LIMIT_COMMANDS || '10', 10),
    executionsPerHour: parseInt(process.env.RATE_LIMIT_EXECUTIONS || '30', 10),
  },
  commandBlacklist: [
    /rm\s+-rf\s+\//,
    /mkfs\./,
    /dd\s+if=/,
    />\s*\/dev\/sd/,
    /:\(\)\{.*;\}\s*:/,
  ],
};
