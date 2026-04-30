const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./config');
const { expressAuth, socketAuth } = require('./auth/middleware');
const { signAccessToken, signRefreshToken, signEnrollmentToken, signDeviceToken, verifyToken } = require('./auth/jwt');
const store = require('./store/memory-store');
const registry = require('./devices/registry');
const setupDashboardHandler = require('./socket/dashboard-handler');
const setupDeviceHandler = require('./socket/device-handler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Auth REST API ---

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
  }
  try {
    const userId = await store.createUser(email, password);
    const accessToken = signAccessToken(userId);
    const refreshToken = signRefreshToken();
    store.saveRefreshToken(userId, refreshToken);
    res.json({ userId, accessToken, refreshToken });
  } catch (err) {
    if (err.message === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: 'EMAIL_EXISTS' });
    }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
  }
  const user = await store.authenticateUser(email, password);
  if (!user) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  const accessToken = signAccessToken(user.userId);
  const refreshToken = signRefreshToken();
  store.saveRefreshToken(user.userId, refreshToken);
  res.json({ userId: user.userId, accessToken, refreshToken });
});

app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'REFRESH_TOKEN_REQUIRED' });
  }
  const entry = store.findRefreshToken(refreshToken);
  if (!entry) {
    return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
  }
  const accessToken = signAccessToken(entry.userId);
  res.json({ accessToken });
});

app.post('/api/auth/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    store.deleteRefreshToken(refreshToken);
  }
  res.status(204).end();
});

// --- Device management (authenticated) ---

app.post('/api/devices/enroll-token', expressAuth, (req, res) => {
  const token = signEnrollmentToken(req.user.userId);
  res.json({ enrollmentToken: token });
});

app.get('/api/devices', expressAuth, (req, res) => {
  res.json(registry.getDevicesByUser(req.user.userId));
});

// --- Device enrollment ---

app.post('/api/devices/enroll', (req, res) => {
  const { enrollmentToken, name, os, hostname } = req.body;
  if (!enrollmentToken) {
    return res.status(400).json({ error: 'ENROLLMENT_TOKEN_REQUIRED' });
  }
  try {
    const payload = verifyToken(enrollmentToken);
    if (payload.purpose !== 'enrollment') {
      return res.status(400).json({ error: 'INVALID_ENROLLMENT_TOKEN' });
    }
    if (store.isEnrollmentUsed(payload.jti)) {
      return res.status(400).json({ error: 'ENROLLMENT_TOKEN_ALREADY_USED' });
    }
    if (store.isTokenRevoked(payload.jti)) {
      return res.status(400).json({ error: 'ENROLLMENT_TOKEN_REVOKED' });
    }
    store.markEnrollmentUsed(payload.jti);

    const record = registry.registerDevice(payload.userId, name, os, hostname);
    const deviceToken = signDeviceToken(payload.userId, record.deviceId);

    res.json({
      deviceId: record.deviceId,
      deviceToken,
      name: record.name,
    });
  } catch {
    res.status(400).json({ error: 'INVALID_ENROLLMENT_TOKEN' });
  }
});

// --- Socket.IO ---

io.use(socketAuth);
io.on('connection', (socket) => {
  if (socket.data.type === 'dashboard') {
    setupDashboardHandler(io, socket);
  }
});

io.of('/device').use(socketAuth);
io.of('/device').on('connection', (socket) => {
  if (socket.data.type === 'device') {
    setupDeviceHandler(io, socket);
  }
});

// --- Start ---

server.listen(config.port, config.host, () => {
  console.log(`Hermes Remote Control Server running on http://${config.host}:${config.port}`);
  console.log(`JWT secret: ${config.jwtSecret.slice(0, 8)}...`);
});
