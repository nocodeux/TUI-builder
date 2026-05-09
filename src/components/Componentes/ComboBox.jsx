import React, { useContext } from 'react';
import { FormContext } from './Form';

function getThemeColor(val, themeVar) {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent') return `var(${themeVar})`;
  return val;
}

function ComboBox({ 
  items = ['Option 1', 'Option 2', 'Option 3'], 
  optionTable = '',
  optionField = '',
  dataField = '',
  width = 150, 
  selectedIndex = 0, 
  textColor = '', 
  borderColor = '', 
  bgColor = '',
  database = { data: {} }
}) {
  const formContext = useContext(FormContext);
  
  // Resolve items from DB if configured
  let finalItems = items;
  if (optionTable && optionField && database?.data?.[optionTable]) {
    finalItems = database.data[optionTable].map(row => row[optionField]).filter(Boolean);
    // Remove duplicates
    finalItems = [...new Set(finalItems)];
  }

  const currentValue = formContext?.formData?.[dataField] || finalItems[selectedIndex] || '';

  const handleChange = (e) => {
    if (formContext && dataField) {
      formContext.updateField(dataField, e.target.value);
    }
  };

  return (
    <select 
      className="retro-select" 
      value={currentValue}
      onChange={handleChange} 
      style={{ 
        width: typeof width === 'string' && width.includes('%') ? width : `${width}px`, 
        borderColor: getThemeColor(borderColor, '--border'), 
        color: getThemeColor(textColor, '--text'), 
        background: getThemeColor(bgColor, '--input-bg') 
      }}
    >
      <option value="">-- Select --</option>
      {finalItems.map((item, idx) => (
        <option key={idx} value={item}>{item}</option>
      ))}
    </select>
  );
}

export default ComboBox;
