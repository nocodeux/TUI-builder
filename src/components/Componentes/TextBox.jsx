import React from 'react';

function TextBox({ placeholder = 'Enter text...', width = 150, maxLength = 0, readOnly = false, disabled = false, textColor = '#00ff00', borderColor = '#00ff00', bgColor = '#000000', inputType = 'text' }) {
  return (
    <input
      type={inputType}
      className="retro-textbox"
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      maxLength={maxLength > 0 ? maxLength : undefined}
      style={{
        width: width ? `${width}px` : '100%',
        borderColor,
        color: textColor,
        background: bgColor
      }}
    />
  );
}

export default TextBox;
