// Bridge <-> Unreal Remote Control WebSocket client.
//
// Protocol reference (UE 5.x): https://docs.unrealengine.com/5.0/en-US/remote-control-api-reference-for-unreal-engine/
//
// We use the WebSocket route to:
//   - Subscribe to a preset (`preset.register`) so UE pushes change events.
//   - Send `http.request` envelopes for property reads/writes & function calls.
//
// All inbound `PresetFieldsChanged` messages are emitted as `'fieldChanged'`
// events with shape `{ propertyLabel, value }`. The bridge fans those out to
// connected browsers.

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export class UeClient extends EventEmitter {
  constructor({ host, port, presetName, httpPort }) {
    super();
    this.host = host;
    this.httpPort = httpPort;
    this.url = `ws://${host}:${port}`;
    this.presetName = presetName;
    this.ws = null;
    this.connected = false;
    this.reconnectMs = RECONNECT_MIN_MS;
    this.requestId = 1;
    /** Cache of latest known values, keyed by Property Label. */
    this.cache = new Map();
  }

  start() {
    this._connect();
  }

  _connect() {
    log(`connecting to ${this.url}`);
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
      this.reconnectMs = RECONNECT_MIN_MS;
      log('connected, registering preset', this.presetName);
      this._send({
        MessageName: 'preset.register',
        Parameters: { PresetName: this.presetName, IgnoreRemoteChanges: false },
      });
      this.emit('status', { connected: true });
    });

    ws.on('message', (raw) => this._onMessage(raw));

    ws.on('close', () => {
      if (this.connected) log('disconnected');
      this.connected = false;
      this.emit('status', { connected: false });
      this._scheduleReconnect();
    });

    ws.on('error', (err) => {
      // Surface but don't crash — close handler will reconnect.
      log('socket error:', err.message);
    });
  }

  _scheduleReconnect() {
    setTimeout(() => this._connect(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, RECONNECT_MAX_MS);
  }

  _send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    const type = msg.Type || msg.MessageName;

    // Preset change notifications. UE 5 typically uses `PresetFieldsChanged`
    // with `ChangedFields: [{ PropertyLabel, PropertyValue, ObjectPath }]`.
    if (type === 'PresetFieldsChanged' || msg.ChangedFields) {
      const fields = msg.ChangedFields || [];
      for (const f of fields) {
        const label = f.PropertyLabel || f.PropertyName;
        if (!label) continue;
        const value = f.PropertyValue ?? f.Value;
        this.cache.set(label, value);
        this.emit('fieldChanged', { propertyLabel: label, value });
      }
      return;
    }

    // Log http.response so we can see if function calls succeeded.
    if (type === 'http.response' || msg.ResponseCode !== undefined) {
      log('http.response', msg.ResponseCode, typeof msg.ResponseBody === 'string' ? msg.ResponseBody.slice(0,200) : JSON.stringify(msg.ResponseBody || '').slice(0,200));
      return;
    }

    // Some UE versions emit a flatter shape on the WS subscription channel.
    // We pass anything unknown through as a debug event so issues are easy
    // to diagnose without re-deploying.
    this.emit('debug', msg);
  }

  /** Set a property by Remote Control preset Property Label. */
  setProperty(propertyLabel, value) {
    const id = this.requestId++;
    this.cache.set(propertyLabel, value);
    return this._send({
      MessageName: 'http.request',
      Id: id,
      Parameters: {
        Url: `/remote/preset/${encodeURIComponent(this.presetName)}/property/${encodeURIComponent(propertyLabel)}`,
        Verb: 'PUT',
        Body: { PropertyValue: value, GenerateTransaction: true },
      },
    });
  }

  /** Call an exposed function by Remote Control preset Property Label. */
  async callFunction(propertyLabel, args = {}) {
    const url = `http://${this.host}:${this.httpPort}/remote/preset/${encodeURIComponent(this.presetName)}/function/${encodeURIComponent(propertyLabel)}`;
    log('callFunction', propertyLabel, JSON.stringify(args));
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Parameters: args, GenerateTransaction: true }),
      });
      const text = await res.text();
      log('callFunction response', res.status, text.slice(0, 200));
      return res.ok;
    } catch (err) {
      log('callFunction error', err.message);
      return false;
    }
  }

  /** Snapshot of last-known values, suitable for hydrating new clients. */
  snapshot() {
    return Object.fromEntries(this.cache);
  }
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[ue]', ...args);
}
