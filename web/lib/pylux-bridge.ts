export type BridgeState = 'idle' | 'connecting' | 'streaming' | 'error';

type BridgeEvents = {
  onStateChange: (state: BridgeState) => void;
  onStream: (stream: MediaStream) => void;
  onError: (message: string) => void;
};

type StreamProfile = { video: '720p' | '1080p'; fps: 30 | 60; hdr: boolean };
type SignalMessage =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'error'; message: string };

/** Browser-side half of the Pylux WebRTC bridge protocol. */
export class PyluxBridge {
  private socket?: WebSocket;
  private peer?: RTCPeerConnection;

  constructor(private readonly endpoint: string, private readonly events: BridgeEvents) {}

  async connect(profile: StreamProfile) {
    this.events.onStateChange('connecting');
    this.peer = new RTCPeerConnection({ iceServers: [] });
    this.peer.addTransceiver('video', { direction: 'recvonly' });
    this.peer.addTransceiver('audio', { direction: 'recvonly' });
    const media = new MediaStream();
    this.peer.ontrack = ({ track }) => {
      media.addTrack(track);
      this.events.onStream(media);
      this.events.onStateChange('streaming');
    };
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: 'ice', candidate: candidate.toJSON() });
    };
    this.peer.onconnectionstatechange = () => {
      if (this.peer?.connectionState === 'failed') {
        this.events.onStateChange('error');
        this.events.onError('De realtime streamverbinding is verbroken.');
      }
    };
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.onopen = () => { this.send({ type: 'start', profile }); resolve(); };
      socket.onerror = () => reject(new Error('De Pylux Bridge is niet bereikbaar.'));
      socket.onmessage = (event) => void this.handleMessage(event.data);
      socket.onclose = () => {
        if (this.peer?.connectionState !== 'closed') this.events.onStateChange('idle');
      };
    });
  }

  sendInput(control: string, value: number) { this.send({ type: 'input', control, value }); }

  disconnect() {
    this.send({ type: 'stop' });
    this.socket?.close();
    this.peer?.close();
    this.socket = undefined;
    this.peer = undefined;
    this.events.onStateChange('idle');
  }

  private send(payload: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private async handleMessage(raw: string) {
    const message = JSON.parse(raw) as SignalMessage;
    if (message.type === 'offer') {
      await this.peer?.setRemoteDescription(message.sdp);
      const answer = await this.peer?.createAnswer();
      if (answer) {
        await this.peer?.setLocalDescription(answer);
        this.send({ type: 'answer', sdp: answer });
      }
    } else if (message.type === 'ice') {
      await this.peer?.addIceCandidate(message.candidate);
    } else if (message.type === 'error') {
      this.events.onStateChange('error');
      this.events.onError(message.message);
    }
  }
}
