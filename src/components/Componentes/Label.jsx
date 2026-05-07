import React from 'react';

function Label({ text = 'Label1', textColor = '#00ff00', fontSize = 12, alignment = 'left', linkUrl = '' }) {
  const justifyContent = alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start';
  const content = linkUrl ? (
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: textColor, textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>
      {text}
    </a>
  ) : (
    <span style={{ color: textColor }}>{text}</span>
  );

  return (
    <label className="retro-label" style={{ fontSize: `${fontSize}px`, textAlign: alignment, justifyContent }}>
      {content}
    </label>
  );
}

export default Label;
