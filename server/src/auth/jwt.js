const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

function signToken(payload, ttl) {
  return jwt.sign(
    { ...payload, jti: crypto.randomUUID() },
    config.jwtSecret,
    { expiresIn: ttl }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function signAccessToken(userId, role = 'user') {
  return signToken({ userId, role, type: 'dashboard' }, config.accessTokenTtl);
}

function signRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function signEnrollmentToken(userId) {
  return signToken({ userId, purpose: 'enrollment' }, config.enrollmentTokenTtl);
}

function signDeviceToken(userId, deviceId) {
  return signToken({ userId, deviceId, type: 'device' }, config.deviceTokenTtl);
}

module.exports = {
  signToken,
  verifyToken,
  signAccessToken,
  signRefreshToken,
  signEnrollmentToken,
  signDeviceToken,
};
