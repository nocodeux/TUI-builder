import React from 'react';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

/**
 * Text.jsx
 * Soporta etiquetas básicas: [b], [i], [u], [s], [sup], [sub]
 */
function Text({ text = 'Text1', textColor = '', fontSize = 12, alignment = 'left', linkUrl = '', width = 'auto', sizing = {} }) {
  
  // Función para convertir etiquetas personalizadas a HTML seguro (compatible con multilínea)
  const formatText = (txt) => {
    if (!txt) return '';
    let formatted = txt
      .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<strong>$1</strong>')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<em>$1</em>')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/g, '<u style="text-decoration: underline;">$1</u>')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/g, '<s style="text-decoration: line-through;">$1</s>')
      .replace(/\[sup\]([\s\S]*?)\[\/sup\]/g, '<sup>$1</sup>')
      .replace(/\[sub\]([\s\S]*?)\[\/sub\]/g, '<sub>$1</sub>');
    return formatted;
  };

  const style = {
    color: getThemeColor(textColor, '--text'),
    fontSize: `${fontSize}px`,
    textAlign: alignment,
    width: sizing.widthMode === 'fill' ? '100%' : (typeof width === 'string' && width.includes('%') ? width : (width === 'auto' ? 'auto' : `${width}px`)),
    display: 'inline-block',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: '1.4',
    textDecoration: linkUrl ? 'underline' : 'none' // Subrayado automático si hay link
  };

  const content = (
    <span 
      style={style} 
      dangerouslySetInnerHTML={{ __html: formatText(text) }}
    />
  );

  if (linkUrl) {
    return (
      <a 
        href={linkUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        style={{ 
          textDecoration: 'none', 
          display: sizing.widthMode === 'fill' ? 'block' : 'inline-block',
          width: sizing.widthMode === 'fill' ? '100%' : 'auto',
          cursor: 'inherit' // Mantener el cursor de arrastre del sistema
        }}
        onClick={(e) => {
          // Si presiona Cmd o Ctrl, dejamos que abra el link
          if (e.metaKey || e.ctrlKey) {
            e.stopPropagation(); // Aquí sí paramos para que no solo se seleccione
            return; 
          }
          // De lo contrario, prevenimos navegación pero NO paramos la propagación
          // para que el wrapper de Canvas.jsx pueda detectar el clic y seleccionar el componente.
          e.preventDefault();
        }}
      >
        {content}
      </a>
    );
  }

  return content;
}

export default Text;
