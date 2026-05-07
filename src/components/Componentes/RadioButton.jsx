import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function RadioButton({ text = 'Option1', checked = false, group = 'group1', textColor = '' }) {
  return (
    <label className="retro-radio" style={{ color: getThemeColor(textColor, '--text') }}>
      <input type="radio" name={group} checked={checked} readOnly />
      <span>{text}</span>
    </label>
  );
}

export default RadioButton;
