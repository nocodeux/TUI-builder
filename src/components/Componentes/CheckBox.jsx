import React, { useContext } from 'react';
import { DataContext } from './DataRepeater';
import { FormContext } from './Form';

const getThemeColor = (val, themeVar) => {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
};

function CheckBox({ 
  text = 'CheckBox1', 
  checked = false, 
  textColor = '',
  dataField = '',
  dataSourceType = 'manual'
}) {
  const data = useContext(DataContext);
  const formContext = useContext(FormContext);

  const resolveTemplates = (txt, dataSource) => {
    if (!txt || !dataSource) return txt;
    return txt.replace(/\{\{(.*?)\}\}/g, (match, field) => {
      const trimmedField = field.trim();
      return dataSource[trimmedField] !== undefined ? String(dataSource[trimmedField]) : match;
    });
  };

  const resolvedText = (dataSourceType === 'database' && data)
    ? resolveTemplates(text, data)
    : text;

  const isChecked = (formContext && dataField) 
    ? !!formContext.formData[dataField] 
    : checked;

  const handleChange = (e) => {
    if (formContext && dataField) {
      formContext.updateField(dataField, e.target.checked);
    }
  };

  return (
    <label className="retro-checkbox" style={{ color: getThemeColor(textColor, '--text'), display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
      <input 
        type="checkbox" 
        checked={isChecked} 
        onChange={handleChange}
        disabled={!formContext || !dataField}
      />
      <span>{resolvedText}</span>
    </label>
  );
}


export default CheckBox;

