import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function Image({ 
  src = '', 
  width = 80, 
  height = 80, 
  alt = 'Image', 
  iconSrc = '', 
  iconColor = '', 
  borderThickness = 1, 
  borderColor = '',
  sizing = {}
}) {
  const isSvg = src.toLowerCase().endsWith('.svg') || src.startsWith('data:image/svg+xml');
  const bThick = borderThickness !== undefined ? borderThickness : 1;
  const bColor = getThemeColor(borderColor, '--border');
  
  const containerStyle = {
    width: sizing.widthMode === 'fill' ? '100%' : `${width}px`,
    height: sizing.heightMode === 'fill' ? '100%' : `${height}px`,
    border: bThick > 0 ? `${bThick}px solid ${bColor}` : 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent'
  };

  const finalIconColor = getThemeColor(iconColor, '--accent');

  // Si hay iconSrc (de la librería interna), lo priorizamos
  if (iconSrc) {
    return (
      <div style={containerStyle} className="image-icon-render">
        <div 
          style={{ width: '100%', height: '100%', color: finalIconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10%' }}
          dangerouslySetInnerHTML={{ __html: iconSrc }}
        />
      </div>
    );
  }

  // Si es un SVG por URL/DataURI y tenemos color, usamos MASK para poder teñirlo
  if (isSvg && iconColor) {
    return (
      <div style={containerStyle}>
        <div style={{
          width: '100%',
          height: '100%',
          backgroundColor: finalIconColor,
          maskImage: `url("${src}")`,
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskImage: `url("${src}")`,
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          WebkitMaskSize: 'contain',
        }} />
      </div>
    );
  }

  // Comportamiento normal para imágenes
  return (
    <div style={containerStyle}>
      {src ? (
        <img 
          src={src} 
          alt={alt} 
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'contain' 
          }} 
        />
      ) : (
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', padding: '4px' }}>
          [IMG {width}x{height}]
        </div>
      )}
    </div>
  );
}

export default Image;
