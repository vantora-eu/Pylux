# Pylux Web bridge protocol

The browser connects to the bridge through a secure WebSocket. JSON messages use a `type`
discriminator.

## Browser to bridge

- `configure`: `{ type, pairCode, npsso, remember?: boolean }` (secure local setup; macOS stores it in Keychain when `remember` is true)
- `catalog`: `{ type, pairCode, forceRefresh?: boolean }`
- `start`: `{ type, pairCode, productId, profile: { video: "720p" | "1080p", fps: 30 | 60, hdr: boolean } }`
- `answer`: `{ type, sdp: RTCSessionDescriptionInit }`
- `ice`: `{ type, candidate: RTCIceCandidateInit }`
- `stop`: `{ type }`

Controller snapshots use the unordered `pylux-input` WebRTC DataChannel and contain compact
button, stick and trigger values.

## Bridge to browser

- `configured`: `{ type, persisted: boolean }`
- `catalog`: `{ type, games: CloudGame[], warning?: string }`
- `offer`: `{ type, sdp: RTCSessionDescriptionInit }`
- `ice`: `{ type, candidate: RTCIceCandidateInit }`
- `state`: `{ type, state }`
- `progress`: `{ type, message }`
- `error`: `{ type, message: string }`

The native bridge owns the NPSSO token after initial setup, catalog fetch, Plus entitlement
validation and cloud session provisioning. It sends neither NPSSO nor allocation credentials back
to the browser. On macOS, opt-in persistence uses the system Keychain rather than browser storage
or a plaintext file. Every configure/catalog/start request
requires the pairing code, and deployments must use TLS (`wss://`) outside localhost.
