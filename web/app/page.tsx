'use client';

import {
  BatteryCharging, CircleHelp, Expand, Gamepad2, Gauge, House, Maximize2,
  MonitorUp, MoreHorizontal, Power, Radio, Settings, Signal, Volume2, Wifi, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PyluxBridge, type BridgeState } from '@/lib/pylux-bridge';

type SessionState = BridgeState | 'demo';

const controlHints = [
  { key: 'L1', label: 'Vorige' }, { key: 'L2', label: 'Richten' },
  { key: 'PS', label: 'Home' }, { key: 'R2', label: 'Actie' },
  { key: 'R1', label: 'Volgende' },
];

function StatusDot({ state }: { state: SessionState }) {
  return <span className={`status-dot status-${state}`} aria-hidden="true" />;
}

export default function HomePage() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [showControls, setShowControls] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gamepad, setGamepad] = useState(false);
  const [clock, setClock] = useState('');
  const [error, setError] = useState('');
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

  const startSession = useCallback(async () => {
    setError('');
    const endpoint = process.env.NEXT_PUBLIC_PYLUX_BRIDGE_URL;
    if (!endpoint) {
      setSessionState('connecting');
      window.setTimeout(() => setSessionState('demo'), 1050);
      return;
    }
    try {
      const bridge = new PyluxBridge(endpoint, {
        onStateChange: setSessionState,
        onStream: (stream) => { if (videoRef.current) videoRef.current.srcObject = stream; },
        onError: setError,
      });
      bridgeRef.current = bridge;
      await bridge.connect({ video: '1080p', fps: 60, hdr: false });
    } catch (cause) {
      setSessionState('error');
      setError(cause instanceof Error ? cause.message : 'De Pylux Bridge reageert niet.');
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
          <div><p className="eyebrow">Pylux</p><h1>Tesla Remote Play</h1></div>
        </div>
        <div className="top-status" aria-label="Systeemstatus">
          <span className="vehicle-mode"><BatteryCharging size={23} /> Geparkeerd</span>
          <span><Wifi size={23} /> Wi-Fi</span><span className="clock">{clock}</span>
          <button className="icon-button" aria-label="Instellingen"><Settings size={27} /></button>
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
              <p className="eyebrow">Klaar voor Remote Play</p>
              <h2>Je PlayStation.<br />Op het grote scherm.</h2>
              <p>Touch-first voor het Tesla-scherm, met automatische gamepad-detectie en een rustige interface.</p>
              <button className="launch-button" onClick={startSession} disabled={sessionState === 'connecting'}>
                <Power size={29} /> {sessionState === 'connecting' ? 'Verbinden…' : 'Start Remote Play'}
              </button>
              {error && <p className="error-message">{error}</p>}
            </div>
          )}

          {active && (
            <div className="session-overlay">
              <div><p className="eyebrow">Verbonden met Living Room</p><h2>Speelklaar</h2></div>
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
              <div className="section-kicker"><StatusDot state={sessionState} /> PlayStation 5</div>
              <h2>Living Room</h2>
              <p>{active ? 'Remote Play actief' : 'Rustmodus · klaar om te verbinden'}</p>
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
        <button className="dock-home active"><House size={27} /><span>Remote Play</span></button>
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
    </main>
  );
}
