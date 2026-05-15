import React from 'react';
import { useDrag } from 'react-dnd';

// Sectioned palette. `requires: 'gameMode'` items are filtered out of
// non-game projects. Items with `preview: true` are shown but not yet
// draggable — their actual implementation lands in a later phase.
const PALETTE = [
  { kind: 'section', label: 'UI' },
  { kind: 'item', type: 'Window', label: 'Window' },
  { kind: 'item', type: 'Frame', label: 'Frame' },
  { kind: 'item', type: 'Row', label: 'Row' },
  { kind: 'item', type: 'Button', label: 'Button' },
  { kind: 'item', type: 'Text', label: 'Text' },
  { kind: 'item', type: 'Input', label: 'Input' },
  { kind: 'item', type: 'CheckBox', label: 'CheckBox' },
  { kind: 'item', type: 'RadioButton', label: 'RadioButton' },
  { kind: 'item', type: 'ComboBox', label: 'ComboBox' },
  { kind: 'item', type: 'ListBox', label: 'ListBox' },
  { kind: 'item', type: 'HScrollBar', label: 'ScrollH' },
  { kind: 'item', type: 'VScrollBar', label: 'ScrollV' },
  { kind: 'item', type: 'Timer', label: 'Timer' },
  { kind: 'item', type: 'Shape', label: 'Shape' },
  { kind: 'item', type: 'Line', label: 'Line' },
  { kind: 'item', type: 'Image', label: 'Image' },
  { kind: 'item', type: 'Data', label: 'Data' },
  { kind: 'item', type: 'Table', label: 'Table' },
  { kind: 'item', type: 'DataRepeater', label: 'Repeater' },
  { kind: 'item', type: 'Form', label: 'Form' },
  { kind: 'item', type: 'Loader', label: 'Loader' },
  { kind: 'item', type: 'Tabs', label: 'Tabs' },
  { kind: 'item', type: 'Overlay', label: 'Overlay' },

  { kind: 'section', label: 'EMBED' },
  { kind: 'item', type: 'GameEmbed', label: 'GameEmbed' },

  { kind: 'section', label: 'GAME', requires: 'gameMode' },
  { kind: 'item', type: 'GameEntity', label: 'GameEntity', requires: 'gameMode', dragType: 'GAME_COMPONENT' },
  // TileMap is configured per-Level in the Inspector — not a draggable component.
  { kind: 'item', type: 'CollisionShape', label: 'Collision', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'Trigger', label: 'Trigger', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'Teleporter', label: 'Teleporter', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'SpawnPoint', label: 'SpawnPoint', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'Camera', label: 'Camera', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'ParticleEmitter', label: 'Particles', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'SoundEmitter', label: 'Sound', requires: 'gameMode', preview: true },
  { kind: 'item', type: 'GameView', label: 'GameView', requires: 'gameMode', preview: true },
];

function ToolboxItem({ type, label, preview, dragType }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: dragType || 'COMPONENT',
    item: { type },
    canDrag: () => !preview,
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() })
  }), [preview, dragType]);

  return (
    <div
      ref={preview ? null : drag}
      className="toolbox-item"
      style={{
        opacity: isDragging ? 0.4 : (preview ? 0.45 : 1),
        cursor: preview ? 'not-allowed' : 'grab',
      }}
      title={preview ? 'Available in a later phase' : 'Drag to canvas'}
    >
      {label}{preview ? ' (soon)' : ''}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div
      style={{
        marginTop: 10,
        marginBottom: 4,
        fontSize: 9,
        color: 'var(--accent)',
        opacity: 0.7,
        letterSpacing: 1,
        textTransform: 'uppercase',
        borderBottom: '1px dashed var(--border)',
        paddingBottom: 2,
      }}
    >
      {label}
    </div>
  );
}

function Toolbox({ gameMode = false }) {
  const visible = PALETTE.filter(p => !p.requires || (p.requires === 'gameMode' && gameMode));
  return (
    <div className="toolbox">
      <h3>[TOOLBOX]</h3>
      {visible.map((p, i) =>
        p.kind === 'section'
          ? <SectionHeader key={`s-${i}`} label={p.label} />
          : <ToolboxItem key={p.type} type={p.type} label={p.label} preview={p.preview} dragType={p.dragType} />
      )}
      <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        drag to canvas
      </div>
    </div>
  );
}

export default Toolbox;
