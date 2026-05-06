import React from 'react';

function CheckBox({ text = 'CheckBox1', checked = false, textColor = '#00ff00' }) {
  return (
    <label className="retro-checkbox" style={{ color: textColor }}>
      <input type="checkbox" checked={checked} readOnly />
      <span>{text}</span>
    </label>
  );
}

export default CheckBox;
