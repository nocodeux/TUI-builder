import React from 'react';

function Shape({ shapeType = 'rectangle', width = 60, height = 40, borderColor = '#00ff00', bgColor = 'transparent', fill = false }) {
  const style = {
    width: `${width}px`,
    height: `${height}px`,
    border: `1px solid ${borderColor}`,
    backgroundColor: fill ? bgColor : 'transparent',
    display: 'inline-block',
    verticalAlign: 'middle'
  };

  if (shapeType === 'circle') {
    return <div style={{ ...style, borderRadius: '50%' }} />;
  }
  if (shapeType === 'square') {
    return <div style={{ ...style, width: `${height}px` }} />;
  }
  return <div style={style} />;
}

export default Shape;
