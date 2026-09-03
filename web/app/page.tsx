'use client';

import {
  ArrowLeft, BatteryCharging, Check, CircleHelp, Expand, Eye, EyeOff, Gamepad2,
  Gauge, House, KeyRound, LockKeyhole, Maximize2, MonitorUp, MoreHorizontal,
  Power, Radio, Settings, ShieldCheck, Signal, Volume2, Wifi, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PyluxBridge, type BridgeState, type CloudGame } from '@/lib/pylux-bridge';

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
    [4, 8], [5, 9], [10, 10], [11, 11], [9, 12], [8, 13], [16, 15],
  ];
  return mapping.reduce((mask, [button, bit]) => pad.buttons[button]?.pressed ? mask | (1 << bit) : mask, 0);
}

const axis = (value = 0) => Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
const trigger = (value = 0) => Math.max(0, Math.min(255, Math.round(value * 255)));

export default function HomePage() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [showControls, setShowControls] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gamepad, setGamepad] = useState(false);
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
  const [bridgeUrl, setBridgeUrl] = useState('ws://127.0.0.1:8080');
  const [pairCode, setPairCode] = useState('pylux-tesla');
  const [setupError, setSetupError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const bridgeRef = useRef<PyluxBridge | null>(null);

  useEffect(() => {
    const updateClock = () => setClock(new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit', minute: '2-digit',
    }).format(new Date()));
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncGamepad = () => setGamepad(navigator.getGamepads?.().some(Boolean) ?? false);
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
    let animationFrame = 0;
    const forwardController = () => {
      const pad = navigator.getGamepads?.().find(Boolean);
      if (pad && bridgeRef.current) {
        bridgeRef.current.sendControllerState({
          b: gamepadButtonMask(pad),
          lx: axis(pad.axes[0]), ly: axis(pad.axes[1]),
          rx: axis(pad.axes[2]), ry: axis(pad.axes[3]),
          l2: trigger(pad.buttons[6]?.value), r2: trigger(pad.buttons[7]?.value),
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
    setProgress('Veilig verbinden met de lokale bridge…');
    try {
      const bridge = new PyluxBridge(bridgeUrl, {
        onStateChange: setSessionState,
        onStream: (stream) => { if (videoRef.current) videoRef.current.srcObject = stream; },
        onCatalog: (catalog, warning) => {
          setGames(catalog);
          setCatalogWarning(warning);
          setNpsso('');
          setWizardOpen(false);
          setShowLibrary(true);
        },
        onProgress: setProgress,
        onError: (message) => {
          setSetupError(message);
          setError(message);
        },
      });
      bridgeRef.current = bridge;
      await bridge.configureAndLoadCatalog(pairCode, npsso.trim());
    } catch (cause) {
      setSessionState('error');
      const message = cause instanceof Error ? cause.message : 'De Pylux Bridge reageert niet.';
      setSetupError(message);
      setError(message);
    }
  }, [bridgeUrl, npsso, pairCode]);

  const launchGame = useCallback((game: CloudGame) => {
    try {
      setSelectedGame(game);
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
    setError('');
  }, []);

  const active = sessionState === 'streaming' || sessionState === 'demo';

  return (
    <main className="tesla-shell">
      <header className="topbar">
        <div className="brand-block">
          {/* oxlint-disable-next-line next/no-img-element */}
          <img src="/pylux-mark.png" alt="Pylux" className="brand-logo" width={54} height={54} />
          <div><p className="eyebrow">Pylux</p><h1>PlayStation Plus voor Tesla</h1></div>
        </div>
        <div className="top-status" aria-label="Systeemstatus">
          <span className="vehicle-mode"><BatteryCharging size={23} /> Geparkeerd</span>
          <span><Wifi size={23} /> Wi-Fi</span><span className="clock">{clock}</span>
          <button className="icon-button" aria-label="Instellingen" onClick={() => { setWizardOpen(true); setWizardStep(1); }}><Settings size={27} /></button>
        </div>
      </header>

      <section className="workspace">
        <article className={`stream-panel ${active ? 'is-active' : ''}`}>
          {/* oxlint-disable-next-line next/no-img-element */}
          <img className="stream-poster" src="/pylux-home.jpg" alt="Pylux PlayStation-startscherm" />
          <video ref={videoRef} autoPlay playsInline muted={muted} className="remote-video">
            <track kind="captions" src="/empty.vtt" srcLang="nl" label="Nederlands" />
          </video>
          <div className="stream-shade" />
          <div className="stream-topline">
            <span className="quality-pill"><Signal size={19} /> 1080p · 60 fps</span>
            <button className="floating-button" aria-label="Volledig scherm"><Expand size={23} /></button>
          </div>

          {!active && (
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

          {active && (
            <div className="session-overlay">
              <div><p className="eyebrow">PlayStation Plus Cloud</p><h2>{selectedGame?.name ?? 'Speelklaar'}</h2></div>
              {sessionState === 'demo' && <span className="demo-badge">Interface-demo</span>}
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
              <p>{active ? `${selectedGame?.name ?? 'Cloudstream'} actief` : 'Catalogus · klaar om te verbinden'}</p>
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

          <button className={`gamepad-card ${gamepad ? 'connected' : ''}`} onClick={() => setShowControls((value) => !value)}>
            <span className="gamepad-icon"><Gamepad2 size={35} /></span>
            <span><strong>{gamepad ? 'Controller verbonden' : 'Controller & touch'}</strong>
              <small>{gamepad ? 'Gamepad API actief' : 'Bekijk de bediening'}</small></span>
            <CircleHelp size={24} />
          </button>

          <div className="quick-actions">
            <button onClick={() => setMuted((value) => !value)} className={muted ? 'selected' : ''}><Volume2 size={27} /><span>{muted ? 'Gedempt' : 'Geluid'}</span></button>
            <button><Gauge size={27} /><span>Kwaliteit</span></button>
            <button><MonitorUp size={27} /><span>Scherm</span></button>
          </div>
          {active && <button className="stop-button" onClick={stopSession}><X size={22} /> Sessie stoppen</button>}
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
            <div><Gamepad2 /><strong>Bluetooth-controller</strong><span>Koppel de controller aan je Tesla en herlaad de pagina.</span></div>
            <div><Maximize2 /><strong>Touchzones</strong><span>Tik op het streambeeld om de virtuele DualSense-laag te tonen.</span></div>
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
          <div className="game-grid">
            {games.map((game) => (
              <button key={game.productId} className="game-tile" onClick={() => launchGame(game)}>
                {/* oxlint-disable-next-line next/no-img-element */}
                <img src={game.imageUrl || game.landscapeImageUrl || '/pylux-home.jpg'} alt="" />
                <span><strong>{game.name}</strong><small>{game.platform.toUpperCase()} · {game.isOwned ? 'In bibliotheek' : 'PS Plus'}</small></span>
              </button>
            ))}
          </div>
          {games.length === 0 && <p className="empty-library">Geen streambare games gevonden voor dit account.</p>}
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
              <p className="wizard-lead">Je NPSSO-token wordt rechtstreeks naar de Pylux Bridge op je eigen netwerk gestuurd. De webpagina bewaart het token niet.</p>
              <div className="privacy-points">
                <div><LockKeyhole /><span><strong>Alleen lokaal</strong><small>Niet in cookies of browseropslag</small></span></div>
                <div><Gamepad2 /><span><strong>Geen console nodig</strong><small>Voor Plus Premium-cloudgames</small></span></div>
              </div>
              <button className="wizard-primary" onClick={() => setWizardStep(2)}>Token instellen</button>
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
