# Pylux WebRTC bridge

This optional native process connects to a PS5 through `chiaki-lib` and forwards the existing
H.264 and Opus samples directly to a browser over WebRTC. Controller states return over an
unordered, zero-retransmit DataChannel. No video or audio transcoding is performed.

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
binary. The registration key and morning value are the same credentials the native Pylux client
stores for the registered PS5. Never put them in the browser or commit them.

```bash
./build-web-bridge/web-bridge/pylux-web-bridge
```

The bridge defaults to `127.0.0.1:8080`. For a Tesla on the same LAN, bind to a reachable private
address and configure a trusted TLS certificate. A browser page loaded over HTTPS must connect
to `wss://`; it will reject an insecure `ws://` bridge as mixed content.

## Security boundary

- A pairing code is mandatory before an offer or console session is created.
- Only one active browser session is allowed.
- Closing the signaling socket stops Remote Play.
- The bridge never sends PSN or console registration credentials to the browser.
- For internet use, add authenticated TURN and place the signaling endpoint behind a hardened
  reverse proxy. Do not expose the development listener directly to the public internet.
