import React from 'react';

function RadioButton({ text = 'Option1', checked = false, group = 'group1', textColor = '#00ff00' }) {
  return (
    <label className="retro-radio" style={{ color: textColor }}>
      <input type="radio" name={group} checked={checked} readOnly />
      <span>{text}</span>
    </label>
  );
}

export default RadioButton;
