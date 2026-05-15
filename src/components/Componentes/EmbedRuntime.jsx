// Lightweight game runtime for GameEmbed (WYSIWYG builder + published embeds).
// No debug HUD, no key-hint bar — just the canvas.
//
// Scaling approach: set CSS width/height on the canvas (not CSS transform).
// A flex-center wrapper centres the canvas inside the container so any
// letterbox bars are symmetric, not pinned to one corner.

import React, { useEffect, useRef, useState } from 'react';
import { GameRuntime } from '../../runtime/gameRuntime';
import GameHUD from '../../runtime/GameHUD';

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
export default function EmbedRuntime({ world, assets, scaling = 'fit', maintainAspect = true, onNavigateExternal }) {
  const levels = world?.levels || [];

  const [currentLevelId, setCurrentLevelId] = useState(() => levels[0]?.id || null);

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

  // Native pixel dimensions of the current level's canvas
  const nativeW = (level?.viewportCols || 20) * (level?.tileMap?.tileWidth  || 32);
  const nativeH = (level?.viewportRows || 14) * (level?.tileMap?.tileHeight || 32);

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

      const cw = wrap.clientWidth  || nativeW;
      const ch = wrap.clientHeight || nativeH;

      if (scaling === 'fixed') {
        canvas.style.width  = `${nativeW}px`;
        canvas.style.height = `${nativeH}px`;
        return;
      }

      let displayW, displayH;
      if (!maintainAspect) {
        // Stretch: distort to fill container exactly
        displayW = cw;
        displayH = ch;
      } else if (scaling === 'fill') {
        // Cover: scale up so both dimensions >= container (may crop)
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
  }, [scaling, maintainAspect, nativeW, nativeH]);

  if (!level) return null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#000',
        cursor: 'default',
      }}
      onClick={() => canvasRef.current?.focus({ preventScroll: true })}
    >
      {/* Flex-center layer: keeps the canvas centred so letterbox bars are symmetric */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {showGame && (
          <canvas
            ref={canvasRef}
            tabIndex={0}
            style={{
              display: 'block',
              imageRendering: 'pixelated',
              outline: 'none',
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {/* HUD overlay — rendered at position:absolute so it covers the game area */}
      {showHUD && (
        <GameHUD
          rows={level?.rows || []}
          onNavigateLevel={handleNavigateLevel}
          onNavigateScreen={handleNavigateScreen}
        />
      )}
    </div>
  );
}
