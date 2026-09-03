# Pylux Web bridge protocol

The browser connects to the bridge through a secure WebSocket. JSON messages use a `type`
discriminator.

## Browser to bridge

- `catalog`: `{ type, pairCode, forceRefresh?: boolean }`
- `start`: `{ type, pairCode, productId, profile: { video: "720p" | "1080p", fps: 30 | 60, hdr: boolean } }`
- `answer`: `{ type, sdp: RTCSessionDescriptionInit }`
- `ice`: `{ type, candidate: RTCIceCandidateInit }`
- `stop`: `{ type }`

Controller snapshots use the unordered `pylux-input` WebRTC DataChannel and contain compact
button, stick and trigger values.

## Bridge to browser

- `catalog`: `{ type, games: CloudGame[], warning?: string }`
- `offer`: `{ type, sdp: RTCSessionDescriptionInit }`
- `ice`: `{ type, candidate: RTCIceCandidateInit }`
- `state`: `{ type, state }`
- `progress`: `{ type, message }`
- `error`: `{ type, message: string }`

The native bridge owns the NPSSO token, catalog fetch, Plus entitlement validation and cloud
session provisioning. It sends neither NPSSO nor allocation credentials to the browser. Every
catalog/start request requires the pairing code, and deployments must use TLS (`wss://`) outside
localhost.
