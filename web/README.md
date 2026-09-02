# Pylux for Tesla Web

A 1920×1200, touch-first browser surface for Pylux. It keeps the existing native Remote Play
engine separate and receives its audio/video through WebRTC. Without a configured bridge URL,
the interface starts in clearly labelled demo mode.

## Run locally

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_PYLUX_BRIDGE_URL` to the secure WebSocket endpoint of a Pylux bridge. The
browser side accepts a WebRTC offer, returns an answer and exchanges ICE candidates. See
[`bridge/PROTOCOL.md`](bridge/PROTOCOL.md) for the message contract.

## Tesla design targets

- Primary canvas: 1920×1200 landscape
- Minimum touch target: 54 px; primary action: 70 px
- No hover-only actions
- Responsive fallback for smaller landscape browsers
- Web Gamepad API detection and WebRTC audio/video receiver

For safety, the interface labels the expected state as parked. Actual browser availability and
media playback while the vehicle is moving remain controlled by the vehicle software.
