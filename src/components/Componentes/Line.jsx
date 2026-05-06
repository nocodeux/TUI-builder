import React from 'react';

function Line({ color = '#00ff00', thickness = 1, fullWidth = true, widthPercent = 100 }) {
  return (
    <div style={{
      width: fullWidth ? `${widthPercent}%` : '100px',
      height: `${thickness}px`,
      background: color,
      margin: '4px 0'
    }} />
  );
}

export default Line;
