// GameEmbed — embeds a live game world inside a page screen.
// In the builder: renders the actual game via EmbedRuntime (WYSIWYG).
// In export: renderComponentExport outputs a container div the React player mounts into.
import React from 'react';
import { useGameContext } from '../../contexts/gameContext';
import EmbedRuntime from './EmbedRuntime';

const KEY_STYLE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 16, height: 16, padding: '0 3px',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 2, fontSize: 9, fontFamily: 'monospace',
  color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)',
  letterSpacing: 0,
};

function ControlsCard() {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      gap: '6px 10px', padding: '5px 8px',
      border: '1px solid rgba(255,255,255,0.1)',
      borderTop: 'none',
      background: 'rgba(0,0,0,0.7)',
      fontFamily: 'monospace', fontSize: 9,
      color: 'rgba(255,255,255,0.35)',
      userSelect: 'none',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <span style={KEY_STYLE}>←</span>
        <span style={KEY_STYLE}>↑</span>
        <span style={KEY_STYLE}>↓</span>
        <span style={KEY_STYLE}>→</span>
        <span style={{ marginLeft: 2, opacity: 0.5 }}>/ WASD</span>
      </span>
      <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={KEY_STYLE}>SPC</span>
        <span style={{ opacity: 0.5 }}>jump</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={KEY_STYLE}>Z</span>
        <span style={{ opacity: 0.5 }}>attack</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={KEY_STYLE}>E</span>
        <span style={{ opacity: 0.5 }}>interact</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={KEY_STYLE}>⇧</span>
        <span style={{ opacity: 0.5 }}>dash</span>
      </span>
    </div>
  );
}

function WindowFrame({ title, width, children, showControls, clip = true }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', width }}>
      <div className="retro-window" style={{ width, display: 'flex', flexDirection: 'column', overflow: clip ? 'hidden' : 'visible' }}>
        <div className="retro-window-titlebar">
          <span className="retro-window-title">{title}</span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'monospace', opacity: 0.6 }}>▦</span>
        </div>
        {children}
      </div>
      {showControls && <ControlsCard />}
    </div>
  );
}

export default function GameEmbed({
  worldId, worldName, scaling = 'fit', maintainAspect = true,
  showControls = true, showWindow = true, windowTitle = '', width, height,
}) {
  const { screens, assets } = useGameContext();

  const world  = worldId ? (screens || []).find(s => s.id === worldId && s.kind === 'world') : null;
  const levels = world?.levels || [];

  // Canonical game level drives native canvas dimensions.
  const canonicalLevel =
    levels.find(l => l.levelType === 'game' || l.levelType === 'game+hud') ||
    levels[0];

  const nativeW = canonicalLevel
    ? (canonicalLevel.viewportCols || 20) * (canonicalLevel.tileMap?.tileWidth  || 32)
    : 640;
  const nativeH = canonicalLevel
    ? (canonicalLevel.viewportRows || 14) * (canonicalLevel.tileMap?.tileHeight || 32)
    : 360;

  const resolvedW = (width === 'auto' || !width) ? nativeW : width;
  const resolvedH = (height === 'auto' || !height) ? nativeH : height;

  // gameAreaStyle never has a fixed height — EmbedRuntime drives it via:
  //   • a normal-flow placeholder div (for game levels) so height = nativeH
  //   • GameHUD block layout (for hud-only levels) so height = HUD content
  const gameAreaStyle = {
    width: resolvedW,
    position: 'relative',
    overflow: 'hidden',
    background: '#0a0a0a',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
    flexShrink: 0,
  };

  if (!worldId) {
    const pw = (width === 'auto' || !width) ? 640 : width;
    const ph = (height === 'auto' || !height) ? 360 : height;
    const placeholder = (
      <div style={{ width: pw, height: ph, border: '1px dashed var(--border)', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>▦ GAME EMBED</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Select a world in the inspector</div>
      </div>
    );
    if (showWindow) {
      return (
        <WindowFrame title={windowTitle || 'GAME EMBED'} width={pw} showControls={showControls}>
          {placeholder}
        </WindowFrame>
      );
    }
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
        {placeholder}
        {showControls && <ControlsCard />}
      </div>
    );
  }

  if (!world) {
    const errorContent = (
      <div style={{ width: resolvedW, height: resolvedH, border: '1px dashed var(--accent)', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>▦ GAME EMBED</div>
        <div style={{ fontSize: 13, color: 'var(--accent)' }}>{worldName || worldId}</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>World not found</div>
      </div>
    );
    if (showWindow) {
      return (
        <WindowFrame title={windowTitle || worldName || 'World not found'} width={resolvedW} showControls={showControls}>
          {errorContent}
        </WindowFrame>
      );
    }
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
        {errorContent}
        {showControls && <ControlsCard />}
      </div>
    );
  }

  const gameContent = (
    <div style={gameAreaStyle}>
      {!showWindow && (
        <div style={{
          position: 'absolute', top: 4, left: 6, zIndex: 10,
          fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: 1,
          pointerEvents: 'none', userSelect: 'none',
        }}>▦ {world.name || 'GAME EMBED'}</div>
      )}
      <EmbedRuntime
        world={world}
        assets={assets}
        scaling={scaling}
        maintainAspect={maintainAspect}
        nativeW={nativeW}
        nativeH={nativeH}
      />
    </div>
  );

  if (showWindow) {
    return (
      <WindowFrame title={windowTitle || world.name || 'GAME'} width={resolvedW} showControls={showControls}>
        {gameContent}
      </WindowFrame>
    );
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', width: resolvedW }}>
      {gameContent}
      {showControls && <ControlsCard />}
    </div>
  );
}
