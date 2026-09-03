# Pylux for Tesla Web

A 1920×1200, touch-first PlayStation Plus Cloud Streaming surface for Pylux. A three-step setup
wizard passes the NPSSO token once to the native bridge, which keeps it in process memory, supplies
the authenticated cloud catalog, and forwards the chosen game's audio/video through WebRTC. The
token is never written to browser storage.

## Run locally

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_PYLUX_BRIDGE_URL` to the secure WebSocket endpoint of a Pylux bridge. The
browser first requests the Plus catalog, then accepts a WebRTC offer for the chosen game,
returns an answer and exchanges ICE candidates. See
[`bridge/PROTOCOL.md`](bridge/PROTOCOL.md) for the message contract.

## Tesla design targets

- Primary canvas: 1920×1200 landscape
- Minimum touch target: 54 px; primary action: 70 px
- No hover-only actions
- Responsive fallback for smaller landscape browsers
- Web Gamepad API detection and WebRTC audio/video receiver

For safety, the interface labels the expected state as parked. Actual browser availability and
media playback while the vehicle is moving remain controlled by the vehicle software.
