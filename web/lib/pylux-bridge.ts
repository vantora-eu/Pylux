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
  onControllerReady: (ready: boolean) => void;
  onCatalog: (games: CloudGame[], warning: string) => void;
  onProgress: (message: string) => void;
  onError: (message: string) => void;
  onPairChallenge: (challenge: PairChallenge) => void;
  onPaired: (pairCode: string) => void;
};

export type PairChallenge = { pairingToken: string; code: string; expiresIn: number };

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
  | { type: 'configured'; persisted?: boolean }
  | { type: 'pair_challenge'; pairingToken: string; code: string; expiresIn: number }
  | { type: 'paired'; pairCode: string }
  | { type: 'pair_complete'; success: boolean }
  | { type: 'error'; message: string };

/** Browser-side half of the cloud-only Pylux WebRTC bridge protocol. */
export class PyluxBridge {
  private socket?: WebSocket;
  private peer?: RTCPeerConnection;
  private input?: RTCDataChannel;
  private media?: MediaStream;
  private mediaPublished = false;
  private pairCode = '';

  constructor(private readonly endpoint: string, private readonly events: BridgeEvents) {}

  async beginPairing() {
    this.events.onStateChange('connecting');
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.onopen = () => {
        this.send({ type: 'pair_begin' });
        resolve();
      };
      socket.onerror = () => reject(new Error('De Pylux Bridge is niet bereikbaar.'));
      socket.onmessage = (event) => void this.handleMessage(event.data);
      socket.onclose = () => {
        if (this.peer?.connectionState !== 'closed') this.events.onStateChange('idle');
      };
    });
  }

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

  async configureAndLoadCatalog(pairCode: string, npsso: string, remember = true) {
    this.pairCode = pairCode;
    this.events.onStateChange('connecting');
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.onopen = () => {
        this.send({ type: 'configure', pairCode, npsso, remember });
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
    this.media = undefined;
    this.mediaPublished = false;
    this.events.onControllerReady(false);
    this.events.onStateChange('idle');
  }

  private setupPeer() {
    this.peer?.close();
    this.peer = new RTCPeerConnection({ iceServers: [] });
    this.media = new MediaStream();
    this.mediaPublished = false;
    this.peer.ontrack = ({ track }) => {
      this.addRemoteTrack(track);
    };
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: 'ice', candidate: candidate.toJSON() });
    };
    this.peer.ondatachannel = ({ channel }) => {
      if (channel.label !== 'pylux-input') return;
      this.input = channel;
      const reportReady = () => this.events.onControllerReady(channel.readyState === 'open');
      channel.onopen = reportReady;
      channel.onclose = reportReady;
      channel.onerror = () => this.events.onControllerReady(false);
      reportReady();
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
        // Some embedded Chromium builds do not dispatch `track` for an
        // offer-created receiver. Populate the same MediaStream explicitly.
        this.peer?.getReceivers().forEach(({ track }) => this.addRemoteTrack(track));
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
        this.events.onProgress(message.persisted ? 'Token veilig opgeslagen. Gamecatalogus ophalen…' : 'Token geaccepteerd. Gamecatalogus ophalen…');
      } else if (message.type === 'pair_challenge') {
        this.events.onPairChallenge(message);
      } else if (message.type === 'paired') {
        this.pairCode = message.pairCode;
        this.events.onPaired(message.pairCode);
        this.events.onProgress('Tesla gekoppeld. Gamecatalogus ophalen…');
        this.send({ type: 'catalog', pairCode: message.pairCode, forceRefresh: false });
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

  private addRemoteTrack(track: MediaStreamTrack) {
    if (track.kind !== 'audio' && track.kind !== 'video') return;
    const media = this.media ?? (this.media = new MediaStream());
    if (!media.getTracks().some((item) => item.id === track.id)) media.addTrack(track);
    if (!this.mediaPublished) {
      this.mediaPublished = true;
      this.events.onStream(media);
    }
  }
}

export function completePhonePairing(endpoint: string, pairingToken: string, npsso = '') {
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const timer = window.setTimeout(() => {
      socket.close();
      reject(new Error('De koppelcode is verlopen. Maak op het Tesla-scherm een nieuwe QR-code.'));
    }, 15_000);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'pair_complete', pairingToken, npsso: npsso.trim() }));
    socket.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('De Pylux Bridge is niet bereikbaar.'));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as SignalMessage;
      if (message.type === 'pair_complete' && message.success) {
        window.clearTimeout(timer);
        socket.close();
        resolve();
      } else if (message.type === 'error') {
        window.clearTimeout(timer);
        socket.close();
        reject(new Error(message.message));
      }
    };
  });
}
