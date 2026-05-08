import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function TextBox({ 
  label = '',
  placeholder = 'Enter text...', 
  width = 150, 
  maxLength = 0, 
  readOnly = false, 
  disabled = false, 
  textColor = '', 
  borderColor = '', 
  bgColor = '', 
  inputType = 'text' 
}) {
  return (
    <div className="property-group" style={{ width: typeof width === 'string' && width.includes('%') ? width : `${width}px` }}>
      {label && <label>{label}</label>}
      <input
        type={inputType}
        className="retro-textbox"
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        maxLength={maxLength > 0 ? maxLength : undefined}
        style={{
          width: '100%',
          borderColor: getThemeColor(borderColor, '--text'),
          color: getThemeColor(textColor, '--text'),
          background: getThemeColor(bgColor, '--input-bg')
        }}
      />
    </div>
  );
}

export default TextBox;
