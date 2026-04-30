const config = require('../config');

function validateCommand(text) {
  if (typeof text !== 'string') {
    return { valid: false, reason: 'Command must be a string' };
  }
  if (text.length === 0) {
    return { valid: false, reason: 'Command cannot be empty' };
  }
  if (text.length > config.maxCommandLength) {
    return { valid: false, reason: `Command exceeds max length (${config.maxCommandLength})` };
  }
  if (text.includes('\0')) {
    return { valid: false, reason: 'Null bytes not allowed' };
  }
  for (const pattern of config.commandBlacklist) {
    if (pattern.test(text)) {
      return { valid: false, reason: 'Command matches blocked pattern' };
    }
  }
  return { valid: true };
}

module.exports = { validateCommand };
