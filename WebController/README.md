# Flashboard Web Controller

A small Node.js bridge + static web app that controls the in-car UI of the
`FlashboardPoC` Unreal project over the LAN. The bridge talks to Unreal's
built-in **Remote Control** WebSocket server (port 30020); the browser talks
to the bridge.

```
Browser  <-- ws://<host>:8080 -->  Node bridge  <-- ws://127.0.0.1:30020 -->  Unreal
                                        |
                                  serves /public
```

## One-time setup in Unreal

1. Open `FlashboardPoC.uproject` in UE 5.6. The `RemoteControl` and
   `RemoteControlWebInterface` plugins are already enabled, and
   `Config/DefaultEngine.ini` is configured to auto-start the HTTP (30010)
   and WebSocket (30020) servers.
2. Create a Remote Control Preset:
   `Content/RemoteControl/RCP_Dashboard`.
3. With `WBP_MainDashboard` (and the `MPC_Global` material parameter
   collection) open, drag every property/function you want to control into
   the preset. Note each entry's **Property Label** — that's the `id` you'll
   use in `server/config.js`.
4. Start Play-In-Editor. Verify in a terminal:
   ```sh
   curl http://localhost:30010/remote/presets
   ```
   You should see `RCP_Dashboard` in the list.

## Run the bridge

```sh
cd WebController
npm install
npm start
```

Then open <http://localhost:8080> on the host machine, or
`http://<your-lan-ip>:8080` from a phone on the same Wi-Fi.

Find your LAN IP on macOS:
```sh
ifconfig | grep "inet " | grep -v 127.0.0.1
```

## Adding controls

Edit [`server/config.js`](server/config.js) and add an entry per exposed
preset field. The `id` **must match the Property Label** in the preset —
that's the key UE uses in `PresetFieldsChanged` events.

```js
{ id: 'Speed',      label: 'Speed (km/h)', category: 'Gauges', kind: 'number', min: 0, max: 260, step: 1 },
{ id: 'Headlights', label: 'Headlights',   category: 'Lights', kind: 'bool' },
{ id: 'ThemePrimary', label: 'Primary',    category: 'Theme',  kind: 'color' },
{ id: 'ToggleHazards', label: 'Toggle hazards', category: 'Functions', kind: 'function' },
```

Restart the bridge (`npm start`) after editing the config.

## Two-way sync

- Browser edits are sent to UE and echoed to other connected browsers
  immediately.
- UE-side changes (e.g. gauges driven by the simulation) flow back via
  `PresetFieldsChanged` and update every browser.
- The web app suppresses inbound updates for ~250 ms after a local edit on
  the same control to prevent feedback loops while dragging sliders.

## Troubleshooting

- **`bridge` pill stays red** — `npm start` not running, or another process
  is on port 8080. Change `bridgePort` in `server/config.js`.
- **`unreal` pill stays red** — PIE isn't running, or the WebSocket server
  didn't start. In UE, check `Edit ▸ Project Settings ▸ Plugins ▸ Web Remote
  Control` and confirm both servers are enabled. Restart the editor after
  the first run so the new `DefaultEngine.ini` settings take effect.
- **Controls don't move anything** — the `id` in `config.js` must exactly
  match the **Property Label** in the preset (case-sensitive). Run with
  `DEBUG_UE=1 npm start` to log raw UE messages.
- **Phone can't connect** — ensure your firewall allows incoming TCP 8080,
  and that the phone is on the same Wi-Fi network.

## Security notes

- Only the bridge is bound to `0.0.0.0` (LAN). The UE Remote Control servers
  remain on `127.0.0.1`, so nothing on the LAN can talk to UE directly.
- There is **no authentication** in this PoC. Don't expose the bridge to the
  public internet.
