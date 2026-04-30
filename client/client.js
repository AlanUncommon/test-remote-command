const { io } = require('socket.io-client');
const { execFile } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir, hostname, type } = require('os');
const http = require('http');
const readline = require('readline');

// --- Parse args ---
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
    else if (args[i] === '--url' && args[i + 1]) opts.url = args[++i];
    else if (args[i] === '--enroll' && args[i + 1]) opts.enrollToken = args[++i];
    else if (args[i] === '--mode' && args[i + 1]) opts.mode = args[++i];
  }
  return opts;
}

// --- Config management ---
const CONFIG_DIR = join(homedir(), '.hermes-remote');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// --- Hermes execution ---
const HERMES_DIR = process.env.HERMES_DIR || join(homedir(), 'hermes-agent');
const HERMES_PYTHON = join(HERMES_DIR, '.venv', 'bin', 'python');
const HERMES_CLI = join(HERMES_DIR, 'cli.py');
const HERMES_TIMEOUT = parseInt(process.env.HERMES_TIMEOUT_MS || '300000', 10);

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function extractReply(raw) {
  const clean = stripAnsi(raw);
  const lines = clean.split('\n');
  let sepCount = 0;
  let replyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^─{10,}/.test(lines[i])) {
      sepCount++;
      if (sepCount === 2) { replyStart = i + 1; break; }
    }
  }
  if (replyStart === -1) return clean.trim();
  const replyLines = [];
  for (let i = replyStart; i < lines.length; i++) {
    if (/^─{10,}/.test(lines[i]) || lines[i].startsWith('Resume this session')) break;
    replyLines.push(lines[i].replace(/^[│╭╰]\s?/, '').replace(/\s?[│╭╰]\s*$/, ''));
  }
  return replyLines.join('\n').trim() || clean.trim();
}

function runHermes(query) {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      HERMES_PYTHON,
      [HERMES_CLI, '-q', query, '--compact'],
      { cwd: HERMES_DIR, timeout: HERMES_TIMEOUT, maxBuffer: 10 * 1024 * 1024, env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error) {
          const partial = (stdout || '').trim();
          if (partial) { resolve(extractReply(partial)); return; }
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve(extractReply(stdout || ''));
      }
    );
    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => {
        const lines = chunk.toString().trim();
        if (lines) console.error(`[hermes:stderr] ${lines}`);
      });
    }
  });
}

// --- Enrollment ---
async function doEnroll(url, enrollToken, name) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      enrollmentToken: enrollToken,
      name: name || hostname(),
      os: type(),
      hostname: hostname(),
    });
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: '/api/devices/enroll',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200) resolve(result);
          else reject(new Error(result.error || 'Enrollment failed'));
        } catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Main ---
async function main() {
  const args = parseArgs();
  let config = loadConfig();

  // Enrollment mode
  if (args.enrollToken) {
    const url = args.url || config.serverUrl || 'http://localhost:8768';
    const name = args.name || hostname();
    console.log(`Enrolling device "${name}" at ${url}...`);
    try {
      const result = await doEnroll(url, args.enrollToken, name);
      config = {
        serverUrl: url,
        deviceId: result.deviceId,
        deviceToken: result.deviceToken,
        name: result.name,
        mode: args.mode || 'review',
      };
      saveConfig(config);
      console.log(`Enrolled successfully!`);
      console.log(`  Device ID: ${result.deviceId}`);
      console.log(`  Name: ${result.name}`);
      console.log(`  Config saved to ${CONFIG_PATH}`);
    } catch (err) {
      console.error(`Enrollment failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Normal start
  if (!config.deviceToken) {
    console.error('Not enrolled. Run with --enroll <token> first.');
    process.exit(1);
  }

  const url = args.url || config.serverUrl;
  const name = config.name || hostname();
  const mode = args.mode || config.mode || 'review';

  console.log(`Connecting to ${url} as "${name}" (${mode} mode)...`);

  const socket = io(`${url}/device`, {
    auth: { token: config.deviceToken },
  });

  socket.on('connect', () => {
    socket.emit('device:register', { name, os: type(), hostname: hostname() });
    console.log(`[connected] Registered as "${name}" (${mode} mode)`);
  });

  socket.on('disconnect', () => console.log('\n[disconnected] Will auto-reconnect...'));
  socket.on('connect_error', (err) => console.error(`[error] ${err.message}`));

  socket.on('command:receive', async ({ commandId, text, timestamp, mode: cmdMode }) => {
    const time = new Date(timestamp).toLocaleTimeString();
    const effectiveMode = cmdMode || mode;
    console.log(`\n+=========================================+`);
    console.log(`|  [${time}] New Command`);
    console.log(`|  Mode: ${effectiveMode}`);
    console.log(`|  ---------------------------------------`);
    console.log(`|  ${text.slice(0, 39)}`);
    console.log(`+=========================================+`);

    if (effectiveMode === 'auto') {
      await executeAndRespond(commandId, text);
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('  [A]pprove / [R]eject > ', async (input) => {
        rl.close();
        const choice = input.trim().toLowerCase();
        if (choice === 'a' || choice === 'y') {
          await executeAndRespond(commandId, text);
        } else {
          socket.emit('device:response', { commandId, text: '[rejected by user]', status: 'rejected' });
          console.log('[rejected] Command not executed.');
        }
      });
    }
  });

  async function executeAndRespond(commandId, text) {
    console.log('[hermes] Executing...');
    try {
      const result = await runHermes(text);
      const response = result.trim() || '(no output)';
      socket.emit('device:response', { commandId, text: response, status: 'completed' });
      console.log(`[hermes] Done (${response.length} chars)`);
    } catch (err) {
      socket.emit('device:response', { commandId, text: `[error] ${err.message}`, status: 'error' });
      console.error(`[hermes error] ${err.message}`);
    }
  }

  // Interactive prompt
  const mainRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  function promptLoop() {
    mainRl.question('> ', (input) => {
      const text = input.trim();
      if (!text) { promptLoop(); return; }
      if (text === 'exit') {
        console.log('[exit] Disconnecting...');
        socket.disconnect();
        process.exit(0);
      }
      if (text === 'mode auto') {
        config.mode = 'auto';
        saveConfig(config);
        socket.emit('device:mode', { mode: 'auto' });
        console.log('[mode] Switched to auto');
      } else if (text === 'mode review') {
        config.mode = 'review';
        saveConfig(config);
        socket.emit('device:mode', { mode: 'review' });
        console.log('[mode] Switched to review');
      } else if (socket.connected) {
        socket.emit('device:response', { commandId: 'manual', text });
        console.log(`[sent] "${text}"`);
      }
      promptLoop();
    });
  }
  promptLoop();

  process.on('SIGINT', () => {
    console.log('\n[exit] Disconnecting...');
    socket.disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
