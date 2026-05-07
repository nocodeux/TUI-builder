import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function Line({ color = '', thickness = 1, fullWidth = true, widthPercent = 100 }) {
  return (
    <div style={{
      width: fullWidth ? `${widthPercent}%` : '100px',
      height: `${thickness}px`,
      background: getThemeColor(color, '--text'),
      margin: '4px 0'
    }} />
  );
}

export default Line;
