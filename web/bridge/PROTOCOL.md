# Pylux Web bridge protocol

The browser connects to the bridge through a secure WebSocket. JSON messages use a `type`
discriminator.

## Browser to bridge

- `start`: `{ type, profile: { video: "720p" | "1080p", fps: 30 | 60, hdr: boolean } }`
- `answer`: `{ type, sdp: RTCSessionDescriptionInit }`
- `ice`: `{ type, candidate: RTCIceCandidateInit }`
- `input`: `{ type, control: string, value: number }`
- `stop`: `{ type }`

## Bridge to browser

- `offer`: `{ type, sdp: RTCSessionDescriptionInit }`
- `ice`: `{ type, candidate: RTCIceCandidateInit }`
- `error`: `{ type, message: string }`

The native bridge is responsible for console discovery/registration, waking the console,
feeding decoded Pylux audio/video into WebRTC, and mapping input messages back to Chiaki input.
It must authenticate every session and should only expose TLS (`wss://`) outside localhost.
