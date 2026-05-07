import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function ComboBox({ items = ['Option 1', 'Option 2', 'Option 3'], width = 150, selectedIndex = 0, textColor = '', borderColor = '', bgColor = '' }) {
  return (
    <select 
      className="retro-select" 
      value={items[selectedIndex]}
      onChange={() => {}} 
      style={{ 
        width: typeof width === 'string' && width.includes('%') ? width : `${width}px`, 
        borderColor: getThemeColor(borderColor, '--border'), 
        color: getThemeColor(textColor, '--text'), 
        background: getThemeColor(bgColor, '--input-bg') 
      }}
    >
      {items.map((item, idx) => (
        <option key={idx} value={item}>{item}</option>
      ))}
    </select>
  );
}

export default ComboBox;
