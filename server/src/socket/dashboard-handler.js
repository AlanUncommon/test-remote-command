const registry = require('../devices/registry');
const { validateCommand } = require('../commands/sanitizer');
const crypto = require('crypto');

module.exports = function setupDashboardHandler(io, socket) {
  const userId = socket.data.userId;

  socket.join(`user:${userId}`);
  socket.emit('devices:update', registry.getDevicesByUser(userId));

  socket.on('command:send', ({ deviceId, text }) => {
    if (!registry.verifyOwnership(userId, deviceId)) {
      socket.emit('error', { message: 'NOT_AUTHORIZED', deviceId });
      return;
    }

    const validation = validateCommand(text);
    if (!validation.valid) {
      socket.emit('error', { message: validation.reason, deviceId });
      return;
    }

    const device = registry.getDeviceById(deviceId);
    if (!device || device.status !== 'online' || !device.socketId) {
      socket.emit('error', { message: 'DEVICE_OFFLINE', deviceId });
      return;
    }

    const commandId = crypto.randomBytes(4).toString('hex');
    const timestamp = Date.now();

    io.of('/device').to(device.socketId).emit('command:receive', {
      commandId,
      text,
      timestamp,
      mode: device.mode,
    });

    socket.emit('command:sent', { commandId, deviceId, text, timestamp });
  });
};
