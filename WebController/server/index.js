// Bridge HTTP + WebSocket server.
//
//  Browser  <-- ws://<host>:8080 --> [this] <-- ws://127.0.0.1:30020 --> Unreal
//
// Browser -> bridge messages:
//   { type: 'set',  id: <propertyLabel>, value: <any> }
//   { type: 'call', id: <propertyLabel>, args?: <object> }
//
// Bridge -> browser messages:
//   { type: 'hello',   controls: [...], snapshot: {label: value}, ueConnected: bool, suppressMs: number }
//   { type: 'ueStatus', connected: bool }
//   { type: 'update',   id: <propertyLabel>, value: <any> }

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { config } from './config.js';
import { UeClient } from './ueClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const app = express();
app.use(express.json());

app.get('/api/controls', (_req, res) => {
  res.json({
    controls: config.controls,
    suppressMs: config.localEditSuppressMs,
    presetName: config.presetName,
  });
});

app.use(express.static(publicDir));

const server = createServer(app);
const wss = new WebSocketServer({ server });

const ue = new UeClient({
  host: config.ueHost,
  port: config.ueWsPort,
  httpPort: config.ueHttpPort,
  presetName: config.presetName,
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) client.send(data);
  }
}

ue.on('status', ({ connected }) => {
  broadcast({ type: 'ueStatus', connected });
});

ue.on('fieldChanged', ({ propertyLabel, value }) => {
  // UE addresses entries by their auto-generated DisplayName (e.g.
  // "Vector Parameters (1)"), which collides across MPC array entries.
  // Map back to a stable web-side `id` if we can; otherwise drop the event
  // (the originating browser already updated optimistically, and the bridge
  // echoes to other clients on the way in).
  const ctrl = config.controls.find(
    (c) => c.ueId === propertyLabel || c.id === propertyLabel,
  );
  if (!ctrl) return;
  broadcast({ type: 'update', id: ctrl.id, value });
});

ue.on('debug', (msg) => {
  // Helpful while wiring up new control types.
  if (process.env.DEBUG_UE) console.log('[ue:debug]', JSON.stringify(msg));
});

wss.on('connection', (socket, req) => {
  const remote = req.socket.remoteAddress;
  console.log('[bridge] client connected from', remote);

  // Hydrate the new client.
  socket.send(JSON.stringify({
    type: 'hello',
    controls: config.controls,
    snapshot: ue.snapshot(),
    ueConnected: ue.connected,
    suppressMs: config.localEditSuppressMs,
  }));

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); }
    catch { return; }

    if (!msg || typeof msg.id !== 'string') return;
    const ctrl = config.controls.find((c) => c.id === msg.id);
    if (!ctrl) {
      console.warn('[bridge] unknown control id:', msg.id);
      return;
    }
    console.log('[bridge] in:', msg.type, msg.id, '=>', JSON.stringify(msg.value ?? msg.args));

    if (msg.type === 'set' && ctrl.kind !== 'function') {
      if (ctrl.ueFunction) {
        // Property-style UI (slider, color picker) but routed through an
        // exposed Blueprint function. The function's input pin name is
        // `ctrl.ueArg` (default 'Value').
        const argName = ctrl.ueArg || 'Value';
        ue.callFunction(ctrl.ueFunction, { [argName]: msg.value });
      } else {
        ue.setProperty(ctrl.ueId || ctrl.id, msg.value);
      }
      // Echo to *other* clients so multiple browsers stay in sync without
      // waiting for UE's PresetFieldsChanged round-trip.
      const data = JSON.stringify({ type: 'update', id: ctrl.id, value: msg.value });
      for (const c of wss.clients) {
        if (c !== socket && c.readyState === 1) c.send(data);
      }
    } else if (msg.type === 'call' && ctrl.kind === 'function') {
      ue.callFunction(ctrl.ueFunction || ctrl.ueId || ctrl.id, msg.args || ctrl.args || {});
    }
  });

  socket.on('close', () => console.log('[bridge] client disconnected', remote));
});

ue.start();

server.listen(config.bridgePort, config.bridgeHost, () => {
  const addr = `${config.bridgeHost}:${config.bridgePort}`;
  console.log(`[bridge] listening on http://${addr}`);
  console.log(`[bridge] proxying to UE at ws://${config.ueHost}:${config.ueWsPort} (preset: ${config.presetName})`);
});
