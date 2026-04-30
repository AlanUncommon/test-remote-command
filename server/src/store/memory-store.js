const bcrypt = require('bcryptjs');
const config = require('../config');

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.refreshTokens = new Map();
    this.revokedTokens = new Set();
    this.usedEnrollmentTokens = new Set();
  }

  async createUser(email, password, role = 'user') {
    if (this.findUserByEmail(email)) {
      throw new Error('EMAIL_EXISTS');
    }
    const userId = 'u_' + require('crypto').randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    this.users.set(userId, { userId, email, passwordHash, role, createdAt: Date.now() });
    return userId;
  }

  async authenticateUser(email, password) {
    const user = this.findUserByEmail(email);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.passwordHash);
    return match ? user : null;
  }

  findUserById(userId) {
    return this.users.get(userId) || null;
  }

  findUserByEmail(email) {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  saveRefreshToken(userId, token) {
    const expiresAt = Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
    this.refreshTokens.set(token, { userId, token, createdAt: Date.now(), expiresAt });
  }

  findRefreshToken(token) {
    const entry = this.refreshTokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.refreshTokens.delete(token);
      return null;
    }
    return entry;
  }

  deleteRefreshToken(token) {
    this.refreshTokens.delete(token);
  }

  revokeToken(jti) {
    this.revokedTokens.add(jti);
  }

  isTokenRevoked(jti) {
    return this.revokedTokens.has(jti);
  }

  markEnrollmentUsed(jti) {
    this.usedEnrollmentTokens.add(jti);
  }

  isEnrollmentUsed(jti) {
    return this.usedEnrollmentTokens.has(jti);
  }
}

const store = new MemoryStore();
module.exports = store;
