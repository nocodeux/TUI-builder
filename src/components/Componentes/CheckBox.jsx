import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function CheckBox({ text = 'CheckBox1', checked = false, textColor = '' }) {
  return (
    <label className="retro-checkbox" style={{ color: getThemeColor(textColor, '--text') }}>
      <input type="checkbox" checked={checked} readOnly />
      <span>{text}</span>
    </label>
  );
}

export default CheckBox;
