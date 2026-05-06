import React from 'react';

function Button({ text = 'Button1', bgColor = 'transparent', textColor = '#00ff00', borderColor = '#00ff00', width = 80 }) {
  return (
    <button className="retro-button" style={{ width: `${width}px`, background: bgColor, borderColor, color: textColor }}>
      {text}
    </button>
  );
}

export default Button;
