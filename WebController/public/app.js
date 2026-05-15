// Web app: renders controls fetched from /api/controls and stays in two-way
// sync with Unreal via the bridge WebSocket.

const $controls = document.getElementById('controls');
const $statusBridge = document.getElementById('status-bridge');
const $statusUe = document.getElementById('status-ue');
const tplSection = document.getElementById('tpl-section');

/** id -> { ctrl, el, applyValue(value), markLocalEdit() } */
const registry = new Map();

let suppressMs = 250;

// ---------- WebSocket ----------

let ws;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.addEventListener('open', () => setStatus($statusBridge, true));
  ws.addEventListener('close', () => {
    setStatus($statusBridge, false);
    setStatus($statusUe, false);
    setTimeout(connect, 1500);
  });
  ws.addEventListener('error', () => ws.close());

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    onServerMessage(msg);
  });
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function onServerMessage(msg) {
  switch (msg.type) {
    case 'hello':
      suppressMs = msg.suppressMs ?? suppressMs;
      setStatus($statusUe, !!msg.ueConnected);
      renderControls(msg.controls || []);
      // Hydrate from snapshot.
      for (const [id, value] of Object.entries(msg.snapshot || {})) {
        const entry = registry.get(id);
        if (entry) entry.applyValue(value);
      }
      break;
    case 'ueStatus':
      setStatus($statusUe, !!msg.connected);
      break;
    case 'update': {
      const entry = registry.get(msg.id);
      if (entry) entry.applyValue(msg.value);
      break;
    }
  }
}

function setStatus(el, on) {
  el.dataset.state = on ? 'on' : 'off';
}

// ---------- Rendering ----------

function renderControls(controls) {
  $controls.innerHTML = '';
  registry.clear();

  if (!controls.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent =
      'No controls defined. Edit WebController/server/config.js and add entries that match the Property Labels in your Remote Control preset.';
    $controls.appendChild(p);
    return;
  }

  // Group by category, preserving insertion order.
  const byCategory = new Map();
  for (const c of controls) {
    const cat = c.category || 'Misc';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(c);
  }

  for (const [cat, list] of byCategory) {
    const node = tplSection.content.firstElementChild.cloneNode(true);
    node.querySelector('h2').textContent = cat;
    const grid = node.querySelector('.grid');
    for (const ctrl of list) grid.appendChild(buildControl(ctrl));
    $controls.appendChild(node);
  }
}

function buildControl(ctrl) {
  const root = document.createElement('div');
  root.className = 'control';

  let lastLocalEditAt = 0;
  const markLocalEdit = () => { lastLocalEditAt = performance.now(); };
  const isSuppressed = () => performance.now() - lastLocalEditAt < suppressMs;

  let applyValue = () => {};

  switch (ctrl.kind) {
    case 'number': {
      const min = ctrl.min ?? 0;
      const max = ctrl.max ?? 1;
      const step = ctrl.step ?? (max - min) / 100;

      const labelRow = document.createElement('div');
      labelRow.className = 'label-row';
      const label = document.createElement('label');
      label.textContent = ctrl.label || ctrl.id;
      const value = document.createElement('span');
      value.className = 'value';
      labelRow.append(label, value);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(min);
      value.textContent = formatNumber(Number(input.value), step);

      let throttle = 0;
      input.addEventListener('input', () => {
        markLocalEdit();
        const v = Number(input.value);
        value.textContent = formatNumber(v, step);
        const now = performance.now();
        if (now - throttle >= 50) {
          throttle = now;
          send({ type: 'set', id: ctrl.id, value: v });
        }
      });
      input.addEventListener('change', () => {
        send({ type: 'set', id: ctrl.id, value: Number(input.value) });
      });

      applyValue = (v) => {
        if (isSuppressed()) return;
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        input.value = String(n);
        value.textContent = formatNumber(n, step);
      };

      root.append(labelRow, input);
      break;
    }

    case 'bool': {
      const wrap = document.createElement('label');
      wrap.className = 'toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      const sw = document.createElement('span');
      sw.className = 'switch';
      const text = document.createElement('span');
      text.textContent = ctrl.label || ctrl.id;
      wrap.append(input, sw, text);

      input.addEventListener('change', () => {
        markLocalEdit();
        send({ type: 'set', id: ctrl.id, value: input.checked });
      });

      applyValue = (v) => {
        if (isSuppressed()) return;
        input.checked = !!v;
      };

      root.appendChild(wrap);
      break;
    }

    case 'color': {
      const labelRow = document.createElement('div');
      labelRow.className = 'label-row';
      const label = document.createElement('label');
      label.textContent = ctrl.label || ctrl.id;
      labelRow.appendChild(label);

      const input = document.createElement('input');
      input.type = 'color';
      input.value = '#ffffff';

      let throttle = 0;
      input.addEventListener('input', () => {
        markLocalEdit();
        const now = performance.now();
        if (now - throttle < 50) return;
        throttle = now;
        send({ type: 'set', id: ctrl.id, value: hexToLinearColor(input.value) });
      });
      input.addEventListener('change', () => {
        send({ type: 'set', id: ctrl.id, value: hexToLinearColor(input.value) });
      });

      applyValue = (v) => {
        if (isSuppressed()) return;
        const hex = linearColorToHex(v);
        if (hex) input.value = hex;
      };

      root.append(labelRow, input);
      break;
    }

    case 'function': {
      const btn = document.createElement('button');
      btn.className = 'fn';
      btn.textContent = ctrl.label || ctrl.id;
      btn.addEventListener('click', () => {
        markLocalEdit();
        send({ type: 'call', id: ctrl.id, args: ctrl.args || {} });
      });
      root.appendChild(btn);
      break;
    }

    default: {
      const p = document.createElement('div');
      p.textContent = `Unsupported control kind: ${ctrl.kind}`;
      p.style.color = 'var(--bad)';
      root.appendChild(p);
    }
  }

  registry.set(ctrl.id, { ctrl, el: root, applyValue, markLocalEdit });
  return root;
}

// ---------- Helpers ----------

function formatNumber(n, step) {
  const decimals = step >= 1 ? 0 : Math.min(3, String(step).split('.')[1]?.length ?? 0);
  return n.toFixed(decimals);
}

// UE LinearColor uses 0..1 floats. Web color inputs use sRGB hex.
// We pass values straight through (sRGB <-> 0..1) and let UE interpret them.
// If you need true linear conversion, do it on the UE side or here.
function hexToLinearColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { R: 1, G: 1, B: 1, A: 1 };
  const n = parseInt(m[1], 16);
  return {
    R: ((n >> 16) & 0xff) / 255,
    G: ((n >> 8) & 0xff) / 255,
    B: (n & 0xff) / 255,
    A: 1,
  };
}

function linearColorToHex(v) {
  if (!v || typeof v !== 'object') return null;
  const r = clamp01(v.R), g = clamp01(v.G), b = clamp01(v.B);
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
function clamp01(x) { const n = Number(x); return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0)); }

// ---------- Boot ----------

connect();
