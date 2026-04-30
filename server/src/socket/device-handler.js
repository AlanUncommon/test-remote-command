const registry = require('../devices/registry');

module.exports = function setupDeviceHandler(io, socket) {
  const { userId, deviceId } = socket.data;
  let boundDeviceId = deviceId;

  socket.on('device:register', ({ name, os, hostname }) => {
    if (boundDeviceId) {
      registry.bindSocket(boundDeviceId, socket.id);
    }
    const device = registry.getDeviceById(boundDeviceId);
    if (device) {
      console.log(`[device:online] "${device.name}" (${boundDeviceId}) user:${userId}`);
      io.to(`user:${userId}`).emit('devices:update', registry.getDevicesByUser(userId));
    }
  });

  socket.on('device:response', ({ commandId, text, status }) => {
    const device = registry.getDeviceBySocket(socket.id);
    if (!device) return;

    const payload = {
      deviceId: device.deviceId,
      deviceName: device.name,
      commandId,
      text,
      status: status || 'completed',
      timestamp: Date.now(),
    };

    io.to(`user:${device.userId}`).emit('device:response', payload);
    console.log(`[device:response] ${device.name}: "${String(text).slice(0, 80)}"`);
  });

  socket.on('device:mode', ({ mode }) => {
    if (mode !== 'review' && mode !== 'auto') return;
    const device = registry.getDeviceBySocket(socket.id);
    if (!device) return;
    registry.setDeviceMode(device.deviceId, mode);
    io.to(`user:${device.userId}`).emit('devices:update', registry.getDevicesByUser(device.userId));
    console.log(`[device:mode] ${device.name} -> ${mode}`);
  });

  socket.on('disconnect', () => {
    const record = registry.unbindSocket(socket.id);
    if (record) {
      console.log(`[device:offline] "${record.name}" (${record.deviceId})`);
      io.to(`user:${record.userId}`).emit('devices:update', registry.getDevicesByUser(record.userId));
    }
  });
};
