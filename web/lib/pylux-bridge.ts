export type BridgeState = 'idle' | 'loading' | 'connecting' | 'provisioning' | 'streaming' | 'error';

export type CloudGame = {
  productId: string;
  name: string;
  imageUrl: string;
  landscapeImageUrl: string;
  platform: string;
  serviceType: 'psnow' | 'pscloud';
  isOwned: boolean;
};

type BridgeEvents = {
  onStateChange: (state: BridgeState) => void;
  onStream: (stream: MediaStream) => void;
  onCatalog: (games: CloudGame[], warning: string) => void;
  onProgress: (message: string) => void;
  onError: (message: string) => void;
};

type StreamProfile = { video: '720p' | '1080p'; fps: 30 | 60; hdr: boolean };
export type ControllerState = {
  b: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  l2: number;
  r2: number;
};
type SignalMessage =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'state'; state: BridgeState }
  | { type: 'catalog'; games: CloudGame[]; warning?: string }
  | { type: 'progress'; message: string }
  | { type: 'configured' }
  | { type: 'error'; message: string };

/** Browser-side half of the cloud-only Pylux WebRTC bridge protocol. */
export class PyluxBridge {
  private socket?: WebSocket;
  private peer?: RTCPeerConnection;
  private input?: RTCDataChannel;
  private pairCode = '';

  constructor(private readonly endpoint: string, private readonly events: BridgeEvents) {}

  async loadCatalog(pairCode: string, forceRefresh = false) {
    this.pairCode = pairCode;
    this.events.onStateChange('loading');
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.onopen = () => {
        this.send({ type: 'catalog', pairCode, forceRefresh });
        resolve();
      };
      socket.onerror = () => reject(new Error('De Pylux Bridge is niet bereikbaar.'));
      socket.onmessage = (event) => void this.handleMessage(event.data);
      socket.onclose = () => {
        if (this.peer?.connectionState !== 'closed') this.events.onStateChange('idle');
      };
    });
  }

  async configureAndLoadCatalog(pairCode: string, npsso: string) {
    this.pairCode = pairCode;
    this.events.onStateChange('connecting');
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.onopen = () => {
        this.send({ type: 'configure', pairCode, npsso });
        resolve();
      };
      socket.onerror = () => reject(new Error('De lokale Pylux Bridge is niet bereikbaar.'));
      socket.onmessage = (event) => void this.handleMessage(event.data);
      socket.onclose = () => {
        if (this.peer?.connectionState !== 'closed') this.events.onStateChange('idle');
      };
    });
  }

  startGame(game: CloudGame, profile: StreamProfile) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('De verbinding met de Pylux Bridge is gesloten.');
    }
    this.events.onStateChange('connecting');
    this.setupPeer();
    this.send({ type: 'start', productId: game.productId, profile, pairCode: this.pairCode });
  }

  sendControllerState(state: ControllerState) {
    if (this.input?.readyState === 'open' && this.input.bufferedAmount < 4096) {
      this.input.send(JSON.stringify(state));
    }
  }

  disconnect() {
    this.send({ type: 'stop' });
    this.socket?.close();
    this.input?.close();
    this.peer?.close();
    this.socket = undefined;
    this.input = undefined;
    this.peer = undefined;
    this.events.onStateChange('idle');
  }

  private setupPeer() {
    this.peer?.close();
    this.peer = new RTCPeerConnection({ iceServers: [] });
    const media = new MediaStream();
    this.peer.ontrack = ({ track }) => {
      media.addTrack(track);
      this.events.onStream(media);
    };
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: 'ice', candidate: candidate.toJSON() });
    };
    this.peer.ondatachannel = ({ channel }) => {
      if (channel.label === 'pylux-input') this.input = channel;
    };
    this.peer.onconnectionstatechange = () => {
      if (this.peer?.connectionState === 'failed') {
        this.events.onStateChange('error');
        this.events.onError('De realtime streamverbinding is verbroken.');
      }
    };
  }

  private send(payload: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private async handleMessage(raw: string) {
    try {
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
      } else if (message.type === 'catalog') {
        this.events.onCatalog(message.games, message.warning ?? '');
      } else if (message.type === 'progress') {
        this.events.onProgress(message.message);
      } else if (message.type === 'configured') {
        this.events.onProgress('Token geaccepteerd. Gamecatalogus ophalen…');
      } else if (message.type === 'state') {
        this.events.onStateChange(message.state);
      } else if (message.type === 'error') {
        this.events.onStateChange('error');
        this.events.onError(message.message);
      }
    } catch (cause) {
      this.events.onStateChange('error');
      this.events.onError(cause instanceof Error ? cause.message : 'Ongeldig bericht van de Pylux Bridge.');
    }
  }
}
