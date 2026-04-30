const crypto = require('crypto');

class DeviceRegistry {
  constructor() {
    this.devices = new Map();
    this.userDevices = new Map();
    this.socketToDevice = new Map();
  }

  registerDevice(userId, name, os, hostname) {
    const deviceId = 'd_' + crypto.randomBytes(8).toString('hex');
    const record = {
      deviceId,
      userId,
      name: name || `device-${deviceId.slice(0, 6)}`,
      os: os || 'unknown',
      hostname: hostname || 'unknown',
      socketId: null,
      status: 'offline',
      enrolledAt: Date.now(),
      lastSeen: Date.now(),
      mode: 'review',
    };
    this.devices.set(deviceId, record);
    if (!this.userDevices.has(userId)) {
      this.userDevices.set(userId, new Set());
    }
    this.userDevices.get(userId).add(deviceId);
    return record;
  }

  bindSocket(deviceId, socketId) {
    const record = this.devices.get(deviceId);
    if (!record) return null;
    record.socketId = socketId;
    record.status = 'online';
    record.lastSeen = Date.now();
    this.socketToDevice.set(socketId, deviceId);
    return record;
  }

  unbindSocket(socketId) {
    const deviceId = this.socketToDevice.get(socketId);
    if (!deviceId) return null;
    const record = this.devices.get(deviceId);
    if (record) {
      record.socketId = null;
      record.status = 'offline';
      record.lastSeen = Date.now();
    }
    this.socketToDevice.delete(socketId);
    return record;
  }

  verifyOwnership(userId, deviceId) {
    const record = this.devices.get(deviceId);
    return record && record.userId === userId;
  }

  getDevicesByUser(userId) {
    const deviceIds = this.userDevices.get(userId);
    if (!deviceIds) return [];
    return Array.from(deviceIds)
      .map(id => this.devices.get(id))
      .filter(Boolean)
      .map(r => ({
        deviceId: r.deviceId,
        name: r.name,
        os: r.os,
        hostname: r.hostname,
        status: r.status,
        lastSeen: r.lastSeen,
        mode: r.mode,
      }));
  }

  getDeviceBySocket(socketId) {
    const deviceId = this.socketToDevice.get(socketId);
    return deviceId ? this.devices.get(deviceId) : null;
  }

  getDeviceById(deviceId) {
    return this.devices.get(deviceId) || null;
  }

  setDeviceMode(deviceId, mode) {
    const record = this.devices.get(deviceId);
    if (record) {
      record.mode = mode;
      return true;
    }
    return false;
  }
}

const registry = new DeviceRegistry();
module.exports = registry;
