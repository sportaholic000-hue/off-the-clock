// Twilio Media Streams WebSocket boundary. Owns the HTTP upgrade for
// /api/twilio/voice/stream/<nonce> only, authorizes each upgrade exactly once through the
// coordinator, and never echoes request or error details back to the network.
import { WebSocketServer as DefaultWebSocketServer } from 'ws';

export class VoiceWebSocketServerError extends Error {
  constructor(code) { super('The voice stream boundary is misconfigured.'); this.name = 'VoiceWebSocketServerError'; this.code = code; }
}

const FORBIDDEN = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const NONCE = /^[A-Za-z0-9_-]{32,128}$/;

export function createVoiceWebSocketServer({
  httpServer, coordinator, WebSocketServer, webSocketServer, maxPayload = 32 * 1024,
  onError = () => {}, streamPath = '/api/twilio/voice/stream',
} = {}) {
  if (!httpServer || typeof httpServer.on !== 'function') throw new VoiceWebSocketServerError('VOICE_HTTP_SERVER_REQUIRED');
  if (!coordinator || typeof coordinator.authorizeUpgrade !== 'function' || typeof coordinator.startAuthorizedSession !== 'function') {
    throw new VoiceWebSocketServerError('VOICE_COORDINATOR_REQUIRED');
  }
  if (WebSocketServer && webSocketServer) throw new VoiceWebSocketServerError('VOICE_WEBSOCKET_SERVER_AMBIGUOUS');
  if (!Number.isInteger(maxPayload) || maxPayload < 1 || maxPayload > 1024 * 1024) throw new VoiceWebSocketServerError('INVALID_VOICE_MAX_PAYLOAD');

  const report = code => { try { onError(code); } catch {} };
  const wss = webSocketServer || new (WebSocketServer || DefaultWebSocketServer)({ noServer: true, maxPayload, perMessageDeflate: false });
  wss.on?.('error', () => report('VOICE_WEBSOCKET_SERVER_ERROR'));

  const claimed = new WeakSet();
  const pending = new Set();
  const sessions = new Map(); // ws -> controller
  let closed = false, closing = null;

  const reject = socket => { try { socket.write(FORBIDDEN); } catch {} try { socket.destroy(); } catch {} };

  async function handleUpgrade(request, socket, head) {
    let authorization;
    try {
      authorization = await coordinator.authorizeUpgrade({ signature: request.headers?.['x-twilio-signature'], requestPath: request.url });
    } catch {
      report('VOICE_WEBSOCKET_AUTHORIZATION_FAILED');
      return reject(socket);
    }
    if (closed) return reject(socket);
    const ws = await new Promise(resolve => {
      let done = false;
      wss.handleUpgrade(request, socket, head, value => { if (!done) { done = true; resolve(value); } });
    });
    if (closed) { try { ws.close(1012, 'Service restarting'); } catch {} return; }
    try {
      const started = await coordinator.startAuthorizedSession({ authorization, socket: ws, request });
      const controller = started?.controller || { close: async () => {} };
      sessions.set(ws, controller);
      ws.on?.('close', () => sessions.delete(ws));
    } catch {
      report('VOICE_SESSION_START_FAILED');
      try { ws.close(1011, 'Session unavailable'); } catch {}
    }
  }

  function onUpgrade(request, socket, head) {
    const url = typeof request?.url === 'string' ? request.url : '';
    if (url !== streamPath && !url.startsWith(streamPath + '/') && !url.startsWith(streamPath + '?') && !url.startsWith(streamPath + '#')) return;
    if (claimed.has(socket)) return;
    claimed.add(socket);
    const rest = url.slice(streamPath.length);
    if (closed || url.includes('?') || url.includes('#') || !rest.startsWith('/') || !NONCE.test(rest.slice(1))) return reject(socket);
    const job = handleUpgrade(request, socket, head).finally(() => pending.delete(job));
    pending.add(job);
  }
  httpServer.on('upgrade', onUpgrade);

  return {
    get activeSessionCount() { return sessions.size; },
    get closed() { return closed; },
    async whenIdle() { while (pending.size) await Promise.allSettled([...pending]); },
    close() {
      if (closing) return closing;
      closed = true;
      httpServer.off?.('upgrade', onUpgrade) ?? httpServer.removeListener?.('upgrade', onUpgrade);
      closing = (async () => {
        await Promise.allSettled([...pending]);
        const active = [...sessions.entries()]; sessions.clear();
        await Promise.allSettled(active.map(async ([ws, controller]) => {
          try { await controller.close(); } catch {}
          try { ws.close(1012, 'Service restarting'); } catch {}
        }));
        await new Promise(resolve => { try { wss.close(() => resolve()); } catch { resolve(); } });
      })();
      return closing;
    },
  };
}
