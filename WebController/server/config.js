// Single source of truth shared between the bridge server and the web app.
//
// `controls` describes every UI element the web app can render. Each entry is
// either a `property` (read/write a value on a Remote Control preset entity)
// or a `function` (call a Blueprint function exposed on the preset).
//
// IMPORTANT: the `id` for property controls MUST match the **Property Label**
// of the exposed entity inside the Remote Control preset (RCP_Dashboard).
// That label is what UE sends back in PresetFieldsChanged events, and it's
// what the bridge uses to look up which preset entity to PUT to.
//
// To add controls:
//   1. In UE, open the preset (Content/RemoteControl/RCP_Dashboard) and expose
//      the property/function from WBP_MainDashboard or MPC_Global.
//   2. Note the auto-generated label (or rename it to something tidy).
//   3. Add an entry below with that label as the `id`.

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
  //     id:          <Property Label exactly as it appears in the preset>
  //     label:       <Friendly text shown in the web UI>
  //     category:    'Gauges' | 'Lights' | 'Theme' | 'Functions' | ...
  //     kind:        'number' | 'bool' | 'color' | 'function'
  //     min, max, step  (number kind only)
  //     args         (function kind only, optional default args object)
  //   }
  // These ids match the parameter names in MPC_Global. When you expose each
  // MPC parameter in RCP_Dashboard, UE auto-labels the entry with the
  // parameter's name — so as long as you don't rename in the preset, these
  // ids will line up.
  controls: [
    // Gauges (scalar)
    { id: 'CurrentSpeed', label: 'Speed', category: 'Gauges', kind: 'number', min: 0, max: 1, step: 0.01 },

    // Theme palette (vector / LinearColor)
    { id: 'ThemeColourPrimary',    label: 'Primary',    category: 'Theme', kind: 'color' },
    { id: 'ThemeColourSecondary',  label: 'Secondary',  category: 'Theme', kind: 'color' },
    { id: 'ThemeColourTertiary',   label: 'Tertiary',   category: 'Theme', kind: 'color' },
    { id: 'ThemeColourQuaternary', label: 'Quaternary', category: 'Theme', kind: 'color' },

    // Text colours
    { id: 'TextColourPrimary',   label: 'Text primary',   category: 'Text', kind: 'color' },
    { id: 'TextColourSecondary', label: 'Text secondary', category: 'Text', kind: 'color' },

    // --- Add WBP_MainDashboard properties/functions below as you expose them ---
    // { id: 'Headlights',    label: 'Headlights',    category: 'Lights',    kind: 'bool' },
    // { id: 'ToggleHazards', label: 'Toggle hazards', category: 'Functions', kind: 'function' },
  ],
};
