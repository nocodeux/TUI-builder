import React from 'react';

function ListBox({ items = ['Item 1', 'Item 2', 'Item 3'], width = 150, height = 100, multiSelect = false, textColor = '#00ff00', borderColor = '#00ff00', bgColor = '#000000' }) {
  return (
    <select className="retro-listbox" multiple={multiSelect} size="4" style={{ width: `${width}px`, height: `${height}px`, borderColor, color: textColor, background: bgColor }}>
      {items.map((item, idx) => (
        <option key={idx}>{item}</option>
      ))}
    </select>
  );
}

export default ListBox;
