const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// In-memory device registry: socket.id -> { id, name, connectedAt }
const devices = new Map();

function broadcastDeviceList() {
  const list = Array.from(devices.values());
  io.emit('devices:update', list);
}

// --- Dashboard namespace (default /) ---
io.on('connection', (socket) => {
  // Send current device list on connect
  socket.emit('devices:update', Array.from(devices.values()));

  socket.on('command:send', ({ deviceId, text }) => {
    const device = devices.get(deviceId);
    if (!device) {
      socket.emit('error', { message: `Device ${deviceId} not found` });
      return;
    }

    const commandId = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now();

    // Relay command to the target device
    io.of('/device').to(deviceId).emit('command:receive', {
      commandId,
      text,
      timestamp,
    });
  });

  socket.on('disconnect', () => {
    // Dashboard disconnected, nothing to clean
  });
});

// --- Device namespace (/device) ---
io.of('/device').on('connection', (socket) => {
  let registered = false;

  socket.on('device:register', ({ name }) => {
    devices.set(socket.id, {
      id: socket.id,
      name: name || `device-${socket.id.slice(0, 6)}`,
      connectedAt: Date.now(),
    });
    registered = true;
    broadcastDeviceList();
    console.log(`[device:register] "${name}" connected (${socket.id})`);
  });

  socket.on('device:response', ({ commandId, text }) => {
    const device = devices.get(socket.id);
    if (!device) return;

    const payload = {
      deviceId: socket.id,
      deviceName: device.name,
      commandId,
      text,
      timestamp: Date.now(),
    };

    // Relay response to all dashboards
    io.emit('device:response', payload);
    console.log(`[device:response] ${device.name}: "${text.slice(0, 80)}"`);
  });

  socket.on('disconnect', () => {
    if (registered) {
      const device = devices.get(socket.id);
      devices.delete(socket.id);
      broadcastDeviceList();
      console.log(`[disconnect] "${device?.name}" disconnected (${socket.id})`);
    }
  });
});

const PORT = process.env.PORT || 8768;
server.listen(PORT, () => {
  console.log(`Device Control Server running on http://localhost:${PORT}`);
});
