// Lightweight game runtime for GameEmbed (WYSIWYG builder + published embeds).
// No debug HUD, no key-hint bar — just the canvas.
//
// Scaling approach: set CSS width/height on the canvas (not CSS transform).
// A flex-center wrapper centres the canvas inside the container so any
// letterbox bars are symmetric, not pinned to one corner.

import React, { useEffect, useRef, useState } from 'react';
import { GameRuntime } from '../../runtime/gameRuntime';
import GameHUD from '../../runtime/GameHUD';

// ── Mobile touch controls ──────────────────────────────────────────────────────
const BTN = {
  width: 46, height: 46,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 4,
  fontSize: 16, color: 'rgba(255,255,255,0.75)',
  fontFamily: 'monospace',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  touchAction: 'none',
  boxSizing: 'border-box',
  flexShrink: 0,
};
const BTN_SM = { ...BTN, fontSize: 9, letterSpacing: 0.5 };

function MobileControls({ rtRef }) {
  const mk = (label, action, small = false) => {
    const stop = (e, active) => {
      e.preventDefault();
      e.stopPropagation();
      rtRef.current?.setInput(action, active);
    };
    return (
      <div
        style={small ? BTN_SM : BTN}
        onTouchStart={e => stop(e, true)}
        onTouchEnd={e => stop(e, false)}
        onTouchCancel={e => stop(e, false)}
      >
        {label}
      </div>
    );
  };

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      padding: '6px 10px 8px',
      background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.55))',
      pointerEvents: 'none',
      zIndex: 20,
    }}>
      {/* D-pad */}
      <div style={{
        pointerEvents: 'auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 46px)',
        gridTemplateRows: 'repeat(2, 46px)',
        gap: 4,
      }}>
        <span /> {mk('↑', 'up')} <span />
        {mk('←', 'left')} {mk('↓', 'down')} {mk('→', 'right')}
      </div>
      {/* Action buttons */}
      <div style={{
        pointerEvents: 'auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 46px)',
        gridTemplateRows: 'repeat(2, 46px)',
        gap: 4,
      }}>
        {mk('⇧', 'dash')} {mk('SPC', 'jump', true)}
        {mk('E', 'interact')} {mk('Z', 'attack')}
      </div>
    </div>
  );
}

const KEY_MAP = {
  ArrowLeft: 'left',  a: 'left',  A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up',    w: 'up',    W: 'up',
  ArrowDown: 'down', s: 'down',  S: 'down',
  ' ': 'jump',
  z: 'attack', Z: 'attack',
  e: 'interact', E: 'interact',
  Shift: 'dash',
};

// scaling: 'fit' | 'fill' | 'fixed'
// maintainAspect: boolean (ignored when scaling='fixed')
// onNavigateExternal: optional — called when navigation targets a different world/screen
// nativeW/nativeH: explicit pixel dims passed by GameEmbed (world-canonical); per-level dims used as fallback
export default function EmbedRuntime({ world, assets, scaling = 'fit', maintainAspect = true, onNavigateExternal, nativeW: propNativeW, nativeH: propNativeH, isFullscreen = false }) {
  const levels = world?.levels || [];

  const [currentLevelId, setCurrentLevelId] = useState(() => levels[0]?.id || null);
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Reset to first level whenever the world changes.
  const worldIdRef = useRef(world?.id);
  useEffect(() => {
    if (world?.id !== worldIdRef.current) {
      worldIdRef.current = world?.id;
      setCurrentLevelId(levels[0]?.id || null);
    }
  }, [world?.id, levels]);

  const level     = levels.find(l => l.id === currentLevelId) || levels[0] || null;
  const levelType = level?.levelType || 'game';
  const showGame  = levelType === 'game' || levelType === 'game+hud';
  const showHUD   = levelType === 'hud-only' || levelType === 'game+hud';

  // Per-level native pixel dimensions — always use the current level's viewport/tile config.
  // propNativeW/propNativeH (world-canonical) are only a last-resort fallback (level is null).
  const nativeW = level ? (level.viewportCols || 20) * (level.tileMap?.tileWidth  || 32) : (propNativeW || 640);
  const nativeH = level ? (level.viewportRows || 14) * (level.tileMap?.tileHeight || 32) : (propNativeH || 360);

  const wrapRef   = useRef(null);
  const canvasRef = useRef(null);
  const rtRef     = useRef(null);

  const handleNavigateLevel = (id) => {
    if (levels.some(l => l.id === id)) setCurrentLevelId(id);
  };
  const handleNavigateScreen = (id) => {
    if (levels.some(l => l.id === id)) {
      setCurrentLevelId(id);
    } else if (id === world?.id) {
      // "go to world" from HUD → jump to first playable level (skip hud-only)
      const gameLevel = levels.find(l => l.levelType === 'game' || l.levelType === 'game+hud' || !l.levelType);
      setCurrentLevelId((gameLevel || levels[0])?.id || null);
    } else {
      // Target is in a different world — delegate to parent
      onNavigateExternal?.(id);
    }
  };

  // ── GameRuntime lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!showGame || !level) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = nativeW;
    canvas.height = nativeH;

    const rt = new GameRuntime({ level, assets, canvas });
    rtRef.current = rt;
    let cancelled = false;
    rt.preloadPromise.then(() => {
      if (!cancelled) {
        rt.start();
        canvas.focus({ preventScroll: true });
      }
    });

    const onDown = (e) => { const a = KEY_MAP[e.key]; if (!a) return; e.preventDefault(); rt.setInput(a, true); };
    const onUp   = (e) => { const a = KEY_MAP[e.key]; if (!a) return; rt.setInput(a, false); };
    canvas.addEventListener('keydown', onDown, { capture: true });
    canvas.addEventListener('keyup',   onUp,   { capture: true });

    return () => {
      cancelled = true;
      rt.stop();
      rtRef.current = null;
      canvas.removeEventListener('keydown', onDown, { capture: true });
      canvas.removeEventListener('keyup',   onUp,   { capture: true });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, assets, nativeW, nativeH, showGame]);

  // ── Scaling: set CSS display dimensions (no transform) ────────────────────
  // The canvas pixel buffer is always nativeW×nativeH.
  // We set the CSS width/height to the scaled display size so the browser
  // stretches the buffer to the right visual size without any transform offset.
  // A flex-center wrapper then centres the scaled canvas inside the container,
  // giving symmetric letterbox bars when aspect ratios differ.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const applyScale = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Normal mode: height is auto-driven by placeholder div → use nativeH.
      // Fullscreen mode: container has definite flex height → read clientHeight.
      const cw = wrap.clientWidth  || nativeW;
      const ch = isFullscreen ? (wrap.clientHeight || nativeH) : nativeH;

      if (scaling === 'fixed') {
        canvas.style.width  = `${nativeW}px`;
        canvas.style.height = `${nativeH}px`;
        return;
      }

      let displayW, displayH;
      if (!maintainAspect) {
        displayW = cw;
        displayH = ch;
      } else if (scaling === 'fill') {
        const s = Math.max(cw / nativeW, ch / nativeH);
        displayW = Math.round(nativeW * s);
        displayH = Math.round(nativeH * s);
      } else {
        // Fit (default): scale down so both dimensions <= container (letterbox)
        const s = Math.min(cw / nativeW, ch / nativeH);
        displayW = Math.round(nativeW * s);
        displayH = Math.round(nativeH * s);
      }

      canvas.style.width  = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
    };

    applyScale();
    const obs = new ResizeObserver(applyScale);
    obs.observe(wrap);
    return () => obs.disconnect();
  }, [scaling, maintainAspect, nativeW, nativeH, isFullscreen]);

  if (!level) return null;

  const isHudOnly = !showGame && showHUD;

  // Normal: auto-height wrapper, placeholder div establishes nativeH in normal flow.
  // Fullscreen: height:100% wrapper (flex child), no placeholder — container height is definite.
  const wrapStyle = isFullscreen
    ? { position: 'relative', width: '100%', height: '100%', cursor: 'default' }
    : { position: 'relative', width: '100%', cursor: 'default' };

  return (
    <div
      ref={wrapRef}
      style={wrapStyle}
      onClick={() => canvasRef.current?.focus({ preventScroll: true })}
    >
      {showGame && (
        <>
          {/* Normal-flow placeholder: pushes auto-height container to nativeH.
              Skipped in fullscreen — the container already has a definite flex height. */}
          {!isFullscreen && (
            <div style={{ width: nativeW, height: nativeH, visibility: 'hidden', pointerEvents: 'none' }} />
          )}
          {/* Canvas centred via absolute overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              tabIndex={0}
              style={{ display: 'block', imageRendering: 'pixelated', outline: 'none', flexShrink: 0 }}
            />
          </div>
          {/* Touch controls — shown only on touch devices, sit in the bottom letterbox area */}
          {isTouch && <MobileControls rtRef={rtRef} />}
        </>
      )}

      {/* HUD:
          - hud-only normal:     block mode, normal flow, drives auto height
          - hud-only fullscreen: overlay mode, position:absolute fills container
          - game+hud:            always overlay mode over canvas */}
      {showHUD && (
        <GameHUD
          rows={level?.rows || []}
          onNavigateLevel={handleNavigateLevel}
          onNavigateScreen={handleNavigateScreen}
          overlay={!isHudOnly || isFullscreen}
          fillContainer={isFullscreen && isHudOnly}
        />
      )}
    </div>
  );
}
