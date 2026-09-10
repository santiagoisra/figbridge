// bridge.mjs — the daemon.
// Speaks the WebSocket protocol of the "Figma Desktop Bridge" plugin (WS 9223-9232),
// and exposes a tiny HTTP API on 127.0.0.1:8787 so anything can drive Figma.
// Zero dependencies on purpose: node bridge.mjs and it runs.
import http from 'node:http';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const HTTP_PORT = Number(process.env.FIGBRIDGE_PORT || 8787);
const WS_PORTS = [9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 9231, 9232];
const EXEC_TIMEOUT = Number(process.env.FIGBRIDGE_EXEC_TIMEOUT || 280000);

let sock = null;
let wsPort = null;
let nextId = 1;
let lastConnect = null;
const pending = new Map();

function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

function sendFrame(s, str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
  head[0] = 0x81;
  s.write(Buffer.concat([head, payload]));
}

function sendPong(s, payload) {
  const head = Buffer.alloc(2);
  head[0] = 0x8a;
  head[1] = payload.length;
  s.write(Buffer.concat([head, payload]));
}

function attach(s) {
  let buf = Buffer.alloc(0);
  let fragOp = 0;
  let frags = [];
  s.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (buf.length < off + 4) return; mask = buf.subarray(off, off + 4); off += 4; }
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (mask) {
        const c = Buffer.from(payload);
        for (let i = 0; i < c.length; i++) c[i] ^= mask[i % 4];
        payload = c;
      }
      buf = buf.subarray(off + len);

      if (op === 0x8) { try { s.end(); } catch { /* ignore */ } sock = null; log('plugin disconnected'); return; }
      if (op === 0x9) { sendPong(s, payload); continue; }
      if (op === 0xa) continue;
      if (op === 0x0) frags.push(payload);
      else { fragOp = op; frags = [payload]; }
      if (!fin) continue;
      const full = Buffer.concat(frags).toString('utf8');
      frags = [];
      if (fragOp !== 0x1) continue;
      let m;
      try { m = JSON.parse(full); } catch { continue; }
      if (m && m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        clearTimeout(p.t);
        p.res(m);
      }
    }
  });
  s.on('error', () => { sock = null; });
  s.on('close', () => { sock = null; log('socket closed'); });
}

const wsServer = http
  .createServer((req, res) => { res.writeHead(426); res.end('ws only'); })
  .on('upgrade', (req, s) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    s.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept + '\r\n\r\n'
    );
    sock = s;
    lastConnect = new Date().toISOString();
    log('plugin connected');
    attach(s);
    sendFrame(s, JSON.stringify({
      type: 'SERVER_HELLO',
      data: { port: wsPort, pid: process.pid, serverVersion: 'figbridge-1.0' }
    }));
  });

function bindFirstFree(server, list, i = 0) {
  if (i >= list.length) {
    log('no free port in ' + list[0] + '-' + list[list.length - 1]);
    process.exit(1);
  }
  server.once('error', () => bindFirstFree(server, list, i + 1));
  server.listen(list[i], '127.0.0.1', () => {
    wsPort = list[i];
    log('websocket ready on ' + wsPort);
  });
}
bindFirstFree(wsServer, WS_PORTS);

function exec(code, timeoutMs) {
  return new Promise((resolve) => {
    if (!sock) return resolve({ error: 'plugin not connected' });
    const id = 'fb-' + nextId++;
    const t = setTimeout(() => { pending.delete(id); resolve({ error: 'timeout' }); }, timeoutMs + 5000);
    pending.set(id, { res: resolve, t });
    sendFrame(sock, JSON.stringify({ id, method: 'EXECUTE_CODE', params: { code, timeout: timeoutMs } }));
  });
}

const api = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      connected: !!sock,
      wsPort,
      httpPort: HTTP_PORT,
      pid: process.pid,
      lastConnect,
      version: 'figbridge-1.0'
    }));
  }
  if (url === '/exec' && req.method === 'POST') {
    let b = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { b += c; });
    req.on('end', async () => {
      const out = await exec(b, EXEC_TIMEOUT);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(404);
  res.end('{}');
});

api.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log('port ' + HTTP_PORT + ' is taken — another figbridge is probably already running');
    process.exit(1);
  }
  log('http error: ' + e.message);
  process.exit(1);
});

api.listen(HTTP_PORT, '127.0.0.1', () => log('http api ready on ' + HTTP_PORT));
