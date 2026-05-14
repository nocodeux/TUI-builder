// RuntimeView — React shell around the pure-JS GameRuntime. Owns the
// <canvas> element, forwards keyboard input, and starts/stops the
// runtime around its lifecycle.
//
// Architecture:
//  • Receives the whole `world` so it can handle inter-level navigation
//    internally without touching editor state.
//  • Always starts from world.levels[0] (entry level).
//  • A "viewport frame" div — sized exactly to the level's viewport —
//    contains both the game canvas and the GameHUD overlay. This keeps
//    both layers visually confined to the same region (matching the
//    export boundary the user defined).

import React, { useEffect, useRef, useState } from 'react';
import { GameRuntime } from '../runtime/gameRuntime';
import GameHUD from '../runtime/GameHUD';

const KEY_MAP = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ' ': 'jump',
  z: 'attack', Z: 'attack',
  e: 'interact', E: 'interact',
  Shift: 'dash',
};

export default function RuntimeView({ world, assets, onStop, viewMode, activeLevelId }) {
  // Start at the first level (world entry point)
  const [currentLevelId, setCurrentLevelId] = useState(() =>
    (world?.levels || [])[0]?.id || null
  );

  const levels      = world?.levels || [];
  const currentLevel = levels.find(l => l.id === currentLevelId) || levels[0] || null;
  const levelType   = currentLevel?.levelType || 'game';

  const showGame = levelType === 'game' || levelType === 'game+hud';
  const showHUD  = levelType === 'hud-only' || levelType === 'game+hud';

  // Viewport dimensions — the "export boundary" for this level
  const viewportW = (currentLevel?.viewportCols || 20) * (currentLevel?.tileMap?.tileWidth  || 32);
  const viewportH = (currentLevel?.viewportRows || 14) * (currentLevel?.tileMap?.tileHeight || 32);

  const canvasRef    = useRef(null);
  const runtimeRef   = useRef(null);
  const [debug, setDebug]                 = useState(null);
  const [showDebug, setShowDebug]         = useState(true);
  const [showColliders, setShowColliders] = useState(false);

  // Sync with editor tab selection while playing.
  useEffect(() => {
    if (activeLevelId && levels.some(l => l.id === activeLevelId)) {
      setCurrentLevelId(activeLevelId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevelId]);

  // Navigate to another level inside this world.
  const handleNavigateLevel = (levelId) => {
    if (levels.some(l => l.id === levelId)) setCurrentLevelId(levelId);
  };

  // Handle screen navigation: if the target is a level in this world, treat it as level nav.
  const handleNavigateScreen = (targetId) => {
    if (levels.some(l => l.id === targetId)) {
      setCurrentLevelId(targetId);
    } else if (targetId === world?.id) {
      setCurrentLevelId(levels[0]?.id || null);
    }
  };

  // Game-canvas runtime lifecycle. Runs only when the level type needs it.
  useEffect(() => {
    if (!showGame) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = viewportW;
    canvas.height = viewportH;

    const rt = new GameRuntime({ level: currentLevel, assets, canvas });
    runtimeRef.current = rt;
    rt.start();

    if (document.activeElement && document.activeElement !== canvas) {
      document.activeElement.blur?.();
    }
    canvas.focus({ preventScroll: true });

    const handleKey = (e, pressed) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const action = KEY_MAP[e.key];
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      rt.setInput(action, pressed);
    };
    const onDown = (e) => handleKey(e, true);
    const onUp   = (e) => handleKey(e, false);
    window.addEventListener('keydown', onDown, { capture: true });
    window.addEventListener('keyup',   onUp,   { capture: true });

    let lastJson = '';
    const pollId = setInterval(() => {
      const info = rt.getDebugInfo();
      const json = JSON.stringify(info);
      if (json !== lastJson) { lastJson = json; setDebug(info); }
    }, 100);

    return () => {
      rt.stop();
      runtimeRef.current = null;
      window.removeEventListener('keydown', onDown, { capture: true });
      window.removeEventListener('keyup',   onUp,   { capture: true });
      clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, assets, viewportW, viewportH, showGame]);

  return (
    // Outer wrapper: fills the canvas-container area, dark mat around viewport
    <div style={{
      position: 'relative', flex: 1, minHeight: 0,
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto',
    }}>
      {/* ── Viewport frame ──────────────────────────────────────────────────
          Fixed at viewportW × viewportH — exactly the export boundary.
          Both the game canvas and the HUD live inside this frame so the
          user sees exactly what will be in the exported game.          */}
      <div style={{
        position: 'relative',
        width:  viewportW,
        height: viewportH,
        flexShrink: 0,
        overflow: 'hidden',
        margin: 12,
        boxShadow: '0 0 0 1px var(--border), 0 0 0 2px rgba(0,0,0,0.5)',
        background: '#000',
      }}>
        {/* Game canvas */}
        {showGame && (
          <canvas
            ref={canvasRef}
            tabIndex={0}
            onMouseDown={() => canvasRef.current?.focus({ preventScroll: true })}
            style={{
              display: 'block',
              imageRendering: 'pixelated',
              outline: 'none',
              // Canvas pixel dimensions are set in the effect;
              // CSS size matches the viewport frame exactly.
              width:  viewportW,
              height: viewportH,
            }}
          />
        )}

        {/* HUD overlay — sits on top of the canvas (or fills frame for hud-only) */}
        {showHUD && (
          <GameHUD
            rows={currentLevel?.rows || []}
            onNavigateLevel={handleNavigateLevel}
            onNavigateScreen={handleNavigateScreen}
            viewMode={viewMode}
          />
        )}
      </div>

      {/* Key hint — outside the frame so it doesn't cover game content */}
      {showGame && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(0,0,0,0.7)', padding: '4px 8px',
          border: '1px solid var(--border)',
          fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)',
          pointerEvents: 'none',
        }}>
          Arrows/WASD · Space=jump · Z=attack · E=interact · Shift=dash
        </div>
      )}

      {/* Level name breadcrumb (only when multiple levels) */}
      {levels.length > 1 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.7)', padding: '3px 8px',
          border: '1px solid var(--border)',
          fontSize: 9, fontFamily: 'monospace', color: 'var(--text-dim)',
        }}>
          {currentLevel?.name || '—'}
        </div>
      )}

      {/* ── Debug HUD ──────────────────────────────────────────────────────── */}
      {showGame && showDebug && debug && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          padding: '6px 8px',
          background: 'rgba(0,0,0,0.85)', border: '1px solid var(--accent)',
          fontFamily: 'monospace', fontSize: 10, color: 'var(--accent)',
          minWidth: 200, lineHeight: 1.5, zIndex: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 'bold' }}>◉ DEBUG</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => {
                  const next = !showColliders;
                  setShowColliders(next);
                  runtimeRef.current?.setShowColliders(next);
                }}
                style={{
                  background: showColliders ? 'rgba(255,165,0,0.25)' : 'transparent',
                  border: `1px solid ${showColliders ? 'rgba(255,165,0,0.9)' : 'var(--text-dim)'}`,
                  color: showColliders ? 'rgba(255,165,0,1)' : 'var(--text-dim)',
                  fontSize: 9, padding: '0 4px', cursor: 'pointer', fontFamily: 'monospace',
                }}
              >colliders</button>
              <button
                type="button"
                onClick={() => setShowDebug(false)}
                style={{
                  background: 'transparent', border: '1px solid var(--text-dim)', color: 'var(--text-dim)',
                  fontSize: 9, padding: '0 4px', cursor: 'pointer', fontFamily: 'monospace',
                }}
              >hide</button>
            </div>
          </div>
          <div>
            INPUT:&nbsp;
            {debug.input.left   ? '◀' : '·'}
            {debug.input.right  ? '▶' : '·'}
            {debug.input.up     ? '▲' : '·'}
            {debug.input.down   ? '▼' : '·'}
            {debug.input.jump    ? ' [SPC]'  : ''}
            {debug.input.attack  ? ' [ATK]'  : ''}
            {debug.input.interact? ' [INT]'  : ''}
            {debug.input.dash    ? ' [DASH]' : ''}
          </div>
          {debug.player ? (
            <>
              <div>HP: {debug.player.hp} · POS: ({debug.player.x}, {debug.player.y})</div>
              <div>VEL: ({debug.player.vx}, {debug.player.vy}){debug.player.onGround ? ' · onGround' : ' · airborne'}</div>
              <div>ANIM: {debug.player.anim || '—'} · frame {debug.player.frame}</div>
              {debug.player.hitState && (
                <div style={{ color: '#ff8844' }}>HIT: {debug.player.hitState}</div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => runtimeRef.current?.applyHit(10)}
                  style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid #ff8844', color: '#ff8844', fontSize: 9, padding: '1px 5px', cursor: 'pointer', fontFamily: 'monospace' }}
                >hit ×10</button>
                <button
                  type="button"
                  onClick={() => runtimeRef.current?.applyHit(50)}
                  style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid #ff4455', color: '#ff4455', fontSize: 9, padding: '1px 5px', cursor: 'pointer', fontFamily: 'monospace' }}
                >hit ×50</button>
              </div>
            </>
          ) : (
            <div style={{ color: '#ff8899' }}>no playerMain entity</div>
          )}
          {debug.enemies && debug.enemies.total > 0 && (
            <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 4 }}>
              ENEMIES: {debug.enemies.alive}/{debug.enemies.total} alive
            </div>
          )}
        </div>
      )}
      {showGame && !showDebug && (
        <button
          type="button"
          onClick={() => setShowDebug(true)}
          style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(0,0,0,0.7)', border: '1px solid var(--text-dim)', color: 'var(--text-dim)',
            padding: '2px 6px', fontFamily: 'monospace', fontSize: 9, cursor: 'pointer',
          }}
        >◉ debug</button>
      )}
    </div>
  );
}
