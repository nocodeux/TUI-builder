import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function ListBox({ items = ['Item 1', 'Item 2', 'Item 3'], width = 150, height = 100, multiSelect = false, textColor = '', borderColor = '', bgColor = '' }) {
  return (
    <select className="retro-listbox" multiple={multiSelect} size="4" style={{ 
      width: typeof width === 'string' && width.includes('%') ? width : `${width}px`, 
      height: typeof height === 'string' && height.includes('%') ? height : `${height}px`, 
      borderColor: getThemeColor(borderColor, '--border'), 
      color: getThemeColor(textColor, '--text'), 
      background: getThemeColor(bgColor, '--input-bg') 
    }}>
      {items.map((item, idx) => (
        <option key={idx}>{item}</option>
      ))}
    </select>
  );
}

export default ListBox;
