import React from 'react';

function ComboBox({ items = ['Option 1', 'Option 2', 'Option 3'], width = 150, selectedIndex = 0, textColor = '#00ff00', borderColor = '#00ff00', bgColor = '#000000' }) {
  return (
    <select className="retro-select" style={{ width: `${width}px`, borderColor, color: textColor, background: bgColor }}>
      {items.map((item, idx) => (
        <option key={idx} selected={idx === selectedIndex}>{item}</option>
      ))}
    </select>
  );
}

export default ComboBox;
