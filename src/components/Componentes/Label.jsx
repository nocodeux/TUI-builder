import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function Label({ text = 'Label1', textColor = '', fontSize = 12, alignment = 'left', linkUrl = '', width = 'auto' }) {
  const justifyContent = alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start';
  const content = linkUrl ? (
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: getThemeColor(textColor, '--text'), textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>
      {text}
    </a>
  ) : (
    <span style={{ color: getThemeColor(textColor, '--text') }}>{text}</span>
  );

  return (
    <label className="retro-label" style={{ 
      fontSize: `${fontSize}px`, 
      textAlign: alignment, 
      justifyContent,
      width: typeof width === 'string' && width.includes('%') ? width : (width === 'auto' ? 'auto' : `${width}px`)
    }}>
      {content}
    </label>
  );
}

export default Label;
