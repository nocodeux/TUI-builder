import React from 'react';

function Button({ text = 'Button1', bgColor = 'transparent', textColor = '#00ff00', borderColor = '#00ff00', width = 80, disabled = false }) {
  return (
    <button
      className="retro-button"
      disabled={disabled}
      style={{
        width: width ? `${width}px` : 'auto',
        '--button-bg': bgColor,
        '--button-text': textColor,
        '--button-border': borderColor,
      }}
    >
      {text}
    </button>
  );
}

export default Button;
