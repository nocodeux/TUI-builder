import React from 'react';
import { useDrag } from 'react-dnd';

const componentes = [
  { type: 'Window', label: 'Window' },
  { type: 'Frame', label: 'Frame' },
  { type: 'Button', label: 'Button' },
  { type: 'Label', label: 'Label' },
  { type: 'TextBox', label: 'TextBox' },
  { type: 'CheckBox', label: 'CheckBox' },
  { type: 'RadioButton', label: 'RadioButton' },
  { type: 'ComboBox', label: 'ComboBox' },
  { type: 'ListBox', label: 'ListBox' },
  { type: 'PictureBox', label: 'PictureBox' },
  { type: 'HScrollBar', label: 'ScrollH' },
  { type: 'VScrollBar', label: 'ScrollV' },
  { type: 'Timer', label: 'Timer' },
  { type: 'Shape', label: 'Shape' },
  { type: 'Line', label: 'Line' },
  { type: 'Image', label: 'Image' },
  { type: 'Data', label: 'Data' }
];

function ToolboxItem({ type, label }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'COMPONENT',
    item: { type },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() })
  }));

  return (
    <div
      ref={drag}
      className="toolbox-item"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      {label}
    </div>
  );
}

function Toolbox() {
  return (
    <div className="toolbox">
      <h3>[TOOLBOX]</h3>
      {componentes.map(comp => (
        <ToolboxItem key={comp.type} {...comp} />
      ))}
      <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        drag to canvas
      </div>
    </div>
  );
}

export default Toolbox;
