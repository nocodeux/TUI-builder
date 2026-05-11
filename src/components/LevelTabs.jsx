// LevelTabs — horizontal tab strip rendered above the Canvas when the
// active screen is a World (kind === 'world'). Visually mirrors the
// retro-tab pattern from Componentes/Tabs.jsx so the active tab fuses
// with the canvas underneath (no bottom border on the active tab).

import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';

const DRAG_TYPE = 'LEVEL_TAB';

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
      title={`${level.name} · double-click to duplicate`}
    >
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
}) {
  if (!world || world.kind !== 'world') return null;
  const levels = world.levels || [];
  const currentLevelId = world.currentLevelId;

  return (
    <div
      className="level-tabs retro-tabs-header"
      style={{
        display: 'flex',
        padding: '4px 8px 0 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel-bg)',
        flexWrap: 'nowrap',
        // No overflow / no align-items: an overflow context would clip the
        // active tab's negative margin and prevent the "fused with canvas" look.
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
    </div>
  );
}
