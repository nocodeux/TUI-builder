import React, { useContext, useRef } from 'react';
import { DataContext } from './DataRepeater';
import { FormContext } from './Form';

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
  sizing = {},
  dataSourceType = 'manual',
  dataField = '',
  requireLogin = false
}) {
  const data = useContext(DataContext);
  const formContext = useContext(FormContext);
  const fileInputRef = useRef(null);
  const isAuthenticated = false; // Simulated auth state

  let resolvedSrc = src;
  if (dataSourceType === 'database') {
    if (requireLogin && !isAuthenticated) {
      resolvedSrc = '';
    } else if (formContext && formContext.formData && dataField) {
      resolvedSrc = formContext.formData[dataField] || src;
    } else if (data && dataField) {
      resolvedSrc = String(data[dataField] ?? '');
    }
  }

  const handleImageClick = () => {
    if (formContext && dataField && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && formContext && dataField) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        formContext.updateField(dataField, ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const isWidthFill = sizing.widthMode === 'fill';
  const isHeightFill = sizing.heightMode === 'fill';
  const isWidthHug = sizing.widthMode === 'hug';
  const isHeightHug = sizing.heightMode === 'hug';

  if (dataSourceType === 'database' && requireLogin && !isAuthenticated) {
    return (
      <div style={{
        width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : `${width}px`),
        height: isHeightFill ? '100%' : (isHeightHug ? 'auto' : `${height}px`),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,0,0,0.1)', border: '1px dashed #ff4444',
        color: '#ff4444', fontSize: 10, textAlign: 'center', padding: 8
      }}>
        [ Private Content Needs Login ]
      </div>
    );
  }

  const isSvg = resolvedSrc && (resolvedSrc.toLowerCase().endsWith('.svg') || resolvedSrc.startsWith('data:image/svg+xml'));
  const bThick = borderThickness !== undefined ? borderThickness : 1;
  const bColor = getThemeColor(borderColor, '--border');

  const containerStyle = {
    width: sizing.widthMode === 'fill' ? '100%' : (isWidthHug ? 'auto' : `${width}px`),
    height: sizing.heightMode === 'fill' ? '100%' : (isHeightHug ? 'auto' : `${height}px`),
    border: bThick > 0 ? `${bThick}px solid ${bColor}` : 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent',
    cursor: (formContext && dataField) ? 'pointer' : 'default'
  };

  const imgStyle = {
    width: isWidthHug ? 'auto' : '100%',
    height: isHeightHug ? 'auto' : '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain'
  };

  const finalIconColor = getThemeColor(iconColor, '--accent');

  // Si hay iconSrc (de la librería interna), lo priorizamos
  if (iconSrc) {
    // Better way: convert SVG to DataURI and use mask-image
    // This ensures only the opaque parts of the SVG are colored
    const svgData = iconSrc
      .replace(/"/g, "'")
      .replace(/#/g, '%23')
      .replace(/[\n\r]/g, '')
      .replace(/\s+/g, ' ');
    
    const dataUri = `data:image/svg+xml,${svgData}`;

    return (
      <div style={containerStyle}>
        <div style={{
          ...imgStyle,
          backgroundColor: finalIconColor,
          maskImage: `url("${dataUri}")`,
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: `url("${dataUri}")`,
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }} />
      </div>
    );
  }

  // Si es un SVG por URL/DataURI y tenemos color, usamos MASK para poder teñirlo
  if (isSvg && iconColor) {
    return (
      <div style={containerStyle}>
        <div style={{
          ...imgStyle,
          backgroundColor: finalIconColor,
          maskImage: `url("${resolvedSrc}")`,
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: `url("${resolvedSrc}")`,
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }} />
      </div>
    );
  }

  // Comportamiento normal para imágenes
  return (
    <div style={containerStyle} onClick={handleImageClick}>
      {resolvedSrc ? (
        <img 
          src={resolvedSrc} 
          alt={alt} 
          style={imgStyle} 
        />
      ) : (
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', padding: '4px' }}>
          {formContext && dataField ? '[CLICK TO UPLOAD]' : `[IMG ${width}x${height}]`}
        </div>
      )}
      {formContext && dataField && (
        <input 
          type="file" 
          ref={fileInputRef}
          style={{ display: 'none' }} 
          accept="image/*,.gif"
          onChange={handleFileChange}
        />
      )}
    </div>
  );
}

export default Image;
