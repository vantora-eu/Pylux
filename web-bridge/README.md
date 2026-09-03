# Pylux WebRTC bridge

This optional native process provisions PlayStation Plus Cloud Streaming through `chiaki-lib`
and forwards its H.264 and Opus samples directly to a browser over WebRTC. Controller states
return over an unordered, zero-retransmit DataChannel. No console registration and no video or
audio transcoding are required.

## Build

```bash
cmake -S . -B build-web-bridge \
  -DCHIAKI_ENABLE_WEB_BRIDGE=ON \
  -DCHIAKI_ENABLE_GUI=OFF \
  -DCHIAKI_ENABLE_CLI=OFF \
  -DCHIAKI_ENABLE_TESTS=OFF \
  -DCHIAKI_ENABLE_FFMPEG_DECODER=OFF \
  -DCHIAKI_ENABLE_STEAMDECK_NATIVE=OFF \
  -DCHIAKI_ENABLE_SETSU=OFF
cmake --build build-web-bridge --target pylux-web-bridge -j
```

Copy `.env.example` to a private shell environment and export the values before starting the
binary. `PYLUX_NPSSO` is optional: it can be supplied at startup or entered once through the local
web setup wizard. The bridge only retains a wizard-supplied token in process memory. It is cleared
from the form after validation and is never written to browser storage or committed.

```bash
./build-web-bridge/web-bridge/pylux-web-bridge
```

The bridge defaults to `127.0.0.1:8080`. For a Tesla on the same LAN, bind to a reachable private
address and configure a trusted TLS certificate. A browser page loaded over HTTPS must connect
to `wss://`; it will reject an insecure `ws://` bridge as mixed content.

## Security boundary

- A pairing code is mandatory before the catalog or a cloud session is created.
- Only one active browser session is allowed.
- Closing the signaling socket cancels provisioning and stops Cloud Streaming.
- The bridge never sends the NPSSO token back to the browser or writes it to disk.
- The setup wizard only accepts a token after authenticating with the bridge pairing code.
- For internet use, add authenticated TURN and place the signaling endpoint behind a hardened
  reverse proxy. Do not expose the development listener directly to the public internet.
