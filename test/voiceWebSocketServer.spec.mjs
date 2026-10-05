import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  VoiceWebSocketServerError,
  createVoiceWebSocketServer,
} from "../server/src/voice/voiceWebSocketServer.js";

const STREAM_PATH = "/api/twilio/voice/stream";
const NONCE = "n".repeat(48);
const REQUEST_PATH = `${STREAM_PATH}/${NONCE}`;

class FakeHttpServer extends EventEmitter {}

class FakeRawSocket {
  constructor() {
    this.destroyed = false;
    this.writes = [];
  }

  write(value) {
    this.writes.push(String(value));
  }

  destroy() {
    this.destroyed = true;
  }
}

class FakeWebSocket extends EventEmitter {
  constructor() {
    super();
    this.closes = [];
    this.terminated = false;
  }

  close(code, reason) {
    this.closes.push({ code, reason });
  }

  terminate() {
    this.terminated = true;
  }
}

class FakeWebSocketServer extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.handleUpgradeCalls = [];
    this.closeCalls = 0;
    this.socket = new FakeWebSocket();
    FakeWebSocketServer.instances.push(this);
  }

  handleUpgrade(request, socket, head, callback) {
    this.handleUpgradeCalls.push({ request, socket, head });
    callback(this.socket);
  }

  close(callback) {
    this.closeCalls += 1;
    callback?.();
  }
}

function request(url = REQUEST_PATH, signature = "signed-by-twilio") {
  return {
    url,
    headers: { "x-twilio-signature": signature },
  };
}

function code(expected) {
  return (error) => error instanceof VoiceWebSocketServerError && error.code === expected;
}

test("constructs a no-server ws boundary and leaves unrelated upgrades untouched", async () => {
  FakeWebSocketServer.instances.length = 0;
  const httpServer = new FakeHttpServer();
  const authorizations = [];
  const starts = [];
  const controller = createVoiceWebSocketServer({
    httpServer,
    WebSocketServer: FakeWebSocketServer,
    coordinator: {
      async authorizeUpgrade(value) {
        authorizations.push(value);
        return { context: "authorized" };
      },
      async startAuthorizedSession(value) {
        starts.push(value);
        return { status: "started", controller: { close: async () => {} } };
      },
    },
  });
  const webSocketServer = FakeWebSocketServer.instances[0];
  assert.deepEqual(webSocketServer.options, {
    noServer: true,
    maxPayload: 32 * 1024,
    perMessageDeflate: false,
  });

  const unrelated = new FakeRawSocket();
  httpServer.emit("upgrade", request("/another/websocket"), unrelated, Buffer.alloc(0));
  await controller.whenIdle();
  assert.equal(unrelated.destroyed, false);
  assert.deepEqual(unrelated.writes, []);
  assert.equal(authorizations.length, 0);
  assert.equal(webSocketServer.handleUpgradeCalls.length, 0);

  const rawSocket = new FakeRawSocket();
  const incoming = request();
  const head = Buffer.from("head");
  httpServer.emit("upgrade", incoming, rawSocket, head);
  await controller.whenIdle();

  assert.deepEqual(authorizations, [
    { signature: "signed-by-twilio", requestPath: REQUEST_PATH },
  ]);
  assert.equal(webSocketServer.handleUpgradeCalls.length, 1);
  assert.equal(webSocketServer.handleUpgradeCalls[0].request, incoming);
  assert.equal(webSocketServer.handleUpgradeCalls[0].socket, rawSocket);
  assert.equal(webSocketServer.handleUpgradeCalls[0].head, head);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].authorization.context, "authorized");
  assert.equal(starts[0].socket, webSocketServer.socket);
  assert.equal(starts[0].request, incoming);
  assert.equal(controller.activeSessionCount, 1);
  await controller.close();
});

test("rejects bad route shapes and query-token attempts before authorization", async () => {
  const httpServer = new FakeHttpServer();
  let authorizationCalls = 0;
  const boundary = createVoiceWebSocketServer({
    httpServer,
    WebSocketServer: FakeWebSocketServer,
    coordinator: {
      async authorizeUpgrade() {
        authorizationCalls += 1;
        return {};
      },
      async startAuthorizedSession() {
        throw new Error("must not start");
      },
    },
  });

  const cases = [
    STREAM_PATH,
    `${STREAM_PATH}/short`,
    `${REQUEST_PATH}/extra`,
    `${REQUEST_PATH}?token=DO_NOT_LEAK_THIS`,
    `${REQUEST_PATH}#DO_NOT_LEAK_THIS`,
  ];
  for (const url of cases) {
    const socket = new FakeRawSocket();
    httpServer.emit("upgrade", request(url), socket, Buffer.alloc(0));
    assert.equal(socket.destroyed, true);
    assert.match(socket.writes.join(""), /^HTTP\/1\.1 403 Forbidden/);
    assert.equal(socket.writes.join("").includes("DO_NOT_LEAK_THIS"), false);
  }
  await boundary.whenIdle();
  assert.equal(authorizationCalls, 0);
  await boundary.close();
});

test("authorization failures return only a generic HTTP rejection", async () => {
  const httpServer = new FakeHttpServer();
  const reports = [];
  const secret = "super-secret-auth-token";
  let upgradeCalls = 0;
  const instance = new FakeWebSocketServer({ unsafe: "ignored-by-injection" });
  instance.handleUpgrade = () => {
    upgradeCalls += 1;
  };
  const boundary = createVoiceWebSocketServer({
    httpServer,
    webSocketServer: instance,
    onError: (value) => reports.push(value),
    coordinator: {
      async authorizeUpgrade() {
        throw new Error(secret);
      },
      async startAuthorizedSession() {
        throw new Error("must not start");
      },
    },
  });
  const socket = new FakeRawSocket();
  httpServer.emit("upgrade", request(REQUEST_PATH, secret), socket, Buffer.alloc(0));
  await boundary.whenIdle();

  assert.equal(socket.destroyed, true);
  assert.equal(
    socket.writes.join(""),
    "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
  );
  assert.equal(upgradeCalls, 0);
  assert.deepEqual(reports, ["VOICE_WEBSOCKET_AUTHORIZATION_FAILED"]);
  assert.equal(JSON.stringify({ writes: socket.writes, reports }).includes(secret), false);

  instance.emit("error", new Error(secret));
  assert.deepEqual(reports, [
    "VOICE_WEBSOCKET_AUTHORIZATION_FAILED",
    "VOICE_WEBSOCKET_SERVER_ERROR",
  ]);
  assert.equal(JSON.stringify(reports).includes(secret), false);
  await boundary.close();
});

test("claims a raw upgrade once and starts one session even if callbacks race", async () => {
  const httpServer = new FakeHttpServer();
  const ws = new FakeWebSocket();
  let resolveAuthorization;
  const authorizationGate = new Promise((resolve) => {
    resolveAuthorization = resolve;
  });
  let authorizationCalls = 0;
  let startCalls = 0;
  const instance = new FakeWebSocketServer({});
  instance.handleUpgrade = (_request, _socket, _head, callback) => {
    callback(ws);
    callback(ws);
    callback(new FakeWebSocket());
  };
  const boundary = createVoiceWebSocketServer({
    httpServer,
    webSocketServer: instance,
    coordinator: {
      async authorizeUpgrade() {
        authorizationCalls += 1;
        return authorizationGate;
      },
      async startAuthorizedSession() {
        startCalls += 1;
        return { controller: { close: async () => {} } };
      },
    },
  });
  const rawSocket = new FakeRawSocket();
  const incoming = request();
  httpServer.emit("upgrade", incoming, rawSocket, Buffer.alloc(0));
  httpServer.emit("upgrade", incoming, rawSocket, Buffer.alloc(0));
  assert.equal(authorizationCalls, 1);
  resolveAuthorization({ grant: true });
  await boundary.whenIdle();

  assert.equal(authorizationCalls, 1);
  assert.equal(startCalls, 1);
  assert.equal(ws.closes.length, 0);
  await boundary.close();
});

test("shutdown detaches upgrades and closes active sessions exactly once", async () => {
  const httpServer = new FakeHttpServer();
  const ws = new FakeWebSocket();
  let controllerCloseCalls = 0;
  const instance = new FakeWebSocketServer({});
  instance.socket = ws;
  const boundary = createVoiceWebSocketServer({
    httpServer,
    webSocketServer: instance,
    coordinator: {
      async authorizeUpgrade() {
        return { grant: true };
      },
      async startAuthorizedSession() {
        return {
          controller: {
            close: async () => {
              controllerCloseCalls += 1;
            },
          },
        };
      },
    },
  });
  httpServer.emit("upgrade", request(), new FakeRawSocket(), Buffer.alloc(0));
  await boundary.whenIdle();
  assert.equal(boundary.activeSessionCount, 1);
  assert.equal(httpServer.listenerCount("upgrade"), 1);

  const firstClose = boundary.close();
  const secondClose = boundary.close();
  assert.equal(firstClose, secondClose);
  await firstClose;

  assert.equal(boundary.closed, true);
  assert.equal(boundary.activeSessionCount, 0);
  assert.equal(httpServer.listenerCount("upgrade"), 0);
  assert.equal(controllerCloseCalls, 1);
  assert.deepEqual(ws.closes, [{ code: 1012, reason: "Service restarting" }]);
  assert.equal(instance.closeCalls, 1);

  const afterClose = new FakeRawSocket();
  httpServer.emit("upgrade", request(), afterClose, Buffer.alloc(0));
  assert.equal(afterClose.destroyed, false);
});

test("session-start failures close the WebSocket without leaking handler errors", async () => {
  const httpServer = new FakeHttpServer();
  const ws = new FakeWebSocket();
  const secret = "customer-private-data";
  const reports = [];
  const instance = new FakeWebSocketServer({});
  instance.socket = ws;
  const boundary = createVoiceWebSocketServer({
    httpServer,
    webSocketServer: instance,
    onError: (value) => reports.push(value),
    coordinator: {
      async authorizeUpgrade() {
        return { grant: true };
      },
      async startAuthorizedSession() {
        throw new Error(secret);
      },
    },
  });
  httpServer.emit("upgrade", request(), new FakeRawSocket(), Buffer.alloc(0));
  await boundary.whenIdle();

  assert.deepEqual(ws.closes, [{ code: 1011, reason: "Session unavailable" }]);
  assert.deepEqual(reports, ["VOICE_SESSION_START_FAILED"]);
  assert.equal(JSON.stringify({ closes: ws.closes, reports }).includes(secret), false);
  assert.equal(boundary.activeSessionCount, 0);
  await boundary.close();
});

test("configuration enforces bounded payloads and unambiguous ws injection", () => {
  const httpServer = new FakeHttpServer();
  const coordinator = {
    authorizeUpgrade: async () => ({}),
    startAuthorizedSession: async () => ({}),
  };

  assert.throws(
    () => createVoiceWebSocketServer({
      httpServer,
      coordinator,
      WebSocketServer: FakeWebSocketServer,
      maxPayload: 0,
    }),
    code("INVALID_VOICE_MAX_PAYLOAD"),
  );
  assert.throws(
    () => createVoiceWebSocketServer({
      httpServer,
      coordinator,
      WebSocketServer: FakeWebSocketServer,
      maxPayload: 1024 * 1024 + 1,
    }),
    code("INVALID_VOICE_MAX_PAYLOAD"),
  );
  assert.throws(
    () => createVoiceWebSocketServer({
      httpServer,
      coordinator,
      WebSocketServer: FakeWebSocketServer,
      webSocketServer: new FakeWebSocketServer({}),
    }),
    code("VOICE_WEBSOCKET_SERVER_AMBIGUOUS"),
  );

  const custom = createVoiceWebSocketServer({
    httpServer,
    coordinator,
    WebSocketServer: FakeWebSocketServer,
    maxPayload: 4096,
  });
  assert.equal(FakeWebSocketServer.instances.at(-1).options.maxPayload, 4096);
  return custom.close();
});
