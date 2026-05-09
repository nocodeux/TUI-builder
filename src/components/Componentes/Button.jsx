import React, { useContext, useRef } from 'react';
import { DataContext } from './DataRepeater';
import { FormContext } from './Form';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function Button({ 
  text = 'Button1', 
  bgColor = '', 
  textColor = '', 
  borderColor = '', 
  width = 80, 
  disabled = false, 
  onClick,
  dataSourceType = 'manual',
  dataField = '',
  action = 'none',
  onSaveRecord
}) {
  const data = useContext(DataContext);
  const formContext = useContext(FormContext);
  const fileInputRef = useRef(null);
  
  const resolvedText = (dataSourceType === 'database' && data && dataField) 
    ? String(data[dataField] || text) 
    : text;

  const handleClick = (e) => {
    if (onClick) onClick(e);
    
    if (action === 'submit' && formContext && onSaveRecord) {
      if (formContext.targetTable) {
        onSaveRecord(formContext.targetTable, formContext.formData);
        formContext.setFormData({}); // Clear form after submit
        alert(`Data saved to ${formContext.targetTable}!`);
      } else {
        alert('Form has no target table selected.');
      }
    }

    if (action === 'upload' && formContext && dataField && fileInputRef.current) {
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

  return (
    <>
      <button
        className="retro-button"
        disabled={disabled}
        onClick={handleClick}
        style={{
          width: typeof width === 'string' && width.includes('%') ? width : (width ? `${width}px` : 'auto'),
          '--button-bg': bgColor || 'transparent',
          '--button-text': getThemeColor(textColor, '--text'),
          '--button-border': getThemeColor(borderColor, '--text'),
        }}
      >
        {resolvedText}
      </button>
      {action === 'upload' && formContext && dataField && (
        <input 
          type="file" 
          ref={fileInputRef}
          style={{ display: 'none' }} 
          accept="image/*,.gif,.pdf"
          onChange={handleFileChange}
        />
      )}
    </>
  );
}

export default Button;
