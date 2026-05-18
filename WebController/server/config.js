// Single source of truth shared between the bridge server and the web app.
//
// `controls` describes every UI element the web app can render. Each entry is
// either a `property` (read/write a value on a Remote Control preset entity)
// or a `function` (call a Blueprint function exposed on the preset).
//
// `id` is the stable web-side key (used in the UI and by the browser <-> bridge
// protocol). `ueId` (optional) is the actual address used when talking to UE:
// either the GUID of the exposed entry or its `DisplayName`. If `ueId` is
// omitted, `id` is used as the address.
//
// Why GUIDs? When you expose entries in an MPC, UE auto-names every scalar
// "Scalar Parameters" and every vector "Vector Parameters" / "...(1)..." etc.
// Renaming in the editor's Property ID column is purely cosmetic — the HTTP
// API only resolves entries by their auto-name or unique GUID. GUIDs are
// unambiguous, so we use them here.
//
// Find the GUIDs with:
//   curl -s http://127.0.0.1:30010/remote/preset/RCP_Dashboard \
//     | python3 -c "import json,sys
// for g in json.load(sys.stdin)['Preset']['Groups']:
//     for p in g['ExposedProperties']:
//         print(p['ID'], p['DisplayName'], p['UnderlyingProperty']['Name'])"

export const config = {
  // Bind address for the bridge HTTP/WS server. 0.0.0.0 = reachable on LAN.
  bridgeHost: '0.0.0.0',
  bridgePort: 8080,

  // Unreal Remote Control endpoints (kept on localhost — only the bridge is
  // exposed to the LAN, which keeps the attack surface small).
  ueHost: '127.0.0.1',
  ueHttpPort: 30010,
  ueWsPort: 30020,

  // Name of the Remote Control preset asset to register against.
  presetName: 'RCP_Dashboard',

  // Debounce window (ms) the web app uses to suppress inbound updates right
  // after a local edit. Mirrored here so the server can advertise it.
  localEditSuppressMs: 250,

  // The control map. Edit this list as you expose more entries in the preset.
  // Categories are purely for grouping in the UI.
  //
  // Entry shape:
  //   {
  //     id:          stable web-side key (used in URLs, UI, protocol)
  //     ueId:        UE address — GUID of the exposed entry (preferred) OR
  //                  its DisplayName. Omit to fall back to `id`.
  //     label:       friendly text shown in the web UI
  //     category:    'Gauges' | 'Lights' | 'Theme' | 'Functions' | ...
  //     kind:        'number' | 'bool' | 'color' | 'function'
  //     min, max, step  (number kind only)
  //     args         (function kind only, optional default args object)
  //   }
  controls: [
    // Gauges (scalar)
    { id: 'CurrentSpeed', ueFunction: 'Set Speed', ueArg: 'Value',
      label: 'Speed', category: 'Gauges', kind: 'number', min: 0, max: 1, step: 0.01 },
    { id: 'CurrentRPM', ueFunction: 'Set RPM', ueArg: 'Value',
      label: 'RPM', category: 'Gauges', kind: 'number', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },

    // Theme palette (vector / LinearColor)
    { id: 'ThemeColourPrimary',    ueFunction: 'Set Theme Primary',    ueArg: 'Value',
      label: 'Primaryt',    category: 'Theme', kind: 'color' },
    { id: 'ThemeColourSecondary',  ueFunction: 'Set Theme Secondary',  ueArg: 'Value',
      label: 'Secondary',  category: 'Theme', kind: 'color' },
    { id: 'ThemeColourTertiary',   ueFunction: 'Set Theme Tertiary',   ueArg: 'Value',
      label: 'Tertiary',   category: 'Theme', kind: 'color' },
    { id: 'ThemeColourQuaternary', ueFunction: 'Set Theme Quaternary', ueArg: 'Value',
      label: 'Quaternary', category: 'Theme', kind: 'color' },

    // Text colours
    { id: 'TextColourPrimary',   ueFunction: 'Set Text Primary',   ueArg: 'Value',
      label: 'Text primary',   category: 'Text', kind: 'color' },
    { id: 'TextColourSecondary', ueFunction: 'Set Text Secondary', ueArg: 'Value',
      label: 'Text secondary', category: 'Text', kind: 'color' },

    // --- Add WBP_MainDashboard properties/functions below as you expose them ---
    // { id: 'Headlights',    label: 'Headlights',    category: 'Lights',    kind: 'bool' },
    // { id: 'ToggleHazards', label: 'Toggle hazards', category: 'Functions', kind: 'function' },
  ],
};
