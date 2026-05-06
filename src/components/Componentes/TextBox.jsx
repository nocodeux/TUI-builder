import React from 'react';

function TextBox({ placeholder = 'Enter text...', width = 150, maxLength = 0, readOnly = false, textColor = '#00ff00', borderColor = '#00ff00', bgColor = '#000000', inputType = 'text' }) {
  return (
    <input
      type={inputType}
      className="retro-textbox"
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength > 0 ? maxLength : undefined}
      style={{ width: `${width}px`, borderColor, color: textColor, background: bgColor }}
    />
  );
}

export default TextBox;
