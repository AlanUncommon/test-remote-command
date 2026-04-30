const { verifyToken } = require('./jwt');
const store = require('../store/memory-store');

function expressAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    if (store.isTokenRevoked(payload.jti)) {
      return res.status(401).json({ error: 'TOKEN_REVOKED' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

function socketAuth(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('AUTH_REQUIRED'));
  }
  try {
    const payload = verifyToken(token);
    if (store.isTokenRevoked(payload.jti)) {
      return next(new Error('TOKEN_REVOKED'));
    }
    socket.data = {
      userId: payload.userId,
      type: payload.type,
      deviceId: payload.deviceId || null,
      role: payload.role || 'user',
    };
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}

module.exports = { expressAuth, socketAuth };
