import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function Button({ text = 'Button1', bgColor = '', textColor = '', borderColor = '', width = 80, disabled = false, onClick }) {
  return (
    <button
      className="retro-button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: typeof width === 'string' && width.includes('%') ? width : (width ? `${width}px` : 'auto'),
        '--button-bg': bgColor || 'transparent',
        '--button-text': getThemeColor(textColor, '--text'),
        '--button-border': getThemeColor(borderColor, '--text'),
      }}
    >
      {text}
    </button>
  );
}

export default Button;
