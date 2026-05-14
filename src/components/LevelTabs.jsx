// LevelTabs — horizontal tab strip rendered above the Canvas when the
// active screen is a World (kind === 'world'). Visually mirrors the
// retro-tab pattern from Componentes/Tabs.jsx so the active tab fuses
// with the canvas underneath (no bottom border on the active tab).

import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';

const DRAG_TYPE = 'LEVEL_TAB';

const LEVEL_TYPE_LABELS = {
  'hud-only':  'HUD',
  'game':      'GAME',
  'game+hud':  'GAME+HUD',
};
const LEVEL_TYPE_COLORS = {
  'hud-only':  '#66aaff',
  'game':      '#88ff88',
  'game+hud':  '#ffaa44',
};
const LEVEL_TYPE_CYCLE = ['hud-only', 'game', 'game+hud'];

function LevelTab({ level, index, isActive, onSelect, onDelete, onMove, onDuplicate }) {
  const ref = useRef(null);

  const [{ isDragging }, drag] = useDrag({
    type: DRAG_TYPE,
    item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: DRAG_TYPE,
    hover(item) {
      if (!ref.current) return;
      if (item.index === index) return;
      onMove(item.index, index);
      item.index = index;
    },
  });

  drag(drop(ref));

  const lt = level.levelType || 'hud-only';
  const typeColor = LEVEL_TYPE_COLORS[lt] || 'var(--text-dim)';

  return (
    <div
      ref={ref}
      className={`retro-tab ${isActive ? 'active' : ''}`}
      style={{
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: 11,
        fontFamily: 'monospace',
        border: '1px solid var(--border)',
        borderBottom: isActive ? '1px solid var(--bg)' : '1px solid var(--border)',
        background: isActive ? 'var(--bg)' : 'rgba(0,0,0,0.2)',
        color: isActive ? 'var(--accent)' : 'var(--text-dim)',
        marginBottom: -1,
        marginRight: 2,
        fontWeight: isActive ? 'bold' : 'normal',
        whiteSpace: 'nowrap',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      onClick={() => onSelect(level.id)}
      onDoubleClick={() => onDuplicate(level.id)}
      title={`${level.name} · ${LEVEL_TYPE_LABELS[lt] || lt} · double-click to duplicate`}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: typeColor, flexShrink: 0 }} />
      <span>{level.name}</span>
      <span
        onClick={e => { e.stopPropagation(); onDelete(level.id); }}
        title="Delete level"
        style={{ opacity: 0.6, fontSize: 10 }}
      >×</span>
    </div>
  );
}

export default function LevelTabs({
  world,
  onSelectLevel,
  onAddLevel,
  onMoveLevel,
  onDeleteLevel,
  onDuplicateLevel,
  onUpdateLevelType,
  layer = 'game',
  onLayerChange,
  canPlay = false,
  isPlaying = false,
  onTogglePlay,
}) {
  if (!world || world.kind !== 'world') return null;
  const levels = world.levels || [];
  const currentLevelId = world.currentLevelId;
  const activeLevel = levels.find(l => l.id === currentLevelId) || null;
  const showLayerToggle = !!currentLevelId && !!onLayerChange;
  const showTypeSelector = !!activeLevel && !!onUpdateLevelType && !isPlaying;
  const currentLevelType = activeLevel?.levelType || 'hud-only';

  const cycleType = () => {
    const idx = LEVEL_TYPE_CYCLE.indexOf(currentLevelType);
    const next = LEVEL_TYPE_CYCLE[(idx + 1) % LEVEL_TYPE_CYCLE.length];
    onUpdateLevelType(currentLevelId, next);
  };

  return (
    <div
      className="level-tabs retro-tabs-header"
      style={{
        display: 'flex',
        padding: '4px 8px 0 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel-bg)',
        flexWrap: 'nowrap',
        alignItems: 'flex-end',
      }}
    >
      {levels.map((lvl, idx) => (
        <LevelTab
          key={lvl.id}
          level={lvl}
          index={idx}
          isActive={lvl.id === currentLevelId}
          onSelect={() => onSelectLevel(world.id, lvl.id)}
          onDelete={() => onDeleteLevel(world.id, lvl.id)}
          onMove={(from, to) => onMoveLevel(world.id, from, to)}
          onDuplicate={() => onDuplicateLevel(world.id, lvl.id)}
        />
      ))}
      <button
        type="button"
        onClick={() => onAddLevel(world.id)}
        title="Add Level"
        style={{
          padding: '6px 10px',
          border: '1px dashed var(--border)',
          background: 'transparent',
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'monospace',
          marginBottom: -1,
        }}
      >+ Add Level</button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 6 }}>
        {/* Level type badge/cycler */}
        {showTypeSelector && (
          <button
            type="button"
            onClick={cycleType}
            title={`Level type: ${currentLevelType} — click to cycle`}
            style={{
              padding: '2px 8px', fontSize: 9, fontFamily: 'monospace',
              background: 'transparent',
              color: LEVEL_TYPE_COLORS[currentLevelType] || 'var(--text-dim)',
              border: `1px solid ${LEVEL_TYPE_COLORS[currentLevelType] || 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >{LEVEL_TYPE_LABELS[currentLevelType] || currentLevelType}</button>
        )}

        {/* GAME / HUD layer toggle */}
        {showLayerToggle && !isPlaying && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', marginRight: 4 }}>LAYER</span>
            {['game', 'hud'].map(k => (
              <button
                key={k}
                type="button"
                onClick={() => onLayerChange(k)}
                title={k === 'game' ? 'Game world (entities)' : 'HUD overlay (UI components)'}
                style={{
                  padding: '2px 8px', fontSize: 10, fontFamily: 'monospace',
                  background: layer === k ? 'var(--accent)' : 'transparent',
                  color: layer === k ? 'var(--bg)' : 'var(--text-dim)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontWeight: layer === k ? 'bold' : 'normal',
                }}
              >{k.toUpperCase()}</button>
            ))}
          </div>
        )}

        {/* Play / Stop */}
        {canPlay && onTogglePlay && (
          <button
            type="button"
            onClick={(e) => { e.currentTarget.blur(); onTogglePlay(); }}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); }}
            title={isPlaying ? 'Stop (◼)' : 'Play from first level (▶)'}
            style={{
              padding: '4px 10px', fontSize: 11, fontFamily: 'monospace',
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: '1px solid var(--accent)',
              cursor: 'pointer', fontWeight: 'bold',
            }}
          >{isPlaying ? '◼ STOP' : '▶ PLAY'}</button>
        )}
      </div>
    </div>
  );
}
