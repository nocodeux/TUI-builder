import React from 'react';

function Image({ src = '', width = 80, height = 80, alt = 'Image' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        style={{ width: `${width}px`, height: `${height}px`, border: '1px solid var(--border)' }}
      />
    );
  }

  return (
    <div style={{
      width: `${width}px`,
      height: `${height}px`,
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
