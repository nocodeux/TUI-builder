import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function Image({ src = '', width = 80, height = 80, alt = 'Image', iconSrc = '', iconColor = '' }) {
  // If we have a URL, render the image
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        style={{ 
          width: typeof width === 'string' && width.includes('%') ? width : `${width}px`, 
          height: typeof height === 'string' && height.includes('%') ? height : `${height}px`, 
          border: '1px solid var(--border)' 
        }}
      />
    );
  }

  // If we have a selected icon, render it inline
  if (iconSrc) {
    return (
      <div style={{
        width: typeof width === 'string' && width.includes('%') ? width : `${width}px`,
        height: typeof height === 'string' && height.includes('%') ? height : `${height}px`,
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: getThemeColor(iconColor, '--text'),
        padding: 4,
      }}>
        <div
          dangerouslySetInnerHTML={{ __html: iconSrc }}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: getThemeColor(iconColor, '--text'),
          }}
          className="image-icon-render"
        />
      </div>
    );
  }

  // Empty placeholder
  return (
    <div style={{
      width: typeof width === 'string' && width.includes('%') ? width : `${width}px`,
      height: typeof height === 'string' && height.includes('%') ? height : `${height}px`,
      border: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)'
    }}>
      <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>[IMG {width}x{height}]</span>
    </div>
  );
}

export default Image;
