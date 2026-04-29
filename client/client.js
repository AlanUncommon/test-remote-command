const { io } = require('socket.io-client');
const readline = require('readline');

// --- Parse args ---
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
    else if (args[i] === '--url' && args[i + 1]) opts.url = args[++i];
  }
  return opts;
}

const { name = `device-${Math.random().toString(36).slice(2, 6)}`, url = 'http://localhost:8768' } = parseArgs();

console.log(`Connecting to ${url} as "${name}"...`);

const socket = io(`${url}/device`, { transports: ['websocket'] });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

socket.on('connect', () => {
  socket.emit('device:register', { name });
  console.log(`[connected] Registered as "${name}"`);
  promptLoop();
});

socket.on('disconnect', () => {
  console.log('\n[disconnected] Will auto-reconnect...');
});

socket.on('connect_error', (err) => {
  console.error(`[error] Connection failed: ${err.message}`);
});

socket.on('command:receive', ({ commandId, text, timestamp }) => {
  const time = new Date(timestamp).toLocaleTimeString();
  console.log(`\n[${time}] Command received: ${text}`);
  console.log('Type your response and press Enter:');
});

function promptLoop() {
  rl.question('', (input) => {
    const text = input.trim();
    if (text && socket.connected) {
      socket.emit('device:response', { commandId: 'manual', text });
      console.log(`[sent] "${text}"`);
    }
    promptLoop();
  });
}

process.on('SIGINT', () => {
  console.log('\n[exit] Disconnecting...');
  socket.disconnect();
  process.exit(0);
});
