'use client';

import {
  ArrowLeft, BatteryCharging, Check, CircleHelp, Expand, Eye, EyeOff, Gamepad2,
  Gauge, House, KeyRound, LockKeyhole, Maximize2, Minimize2, MonitorUp,
  MoreHorizontal, Power, QrCode, Radio, Search, Settings, ShieldCheck, Signal, Smartphone, Volume2,
  VolumeX, Wifi, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode-terminal';
import { completePhonePairing, PyluxBridge, type BridgeState, type CloudGame, type PairChallenge } from '@/lib/pylux-bridge';

type SessionState = BridgeState | 'demo';

const controlHints = [
  { key: 'L1', label: 'Vorige' }, { key: 'L2', label: 'Richten' },
  { key: 'PS', label: 'Home' }, { key: 'R2', label: 'Actie' },
  { key: 'R1', label: 'Volgende' },
];

function StatusDot({ state }: { state: SessionState }) {
  return <span className={`status-dot status-${state}`} aria-hidden="true" />;
}

function gamepadButtonMask(pad: Gamepad) {
  const mapping: Array<[number, number]> = [
    [0, 0], [1, 1], [2, 2], [3, 3], [12, 6], [13, 7], [14, 4], [15, 5],
    [4, 8], [5, 9], [10, 10], [11, 11], [9, 12], [8, 13], [17, 14], [16, 15],
  ];
  const digital = mapping.reduce((mask, [button, bit]) => pad.buttons[button]?.pressed ? mask | (1 << bit) : mask, 0);
  return digital
    | ((pad.buttons[6]?.value ?? 0) > 0.08 ? (1 << 16) : 0)
    | ((pad.buttons[7]?.value ?? 0) > 0.08 ? (1 << 17) : 0);
}

const axis = (value = 0) => Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
const trigger = (value = 0) => Math.max(0, Math.min(255, Math.round(value * 255)));

const isHostedPlayPage = () => typeof window !== 'undefined'
  && window.location.hostname.endsWith('optifysolutions.nl');

const initialBridgeUrl = () => {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8080';
  return window.localStorage.getItem('pylux.bridgeUrl')
    || (isHostedPlayPage() ? 'wss://bridge.optifysolutions.nl' : 'ws://127.0.0.1:8080');
};

const initialPairCode = () => {
  if (typeof window === 'undefined') return 'pylux-tesla';
  return window.localStorage.getItem('pylux.pairCode')
    || (isHostedPlayPage() ? '' : 'pylux-tesla');
};

const assetUrl = (filename: string) => isHostedPlayPage() ? `/play/${filename}` : `/${filename}`;

export default function HomePage() {
  const pairingToken = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.hash.slice(1)).get('pair') ?? '';
  return pairingToken ? <PhonePairing pairingToken={pairingToken} /> : <TeslaHome />;
}

function PairingQr({ value }: { value: string }) {
  const qr = useMemo(() => {
    const model = new QRCode(-1, 1);
    model.addData(value);
    model.make();
    return model;
  }, [value]);
  const size = qr.getModuleCount();
  const cells = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.isDark(row, column)) cells.push(<rect key={`${row}-${column}`} x={column + 4} y={row + 4} width="1" height="1" />);
    }
  }
  return <svg className="pairing-qr" viewBox={`0 0 ${size + 8} ${size + 8}`} aria-label="QR-code voor koppelen"><rect width="100%" height="100%" fill="#fff" /><g fill="#071015">{cells}</g></svg>;
}

function PhonePairing({ pairingToken }: { pairingToken: string }) {
  const [replacementToken, setReplacementToken] = useState('');
  const [replaceAccount, setReplaceAccount] = useState(false);
  const [status, setStatus] = useState<'ready' | 'working' | 'done' | 'error'>('ready');
  const [message, setMessage] = useState('');
  const bridgeUrl = initialBridgeUrl();

  const finishPairing = async () => {
    if (replaceAccount && replacementToken.trim().length < 16) {
      setStatus('error');
      setMessage('Dit PlayStation-token lijkt te kort.');
      return;
    }
    setStatus('working');
    setMessage('Beveiligde koppeling afronden…');
    try {
      await completePhonePairing(bridgeUrl, pairingToken, replaceAccount ? replacementToken : '');
      setReplacementToken('');
      setStatus('done');
      setMessage('De Tesla is gekoppeld. Je kunt deze pagina sluiten.');
    } catch (cause) {
      setStatus('error');
      setMessage(cause instanceof Error ? cause.message : 'Koppelen is niet gelukt.');
    }
  };

  return (
    <main className="phone-pair-shell">
      <section className="phone-pair-card">
        {/* oxlint-disable-next-line next/no-img-element */}
        <img src={assetUrl('pylux-mark.png')} alt="Pylux" className="phone-pair-logo" />
        {status === 'done' ? (
          <>
            <span className="phone-success"><Check size={38} /></span>
            <p className="eyebrow">Koppeling voltooid</p>
            <h1>Tesla is speelklaar</h1>
            <p>{message}</p>
          </>
        ) : (
          <>
            <span className="phone-pair-icon"><Smartphone size={38} /></span>
            <p className="eyebrow">Pylux voor Tesla</p>
            <h1>Tesla koppelen</h1>
            <p>Bevestig de tijdelijke koppeling. Je opgeslagen PlayStation-account blijft veilig op de Pylux Bridge.</p>
            <label className="replace-account" aria-label="PlayStation-token vervangen"><input type="checkbox" checked={replaceAccount} onChange={(event) => setReplaceAccount(event.target.checked)} /><span><strong>PlayStation-token vervangen</strong><small>Alleen nodig als je opgeslagen account niet meer werkt.</small></span></label>
            {replaceAccount && <div className="token-field"><input type="password" value={replacementToken} onChange={(event) => setReplacementToken(event.target.value)} placeholder="Nieuwe NPSSO-token" autoComplete="off" /></div>}
            {message && <p className={status === 'error' ? 'wizard-error' : 'phone-progress'}>{message}</p>}
            <button className="wizard-primary" onClick={() => void finishPairing()} disabled={status === 'working'}>{status === 'working' ? 'Koppelen…' : 'Tesla veilig koppelen'}</button>
            <p className="wizard-note">Deze tijdelijke QR-koppeling verloopt automatisch.</p>
          </>
        )}
      </section>
    </main>
  );
}

function TeslaHome() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [showControls, setShowControls] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gamepad, setGamepad] = useState(false);
  const [controllerReady, setControllerReady] = useState(false);
  const [clock, setClock] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [games, setGames] = useState<CloudGame[]>([]);
  const [catalogWarning, setCatalogWarning] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedGame, setSelectedGame] = useState<CloudGame | null>(null);
  const [wizardOpen, setWizardOpen] = useState(true);
  const [wizardStep, setWizardStep] = useState(1);
  const [npsso, setNpsso] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState(initialBridgeUrl);
  const [pairCode, setPairCode] = useState(initialPairCode);
  const [setupError, setSetupError] = useState('');
  const [gameQuery, setGameQuery] = useState('');
  const [gameFilter, setGameFilter] = useState<'all' | 'owned'>('all');
  const [visibleGameCount, setVisibleGameCount] = useState(72);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [rememberToken, setRememberToken] = useState(true);
  const [pairingChallenge, setPairingChallenge] = useState<PairChallenge | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamPanelRef = useRef<HTMLElement>(null);
  const bridgeRef = useRef<PyluxBridge | null>(null);
  const touchButtonsRef = useRef(0);

  useEffect(() => {
    const updateClock = () => setClock(new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit', minute: '2-digit',
    }).format(new Date()));
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncGamepad = () => setGamepad(Array.from(navigator.getGamepads?.() ?? []).some((item) => item?.connected));
    window.addEventListener('gamepadconnected', syncGamepad);
    window.addEventListener('gamepaddisconnected', syncGamepad);
    syncGamepad();
    return () => {
      window.removeEventListener('gamepadconnected', syncGamepad);
      window.removeEventListener('gamepaddisconnected', syncGamepad);
    };
  }, []);

  useEffect(() => () => bridgeRef.current?.disconnect(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('pylux.bridgeUrl', bridgeUrl);
    if (pairCode) window.localStorage.setItem('pylux.pairCode', pairCode);
  }, [bridgeUrl, pairCode]);

  useEffect(() => {
    let animationFrame = 0;
    const forwardController = () => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((item) => item?.connected);
      if (bridgeRef.current) {
        bridgeRef.current.sendControllerState({
          b: (pad ? gamepadButtonMask(pad) : 0) | touchButtonsRef.current,
          lx: axis(pad?.axes[0]), ly: axis(pad?.axes[1]),
          rx: axis(pad?.axes[2]), ry: axis(pad?.axes[3]),
          l2: trigger(pad?.buttons[6]?.value), r2: trigger(pad?.buttons[7]?.value),
        });
      }
      animationFrame = window.requestAnimationFrame(forwardController);
    };
    animationFrame = window.requestAnimationFrame(forwardController);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  const startSession = useCallback(async () => {
    setError('');
    if (games.length > 0 && bridgeRef.current) {
      setShowLibrary(true);
      return;
    }
    setWizardOpen(true);
    setWizardStep(1);
  }, [games.length]);

  const createBridge = useCallback(() => new PyluxBridge(bridgeUrl, {
        onStateChange: setSessionState,
        onStream: (stream) => {
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          // Tesla's browser may reject delayed autoplay with audio. Start the
          // picture muted and let the next deliberate tap unlock sound.
          video.muted = true;
          setMuted(true);
          void video.play().then(() => setAudioBlocked(true)).catch(() => setAudioBlocked(true));
        },
        onControllerReady: setControllerReady,
        onCatalog: (catalog, warning) => {
          setGames(catalog);
          setCatalogWarning(warning);
          setNpsso('');
          setWizardOpen(false);
          setShowLibrary(true);
        },
        onProgress: setProgress,
        onPairChallenge: (challenge) => {
          setPairingChallenge(challenge);
          setProgress('Scan de QR-code met je telefoon.');
        },
        onPaired: (code) => {
          setPairCode(code);
          setPairingChallenge(null);
          setWizardStep(3);
        },
        onError: (message) => {
          setSetupError(message);
          setError(message);
        },
      }), [bridgeUrl]);

  const beginPhonePairing = useCallback(async () => {
    setSetupError('');
    setPairingChallenge(null);
    setProgress('Tijdelijke QR-code maken…');
    try {
      bridgeRef.current?.disconnect();
      const bridge = createBridge();
      bridgeRef.current = bridge;
      await bridge.beginPairing();
    } catch (cause) {
      setSessionState('error');
      setSetupError(cause instanceof Error ? cause.message : 'De QR-koppeling kon niet worden gestart.');
    }
  }, [createBridge]);

  const pairingUrl = pairingChallenge && typeof window !== 'undefined'
    ? `${window.location.origin}${isHostedPlayPage() ? '/play/' : '/'}#pair=${pairingChallenge.pairingToken}`
    : '';

  const connectAccount = useCallback(async () => {
    setSetupError('');
    if (npsso.trim().length < 16) {
      setSetupError('Dit token lijkt te kort. Kopieer alleen de waarde achter npsso=.');
      return;
    }
    if (!bridgeUrl.startsWith('ws://') && !bridgeUrl.startsWith('wss://')) {
      setSetupError('Gebruik een adres dat begint met ws:// of wss://.');
      return;
    }
    setWizardStep(3);
    setProgress(rememberToken ? 'Token veilig opslaan op de gekoppelde bridge…' : 'Veilig verbinden met de bridge…');
    try {
      bridgeRef.current?.disconnect();
      const bridge = createBridge();
      bridgeRef.current = bridge;
      await bridge.configureAndLoadCatalog(pairCode, npsso.trim(), rememberToken);
    } catch (cause) {
      setSessionState('error');
      const message = cause instanceof Error ? cause.message : 'De Pylux Bridge reageert niet.';
      setSetupError(message);
      setError(message);
    }
  }, [bridgeUrl, createBridge, npsso, pairCode, rememberToken]);

  const connectSavedAccount = useCallback(async () => {
    setSetupError('');
    if (!pairCode.trim()) {
      setSetupError('Vul de koppelcode van deze Pylux Bridge in.');
      return;
    }
    setWizardStep(3);
    setProgress('Opgeslagen account op de bridge openen…');
    try {
      bridgeRef.current?.disconnect();
      const bridge = createBridge();
      bridgeRef.current = bridge;
      await bridge.loadCatalog(pairCode.trim());
    } catch (cause) {
      setSessionState('error');
      const message = cause instanceof Error ? cause.message : 'Geen opgeslagen account gevonden.';
      setSetupError(message);
    }
  }, [createBridge, pairCode]);

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreenFallback;
    setFullscreenFallback(next);
    setFullscreen(next);
  }, [fullscreenFallback]);

  const toggleSound = useCallback(() => {
    const video = videoRef.current;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (video) {
      video.muted = nextMuted;
      if (!nextMuted) {
        void video.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
      }
    }
  }, [muted]);

  const resumeAudio = useCallback(() => {
    const video = videoRef.current;
    setMuted(false);
    if (!video) return;
    video.muted = false;
    void video.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  }, []);

  const setTouchButton = useCallback((bit: number, pressed: boolean) => {
    if (pressed) touchButtonsRef.current |= (1 << bit);
    else touchButtonsRef.current &= ~(1 << bit);
  }, []);

  const launchGame = useCallback((game: CloudGame) => {
    try {
      setSelectedGame(game);
      setControllerReady(false);
      setShowLibrary(false);
      setError('');
      setProgress('Cloudsessie voorbereiden…');
      bridgeRef.current?.startGame(game, { video: '1080p', fps: 60, hdr: false });
    } catch (cause) {
      setSessionState('error');
      setError(cause instanceof Error ? cause.message : 'De game kon niet worden gestart.');
    }
  }, []);

  const stopSession = useCallback(() => {
    bridgeRef.current?.disconnect();
    bridgeRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSessionState('idle');
    setControllerReady(false);
    setError('');
  }, []);

  const active = sessionState === 'streaming' || sessionState === 'demo';
  const launching = selectedGame !== null && (sessionState === 'connecting' || sessionState === 'provisioning');
  const filteredGames = useMemo(() => {
    const query = gameQuery.trim().toLocaleLowerCase('nl-NL');
    return games.filter((game) => {
      if (gameFilter === 'owned' && !game.isOwned) return false;
      return !query || game.name.toLocaleLowerCase('nl-NL').includes(query);
    });
  }, [gameFilter, gameQuery, games]);
  const visibleGames = filteredGames.slice(0, visibleGameCount);

  return (
    <main className="tesla-shell">
      <header className="topbar">
        <div className="brand-block">
          {/* oxlint-disable-next-line next/no-img-element */}
          <img src={assetUrl('pylux-mark.png')} alt="Pylux" className="brand-logo" width={54} height={54} />
          <div><p className="eyebrow">Pylux</p><h1>PlayStation Plus voor Tesla</h1></div>
        </div>
        <div className="top-status" aria-label="Systeemstatus">
          <span className="vehicle-mode"><BatteryCharging size={23} /> Geparkeerd</span>
          <span><Wifi size={23} /> Wi-Fi</span><span className="clock">{clock}</span>
          <button className="icon-button" aria-label="Instellingen" onClick={() => { setWizardOpen(true); setWizardStep(1); }}><Settings size={27} /></button>
        </div>
      </header>

      <section className="workspace">
        <article ref={streamPanelRef} className={`stream-panel ${active ? 'is-active' : ''} ${fullscreenFallback ? 'fullscreen-fallback' : ''}`}>
          {/* oxlint-disable-next-line next/no-img-element */}
          <img className="stream-poster" src={assetUrl('pylux-home.jpg')} alt="Pylux PlayStation-startscherm" />
          <video ref={videoRef} autoPlay playsInline muted={muted} className="remote-video">
            <track kind="captions" src={assetUrl('empty.vtt')} srcLang="nl" label="Nederlands" />
          </video>
          <div className="stream-shade" />
          <div className="stream-topline">
            <span className="quality-pill"><Signal size={19} /> 1080p · 60 fps</span>
            <button className="floating-button" aria-label={fullscreen ? 'Volledig scherm sluiten' : 'Volledig scherm'} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={23} /> : <Expand size={23} />}</button>
          </div>

          {!active && !launching && (
            <div className="launch-copy">
              <p className="eyebrow">PlayStation Plus Cloud Streaming</p>
              <h2>Je gamecatalogus.<br />Direct in de Tesla.</h2>
              <p>Geen eigen console nodig. Kies een game uit je PlayStation Plus-cloudcatalogus en stream via WebRTC.</p>
              <button className="launch-button" onClick={startSession} disabled={sessionState === 'loading' || sessionState === 'connecting' || sessionState === 'provisioning'}>
                <Power size={29} /> {sessionState === 'loading' ? 'Catalogus laden…' : 'Open gamecatalogus'}
              </button>
              {progress && (sessionState === 'connecting' || sessionState === 'provisioning') && <p className="progress-message">{progress}</p>}
              {error && <p className="error-message">{error}</p>}
            </div>
          )}

          {launching && (
            <output className="launch-copy launch-progress" aria-live="polite">
              <span className="launch-spinner" aria-hidden="true" />
              <p className="eyebrow">Cloudsessie wordt gestart</p>
              <h2>{selectedGame.name}</h2>
              <p className="progress-message">{progress || 'PlayStation Plus maakt de stream gereed…'}</p>
              <p className="launch-patience">Dit kan ongeveer 20–40 seconden duren. Laat deze pagina open.</p>
            </output>
          )}

          {active && (
            <div className="session-overlay">
              <div><p className="eyebrow">PlayStation Plus Cloud</p><h2>{selectedGame?.name ?? 'Speelklaar'}</h2></div>
              {sessionState === 'demo' && <span className="demo-badge">Interface-demo</span>}
            </div>
          )}
          {active && audioBlocked && <button className="audio-unlock" onClick={resumeAudio}><Volume2 /> Tik voor geluid</button>}
          {active && showTouchControls && (
            <div className="touch-controller" aria-label="Touchcontroller">
              <div className="touch-dpad">
                {[[6, '↑'], [4, '←'], [5, '→'], [7, '↓']].map(([bit, label]) => (
                  <button key={bit} className={`dpad-${bit}`} onPointerDown={() => setTouchButton(Number(bit), true)} onPointerUp={() => setTouchButton(Number(bit), false)} onPointerCancel={() => setTouchButton(Number(bit), false)}>{label}</button>
                ))}
              </div>
              <div className="touch-center">
                <button onPointerDown={() => setTouchButton(13, true)} onPointerUp={() => setTouchButton(13, false)}>Share</button>
                <button onPointerDown={() => setTouchButton(15, true)} onPointerUp={() => setTouchButton(15, false)}>PS</button>
                <button onPointerDown={() => setTouchButton(12, true)} onPointerUp={() => setTouchButton(12, false)}>Options</button>
              </div>
              <div className="touch-face">
                {[[3, '△'], [2, '□'], [1, '○'], [0, '×']].map(([bit, label]) => (
                  <button key={bit} className={`face-${bit}`} onPointerDown={() => setTouchButton(Number(bit), true)} onPointerUp={() => setTouchButton(Number(bit), false)} onPointerCancel={() => setTouchButton(Number(bit), false)}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="side-panel">
          <div className="console-card">
            <div className="console-visual" aria-hidden="true">
              <span className="console-spine" /><span className="console-wing left" /><span className="console-wing right" />
            </div>
            <div className="console-info">
              <div className="section-kicker"><StatusDot state={sessionState} /> PlayStation Plus</div>
              <h2>Cloud Gaming</h2>
              <p>{active ? `${selectedGame?.name ?? 'Cloudstream'} actief` : launching ? `${selectedGame?.name ?? 'Game'} wordt gestart` : 'Catalogus · klaar om te verbinden'}</p>
            </div>
            <button className="more-button" aria-label="Meer console-opties"><MoreHorizontal size={28} /></button>
          </div>

          <div className="connection-card">
            <div className="metric-heading">
              <span><Radio size={22} /> Verbinding</span><strong>{active ? 'Uitstekend' : 'Beschikbaar'}</strong>
            </div>
            <div className="signal-bars" aria-hidden="true">
              {[38, 56, 74, 92, 100].map((height) => <span key={height} style={{ height: `${height}%` }} />)}
            </div>
            <div className="metrics">
              <div><span>Netwerk</span><strong>5 GHz</strong></div>
              <div><span>Vertraging</span><strong>{active ? '18 ms' : '—'}</strong></div>
              <div><span>Profiel</span><strong>1080p</strong></div>
            </div>
          </div>

          <button className={`gamepad-card ${gamepad && controllerReady ? 'connected' : ''}`} onClick={() => setShowControls((value) => !value)}>
            <span className="gamepad-icon"><Gamepad2 size={35} /></span>
            <span><strong>{gamepad && controllerReady ? 'Controller speelklaar' : gamepad ? 'Controller gevonden' : controllerReady ? 'Touchbediening speelklaar' : 'Controller & touch'}</strong>
              <small>{gamepad && controllerReady ? 'Verbonden met PlayStation' : gamepad ? 'Start de stream om te verbinden' : controllerReady ? 'Tik voor touchzones of koppel Bluetooth' : 'Tik voor koppelen of touchzones'}</small></span>
            <CircleHelp size={24} />
          </button>

          <div className="quick-actions">
            <button onClick={toggleSound} className={muted ? 'selected' : ''}>{muted ? <VolumeX size={27} /> : <Volume2 size={27} />}<span>{muted ? 'Geluid aan' : 'Geluid'}</span></button>
            <button><Gauge size={27} /><span>Kwaliteit</span></button>
            <button onClick={toggleFullscreen}><MonitorUp size={27} /><span>{fullscreen ? 'Sluiten' : 'Scherm'}</span></button>
          </div>
          {(active || launching) && <button className="stop-button" onClick={stopSession}><X size={22} /> Sessie stoppen</button>}
        </aside>
      </section>

      <nav className="dock" aria-label="Hoofdnavigatie">
        <button className="dock-home active"><House size={27} /><span>Cloud Gaming</span></button>
        <div className="control-hints" aria-label="Controllerfuncties">
          {controlHints.map((item) => <div key={item.key}><kbd>{item.key}</kbd><span>{item.label}</span></div>)}
        </div>
        <button className="dock-settings"><Settings size={27} /><span>Instellingen</span></button>
      </nav>

      {showControls && (
        <dialog open className="control-sheet" aria-labelledby="controls-title">
          <button className="sheet-close" onClick={() => setShowControls(false)} aria-label="Sluiten"><X /></button>
          <p className="eyebrow">Bediening</p><h2 id="controls-title">Kies wat prettig speelt</h2>
          <div className="control-options">
            <div><Gamepad2 /><strong>Bluetooth-controller</strong><span>{gamepad ? controllerReady ? 'Verbonden met de PlayStation-stream en speelklaar.' : 'Controller gevonden. Wacht tot de stream volledig gestart is.' : 'Koppel hem aan de Tesla en druk daarna één knop in.'}</span></div>
            <button onClick={() => { setShowTouchControls((value) => !value); setShowControls(false); }}><Maximize2 /><strong>Touchzones</strong><span>{showTouchControls ? 'Verberg de virtuele controller.' : 'Toon een virtuele controller boven de stream.'}</span></button>
          </div>
        </dialog>
      )}

      {showLibrary && (
        <dialog open className="library-sheet" aria-labelledby="library-title">
          <div className="library-heading">
            <div><p className="eyebrow">PlayStation Plus</p><h2 id="library-title">Kies een game</h2></div>
            <button className="sheet-close" onClick={() => setShowLibrary(false)} aria-label="Sluiten"><X /></button>
          </div>
          {catalogWarning && <p className="catalog-warning">{catalogWarning}</p>}
          <div className="catalog-toolbar">
            <label className="catalog-search">
              <Search size={22} />
              <input value={gameQuery} onChange={(event) => { setGameQuery(event.target.value); setVisibleGameCount(72); }} placeholder="Zoek in de cloudcatalogus" aria-label="Games zoeken" />
              {gameQuery && <button onClick={() => setGameQuery('')} aria-label="Zoekopdracht wissen"><X size={19} /></button>}
            </label>
            <fieldset className="catalog-filters" aria-label="Catalogusfilter">
              <button className={gameFilter === 'all' ? 'active' : ''} onClick={() => { setGameFilter('all'); setVisibleGameCount(72); }}>Alles</button>
              <button className={gameFilter === 'owned' ? 'active' : ''} onClick={() => { setGameFilter('owned'); setVisibleGameCount(72); }}>Mijn games</button>
            </fieldset>
            <span className="catalog-count">{filteredGames.length.toLocaleString('nl-NL')} games</span>
          </div>
          <div className="game-grid">
            {visibleGames.map((game) => (
              <button key={game.productId} className="game-tile" onClick={() => launchGame(game)}>
                {/* oxlint-disable-next-line next/no-img-element */}
                <img src={game.imageUrl || game.landscapeImageUrl || assetUrl('pylux-home.jpg')} alt="" loading="lazy" />
                <span><strong>{game.name}</strong><small>{game.platform.toUpperCase()} · {game.isOwned ? 'In bibliotheek' : 'PS Plus'}</small></span>
              </button>
            ))}
            {visibleGames.length < filteredGames.length && (
              <button className="load-more" onClick={() => setVisibleGameCount((count) => count + 72)}>
                Toon meer <small>{visibleGames.length} van {filteredGames.length.toLocaleString('nl-NL')}</small>
              </button>
            )}
          </div>
          {filteredGames.length === 0 && <p className="empty-library">Geen streambare games gevonden met deze filters.</p>}
        </dialog>
      )}

      {wizardOpen && (
        <dialog open className="setup-wizard" aria-labelledby="setup-title">
          <div className="wizard-rail" aria-label={`Stap ${wizardStep} van 3`}>
            {[1, 2, 3].map((step) => (
              <span key={step} className={step <= wizardStep ? 'active' : ''}>
                {step < wizardStep ? <Check size={17} /> : step}
              </span>
            ))}
          </div>
          {wizardStep < 3 && (
            <button className="sheet-close" onClick={() => setWizardOpen(false)} aria-label="Wizard sluiten"><X /></button>
          )}

          {wizardStep === 1 && (
            <div className="wizard-content">
              <span className="wizard-icon"><ShieldCheck size={38} /></span>
              <p className="eyebrow">Eenmalige installatie</p>
              <h2 id="setup-title">Koppel PlayStation Plus</h2>
              <p className="wizard-lead">Je NPSSO-token wordt door de Pylux Bridge veilig op de gekoppelde server bewaard. De webpagina zelf bewaart het token niet.</p>
              <div className="privacy-points">
                <div><LockKeyhole /><span><strong>Veilig bewaard</strong><small>Alleen toegankelijk voor de Pylux Bridge</small></span></div>
                <div><Gamepad2 /><span><strong>Geen console nodig</strong><small>Voor Plus Premium-cloudgames</small></span></div>
              </div>
              {pairingChallenge && pairingUrl ? (
                <div className="pairing-challenge">
                  <PairingQr value={pairingUrl} />
                  <div><strong>Scan met je telefoon</strong><span>Open je camera en bevestig de koppeling.</span><code>{pairingChallenge.code}</code><small>Geldig gedurende 5 minuten</small></div>
                </div>
              ) : (
                <>
                  <button className="wizard-primary pairing-button" onClick={() => void beginPhonePairing()}><QrCode size={24} /> Koppel met telefoon</button>
                  <details className="manual-pairing">
                    <summary>Handmatig koppelen</summary>
                    <label className="setup-label" htmlFor="saved-pair-code">Koppelcode</label>
                    <div className="token-field">
                      <input id="saved-pair-code" type="password" value={pairCode} onChange={(event) => { setPairCode(event.target.value); setSetupError(''); }} placeholder="Voer je koppelcode in" autoComplete="off" autoCapitalize="none" spellCheck={false} />
                    </div>
                    <button className="wizard-secondary" onClick={() => void connectSavedAccount()}>Opgeslagen account gebruiken</button>
                  </details>
                  <button className="wizard-secondary" onClick={() => setWizardStep(2)}>Nieuw token instellen op dit scherm</button>
                </>
              )}
              {setupError && <p className="wizard-error">{setupError}</p>}
              <p className="wizard-note">Gebruik dit alleen terwijl de auto geparkeerd staat.</p>
            </div>
          )}

          {wizardStep === 2 && (
            <form className="wizard-content" onSubmit={(event) => { event.preventDefault(); void connectAccount(); }}>
              <button type="button" className="wizard-back" onClick={() => setWizardStep(1)}><ArrowLeft size={20} /> Terug</button>
              <span className="wizard-icon"><KeyRound size={36} /></span>
              <p className="eyebrow">PlayStation-account</p>
              <h2 id="setup-title">Voer je NPSSO-token in</h2>
              <p className="wizard-lead compact">Plak alleen de lange tokenwaarde, zonder <strong>npsso=</strong>. Deze wordt na de controle direct uit het formulier gewist.</p>
              <label className="setup-label" htmlFor="npsso">NPSSO-token</label>
              <div className="token-field">
                <input id="npsso" type={showToken ? 'text' : 'password'} value={npsso} onChange={(event) => { setNpsso(event.target.value); setSetupError(''); }} placeholder="Plak je token hier" autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
                <button type="button" onClick={() => setShowToken((value) => !value)} aria-label={showToken ? 'Token verbergen' : 'Token tonen'}>{showToken ? <EyeOff /> : <Eye />}</button>
              </div>
              <label className="remember-token" htmlFor="remember-token" aria-label="Token veilig bewaren"><input id="remember-token" type="checkbox" checked={rememberToken} onChange={(event) => setRememberToken(event.target.checked)} /><span><strong>Token veilig bewaren</strong><small>Op de gekoppelde bridge, zodat je dit niet opnieuw hoeft in te voeren.</small></span></label>
              <details className="advanced-settings">
                <summary>Bridge-instellingen</summary>
                <div className="advanced-grid">
                  <label>Bridge-adres<input value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} autoCapitalize="none" spellCheck={false} /></label>
                  <label>Koppelcode<input value={pairCode} onChange={(event) => setPairCode(event.target.value)} autoComplete="off" /></label>
                </div>
              </details>
              {setupError && <p className="wizard-error">{setupError}</p>}
              <button className="wizard-primary" type="submit">Account controleren</button>
            </form>
          )}

          {wizardStep === 3 && (
            <div className="wizard-content wizard-checking">
              <span className="checking-orbit"><span /></span>
              <p className="eyebrow">Beveiligde controle</p>
              <h2 id="setup-title">PlayStation Plus wordt gekoppeld</h2>
              <p className="wizard-lead">{progress || 'De lokale bridge controleert je account en haalt de cloudcatalogus op…'}</p>
              <div className="check-list">
                <span className="done"><Check /> Lokale bridge gevonden</span>
                <span className={progress.includes('catalogus') ? 'done' : ''}><Check /> Token versleuteld doorgegeven</span>
                <span><Check /> Cloudcatalogus laden</span>
              </div>
              {setupError && (
                <div className="wizard-failure">
                  <p>{setupError}</p>
                  <button onClick={() => setWizardStep(2)}>Gegevens aanpassen</button>
                </div>
              )}
            </div>
          )}
        </dialog>
      )}
    </main>
  );
}
