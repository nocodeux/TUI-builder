import React, { useContext, useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { DataContext } from './DataRepeater';
import { FormContext } from './Form';

function getThemeColor(val, themeVar) {
  if (!val || val.toLowerCase() === '#00ff00' || val.toLowerCase() === '#000000' || val === 'transparent')
    return `var(${themeVar})`;
  return val;
}

// options: array of strings or {value, label} objects
function normalizeOptions(opts) {
  return (opts || []).map(o => typeof o === 'string' ? { value: o, label: o } : o);
}

function Selector({
  // ── Canvas / form-bound mode ───────────────────────────────────────────────
  items = ['Option 1', 'Option 2', 'Option 3'],
  optionTable = '',
  optionField = '',
  optionFilterField = '',
  optionFilterValue = '',
  dataField = '',
  selectedIndex = 0,
  database = { data: {} },

  // ── Controlled mode (Inspector, toolbar, etc.) ─────────────────────────────
  value: valueProp,
  onChange: onChangeProp,
  options: optionsProp,
  placeholder = '-- Select --',

  // ── Shared style props ─────────────────────────────────────────────────────
  width = 150,
  textColor = '',
  borderColor = '',
  bgColor = '',
  containerStyle,
}) {
  const isControlled = onChangeProp !== undefined;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const dropRef = useRef(null);
  const dataCtx = useContext(DataContext);
  const formCtx = useContext(FormContext);

  const resolveTemplates = (txt, src) => {
    if (!txt || !src) return txt;
    return txt.replace(/\{\{(.*?)\}\}/g, (_, f) => {
      const k = f.trim();
      return src[k] !== undefined ? String(src[k]) : `{{${k}}}`;
    });
  };

  // Build options list
  let displayOptions; // [{value, label}]
  if (isControlled && optionsProp !== undefined) {
    displayOptions = normalizeOptions(optionsProp);
  } else {
    let resolvedItems = items;
    if (optionTable && optionField && database?.data?.[optionTable]) {
      let rows = database.data[optionTable];
      if (optionFilterField && optionFilterValue) {
        const resolved = resolveTemplates(optionFilterValue, dataCtx);
        rows = rows.filter(r => String(r[optionFilterField]) === String(resolved));
      }
      resolvedItems = [...new Set(rows.map(r => r[optionField]).filter(Boolean))];
    }
    displayOptions = resolvedItems.map(i => ({ value: i, label: i }));
  }

  const currentValue = isControlled
    ? (valueProp ?? '')
    : (formCtx?.formData?.[dataField] !== undefined
        ? formCtx.formData[dataField]
        : (displayOptions[selectedIndex]?.value ?? ''));

  const currentLabel = displayOptions.find(o => o.value === String(currentValue))?.label ?? currentValue;

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left, width: Math.max(r.width, 100) });
    }
    setOpen(v => !v);
  };

  const handleSelect = (val) => {
    if (isControlled) {
      onChangeProp(val);
    } else if (formCtx && dataField) {
      formCtx.updateField(dataField, val);
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const inBtn  = buttonRef.current?.contains(e.target);
      const inDrop = dropRef.current?.contains(e.target);
      if (!inBtn && !inDrop) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const border = getThemeColor(borderColor, '--border');
  const text   = getThemeColor(textColor,   '--text');
  const bg     = getThemeColor(bgColor,     '--input-bg');
  const w      = width === '100%' || (typeof width === 'string' && width.includes('%'))
    ? width
    : `${width}px`;

  const itemBase = {
    border: 'none',
    borderBottom: `1px solid ${border}`,
    color: text,
    fontFamily: 'monospace',
    fontSize: 11,
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    padding: '5px 8px',
    boxSizing: 'border-box',
  };

  const renderItems = () => {
    if (isControlled) {
      // Controlled mode: render options array directly (caller includes placeholder if needed)
      return displayOptions.map((opt, i) => (
        <button
          key={opt.value !== '' ? opt.value : `__empty_${i}`}
          onMouseDown={() => handleSelect(opt.value)}
          style={{
            ...itemBase,
            background: opt.value === String(currentValue) ? 'var(--selected)' : 'transparent',
            borderBottom: i < displayOptions.length - 1 ? `1px solid ${border}` : 'none',
          }}
          onMouseEnter={e => { if (opt.value !== String(currentValue)) e.currentTarget.style.background = 'var(--selected)'; }}
          onMouseLeave={e => { if (opt.value !== String(currentValue)) e.currentTarget.style.background = 'transparent'; }}
        >
          {opt.label}
        </button>
      ));
    }
    // Canvas mode: prepend implicit "-- Select --" option
    const all = [{ value: '', label: placeholder }, ...displayOptions];
    return all.map((opt, i) => (
      <button
        key={i}
        onMouseDown={() => handleSelect(opt.value)}
        style={{
          ...itemBase,
          background: opt.value === currentValue ? 'var(--selected)' : 'transparent',
          borderBottom: i < all.length - 1 ? `1px solid ${border}` : 'none',
        }}
        onMouseEnter={e => { if (opt.value !== currentValue) e.currentTarget.style.background = 'var(--selected)'; }}
        onMouseLeave={e => { if (opt.value !== currentValue) e.currentTarget.style.background = 'transparent'; }}
      >
        {opt.label}
      </button>
    ));
  };

  return (
    <div style={{ position: 'relative', width: w, display: 'inline-block', boxSizing: 'border-box', ...containerStyle }}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '5px 8px',
          background: bg,
          border: `1px solid ${border}`,
          color: text,
          fontFamily: 'monospace',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(currentValue !== '' && currentValue !== undefined ? currentLabel : '') || placeholder}
        </span>
        <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 4, flexShrink: 0 }}>▼</span>
      </button>

      {open && pos && ReactDOM.createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: pos.width,
            zIndex: 99999,
            background: bg || 'var(--bg)',
            border: `1px solid ${border}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {renderItems()}
        </div>,
        document.body
      )}
    </div>
  );
}

export default Selector;
