import React, { useState, useEffect, useCallback, useRef } from 'react';

function Inspector({ component, onUpdate, onDelete, onDuplicate, windows, database }) {
  const [localProps, setLocalProps] = useState({});
  const editingRef = useRef(null);

  useEffect(() => {
    if (component) {
      setLocalProps({ ...component.props });
    }
  }, [component?.id]);

  const commitChange = useCallback((field, value) => {
    if (component) {
      onUpdate(component.id, { [field]: value });
    }
  }, [component, onUpdate]);

  if (!component) {
    return (
      <div className="inspector">
        <h3>[INSPECTOR]</h3>
        <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 20 }}>
          [ No selection ]<br />
          [ Click an element ]
        </div>
      </div>
    );
  }

  const updateLocal = (field, value) => {
    setLocalProps(prev => ({ ...prev, [field]: value }));
  };

  const updateAndCommit = (field, value) => {
    updateLocal(field, value);
    commitChange(field, value);
  };

  const renderNumberField = (field, label, placeholder, min) => (
    <div className="property-group">
      <label>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={localProps[field] ?? ''}
        onChange={(e) => updateLocal(field, e.target.value)}
        onBlur={() => {
          const v = localProps[field];
          if (v === '' || v === undefined || v === null) {
            commitChange(field, 0);
            setLocalProps(prev => ({ ...prev, [field]: 0 }));
          } else {
            const num = parseInt(v, 10);
            if (!isNaN(num)) {
              commitChange(field, num);
              setLocalProps(prev => ({ ...prev, [field]: num }));
            } else {
              setLocalProps(prev => ({ ...prev, [field]: component.props[field] || 0 }));
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = localProps[field];
            const num = parseInt(v, 10);
            if (!isNaN(num)) {
              commitChange(field, num);
            }
            e.target.blur();
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );

  const renderColorInput = (label, field, defaultColor = '#00ff00') => (
    <div className="property-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="text"
          value={localProps[field] || defaultColor}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateLocal(field, v);
          }}
          onBlur={() => {
            const v = localProps[field];
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              commitChange(field, v);
            } else {
              setLocalProps(prev => ({ ...prev, [field]: component.props[field] || defaultColor }));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = localProps[field];
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                commitChange(field, v);
              }
              e.target.blur();
            }
          }}
          className="hex-input"
          placeholder="#00ff00"
          maxLength={7}
        />
        <input
          type="color"
          value={isValidHex(localProps[field]) ? localProps[field] : (component.props[field] || defaultColor)}
          onChange={(e) => updateAndCommit(field, e.target.value)}
          className="color-picker"
        />
      </div>
    </div>
  );

  const isValidHex = (hex) => /^#[0-9a-fA-F]{6}$/.test(hex);

  const renderProperties = () => {
    const type = component.type;

    switch(type) {
      case 'Window':
        return (
          <>
            <div className="property-group">
              <label>TITLE</label>
              <input type="text" value={localProps.title || ''} onChange={(e) => updateAndCommit('title', e.target.value)} />
            </div>
            {renderNumberField('width', 'WIDTH (px)', '400')}
            <div className="property-group">
              <label>HEIGHT</label>
              <select value={localProps.height || ''} onChange={(e) => updateAndCommit('height', e.target.value)}>
                <option value="">Auto (content)</option>
                <option value="200">200px</option>
                <option value="300">300px</option>
                <option value="400">400px</option>
                <option value="500">500px</option>
                <option value="600">600px</option>
                <option value="700">700px</option>
                <option value="800">800px</option>
              </select>
            </div>
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
            {renderColorInput('BACKGROUND', 'bgColor', '#000000')}
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
          </>
        );
      case 'Frame':
        return (
          <>
            <div className="property-group">
              <label>TITLE</label>
              <input type="text" value={localProps.title || ''} onChange={(e) => updateAndCommit('title', e.target.value)} />
            </div>
            {renderNumberField('width', 'WIDTH (px)', '300')}
            {renderNumberField('height', 'HEIGHT', 'auto')}
            <div className="property-group">
              <label>BORDER STYLE</label>
              <select value={localProps.borderStyle || 'single'} onChange={(e) => updateAndCommit('borderStyle', e.target.value)}>
                <option value="single">Single</option>
                <option value="double">Double</option>
                <option value="dashed">Dashed</option>
              </select>
            </div>
            {renderColorInput('TEXT COLOR', 'textColor', '#ffff00')}
            {renderColorInput('BACKGROUND', 'bgColor', 'transparent')}
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
          </>
        );
      case 'Button':
        return (
          <>
            <div className="property-group">
              <label>TEXT</label>
              <input type="text" value={localProps.text || ''} onChange={(e) => updateAndCommit('text', e.target.value)} />
            </div>
            {renderNumberField('width', 'WIDTH (px)', '80')}
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
            {renderColorInput('BACKGROUND', 'bgColor', 'transparent')}
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
            <div className="property-divider" />
            <div className="property-group">
              <label>ACTION</label>
              <select value={localProps.action || 'none'} onChange={(e) => updateAndCommit('action', e.target.value)}>
                <option value="none">None</option>
                <option value="navigate">Navigate to Window</option>
                <option value="external">Open External Link</option>
                <option value="email">Send Email</option>
                <option value="alert">Show Alert</option>
              </select>
            </div>
            {localProps.action === 'navigate' && (
              <div className="property-group">
                <label>TARGET WINDOW</label>
                <select value={localProps.targetWindow || ''} onChange={(e) => updateAndCommit('targetWindow', e.target.value)}>
                  <option value="">-- Select --</option>
                  {windows.filter(w => w.id !== component.id).map(w => (
                    <option key={w.id} value={w.id}>{w.props.title}</option>
                  ))}
                </select>
              </div>
            )}
            {(localProps.action === 'external' || localProps.action === 'email') && (
              <div className="property-group">
                <label>{localProps.action === 'email' ? 'EMAIL' : 'URL'}</label>
                <input type="text" value={localProps.actionValue || ''} onChange={(e) => updateAndCommit('actionValue', e.target.value)} placeholder={localProps.action === 'email' ? 'user@email.com' : 'https://...'} />
              </div>
            )}
          </>
        );
      case 'Label':
        return (
          <>
            <div className="property-group">
              <label>TEXT</label>
              <input type="text" value={localProps.text || ''} onChange={(e) => updateAndCommit('text', e.target.value)} />
            </div>
            {renderNumberField('fontSize', 'FONT SIZE', '12')}
            <div className="property-group">
              <label>ALIGNMENT</label>
              <select value={localProps.alignment || 'left'} onChange={(e) => updateAndCommit('alignment', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="property-group">
              <label>TYPE</label>
              <select value={localProps.linkUrl ? 'link' : 'text'} onChange={(e) => { if (e.target.value === 'text') updateAndCommit('linkUrl', ''); }}>
                <option value="text">Text</option>
                <option value="link">Link</option>
              </select>
            </div>
            {localProps.linkUrl && (
              <div className="property-group">
                <label>URL</label>
                <input type="text" value={localProps.linkUrl || ''} onChange={(e) => updateAndCommit('linkUrl', e.target.value)} placeholder="https://..." />
              </div>
            )}
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
          </>
        );
      case 'TextBox':
        return (
          <>
            <div className="property-group">
              <label>PLACEHOLDER</label>
              <input type="text" value={localProps.placeholder || ''} onChange={(e) => updateAndCommit('placeholder', e.target.value)} />
            </div>
            <div className="property-group">
              <label>INPUT TYPE</label>
              <select value={localProps.inputType || 'text'} onChange={(e) => updateAndCommit('inputType', e.target.value)}>
                <option value="text">Text</option>
                <option value="password">Password</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
                <option value="tel">Phone</option>
                <option value="url">URL</option>
              </select>
            </div>
            {renderNumberField('width', 'WIDTH (px)', '150')}
            {renderNumberField('maxLength', 'MAX CHARS', '0=unlimited')}
            <div className="property-group">
              <label>READ ONLY</label>
              <input type="checkbox" checked={localProps.readOnly || false} onChange={(e) => updateAndCommit('readOnly', e.target.checked)} />
            </div>
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
            {renderColorInput('BACKGROUND', 'bgColor', '#000000')}
          </>
        );
      case 'CheckBox':
      case 'RadioButton':
        return (
          <>
            <div className="property-group">
              <label>TEXT</label>
              <input type="text" value={localProps.text || ''} onChange={(e) => updateAndCommit('text', e.target.value)} />
            </div>
            <div className="property-group">
              <label>CHECKED</label>
              <input type="checkbox" checked={localProps.checked || false} onChange={(e) => updateAndCommit('checked', e.target.checked)} />
            </div>
            {type === 'RadioButton' && (
              <div className="property-group">
                <label>GROUP</label>
                <input type="text" value={localProps.group || 'group1'} onChange={(e) => updateAndCommit('group', e.target.value)} />
              </div>
            )}
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
          </>
        );
      case 'ComboBox':
        return (
          <>
            <div className="property-group">
              <label>ITEMS (comma separated)</label>
              <textarea
                value={(localProps.items || []).join(', ')}
                onChange={(e) => updateAndCommit('items', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                rows="3"
              />
            </div>
            {renderNumberField('width', 'WIDTH (px)', '150')}
            {renderNumberField('selectedIndex', 'SELECTED INDEX', '0')}
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
            {renderColorInput('BACKGROUND', 'bgColor', '#000000')}
          </>
        );
      case 'ListBox':
        return (
          <>
            <div className="property-group">
              <label>ITEMS (comma separated)</label>
              <textarea
                value={(localProps.items || []).join(', ')}
                onChange={(e) => updateAndCommit('items', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                rows="3"
              />
            </div>
            {renderNumberField('width', 'WIDTH (px)', '150')}
            {renderNumberField('height', 'HEIGHT (px)', '100')}
            <div className="property-group">
              <label>MULTI SELECT</label>
              <input type="checkbox" checked={localProps.multiSelect || false} onChange={(e) => updateAndCommit('multiSelect', e.target.checked)} />
            </div>
            {renderColorInput('TEXT COLOR', 'textColor', '#00ff00')}
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
            {renderColorInput('BACKGROUND', 'bgColor', '#000000')}
          </>
        );
      case 'PictureBox':
        return (
          <>
            {renderNumberField('width', 'WIDTH (px)', '150')}
            {renderNumberField('height', 'HEIGHT (px)', '100')}
            <div className="property-group">
              <label>STRETCH IMAGE</label>
              <input type="checkbox" checked={localProps.stretch || false} onChange={(e) => updateAndCommit('stretch', e.target.checked)} />
            </div>
            <div className="property-group">
              <label>BORDER</label>
              <input type="checkbox" checked={localProps.border !== false} onChange={(e) => updateAndCommit('border', e.target.checked)} />
            </div>
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
          </>
        );
      case 'Timer':
        return (
          <>
            {renderNumberField('interval', 'INTERVAL (ms)', '1000')}
            <div className="property-group">
              <label>ENABLED</label>
              <input type="checkbox" checked={localProps.enabled || false} onChange={(e) => updateAndCommit('enabled', e.target.checked)} />
            </div>
          </>
        );
      case 'Shape':
        return (
          <>
            <div className="property-group">
              <label>SHAPE TYPE</label>
              <select value={localProps.shapeType || 'rectangle'} onChange={(e) => updateAndCommit('shapeType', e.target.value)}>
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
                <option value="square">Square</option>
              </select>
            </div>
            {renderNumberField('width', 'WIDTH (px)', '60')}
            {renderNumberField('height', 'HEIGHT (px)', '40')}
            <div className="property-group">
              <label>FILL</label>
              <input type="checkbox" checked={localProps.fill || false} onChange={(e) => updateAndCommit('fill', e.target.checked)} />
            </div>
            {renderColorInput('BORDER COLOR', 'borderColor', '#00ff00')}
            {renderColorInput('FILL COLOR', 'bgColor', 'transparent')}
          </>
        );
      case 'Line':
        return (
          <>
            <div className="property-group">
              <label>FULL WIDTH</label>
              <input type="checkbox" checked={localProps.fullWidth !== false} onChange={(e) => updateAndCommit('fullWidth', e.target.checked)} />
            </div>
            {localProps.fullWidth !== false && (
              <div className="property-group">
                <label>WIDTH (%)</label>
                <input type="text" inputMode="numeric" value={localProps.widthPercent ?? 100}
                  onChange={(e) => updateLocal('widthPercent', e.target.value)}
                  onBlur={() => { const v = parseInt(localProps.widthPercent, 10); if (!isNaN(v)) commitChange('widthPercent', Math.min(100, Math.max(1, v))); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { commitChange('widthPercent', Math.min(100, Math.max(1, parseInt(localProps.widthPercent, 10)))); e.target.blur(); } }}
                />
              </div>
            )}
            {renderNumberField('thickness', 'THICKNESS (px)', '1')}
            {renderColorInput('COLOR', 'color', '#00ff00')}
          </>
        );
      case 'Image':
        return (
          <>
            <div className="property-group">
              <label>IMAGE URL</label>
              <input type="text" value={localProps.src || ''} onChange={(e) => updateAndCommit('src', e.target.value)} placeholder="https://... or leave empty" />
            </div>
            {renderNumberField('width', 'WIDTH (px)', '80')}
            {renderNumberField('height', 'HEIGHT (px)', '80')}
            <div className="property-group">
              <label>ALT TEXT</label>
              <input type="text" value={localProps.alt || ''} onChange={(e) => updateAndCommit('alt', e.target.value)} />
            </div>
          </>
        );
      case 'HScrollBar':
      case 'VScrollBar':
        return (
          <>
            {renderNumberField('value', 'VALUE', '50')}
            {renderNumberField('min', 'MIN', '0')}
            {renderNumberField('max', 'MAX', '100')}
            {renderNumberField(type === 'HScrollBar' ? 'width' : 'height', type === 'HScrollBar' ? 'WIDTH (px)' : 'HEIGHT (px)', '150')}
            {renderColorInput('BACKGROUND', 'bgColor', '#000000')}
            {renderColorInput('THUMB COLOR', 'thumbColor', '#00ff00')}
          </>
        );
      case 'Data':
        return (
          <>
            <div className="property-group">
              <label>TABLE</label>
              <input type="text" value={localProps.tableName || ''} onChange={(e) => updateAndCommit('tableName', e.target.value)} placeholder="Type table name or select" list="table-list-insp" />
              {(database?.tables || []).length > 0 && (
                <datalist id="table-list-insp">
                  {(database?.tables || []).map(t => (
                    <option key={t.name} value={t.name} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="property-group">
              <label>SOURCE</label>
              <select value={localProps.dataSource || 'sqlite'} onChange={(e) => updateAndCommit('dataSource', e.target.value)}>
                <option value="sqlite">SQLite</option>
                <option value="json">JSON</option>
                <option value="api">API</option>
              </select>
            </div>
            <div className="property-group">
              <label>{localProps.dataSource === 'sqlite' ? 'SQL QUERY' : localProps.dataSource === 'json' ? 'JSON PATH' : 'API ENDPOINT'}</label>
              <input type="text" value={localProps.query || ''} onChange={(e) => updateAndCommit('query', e.target.value)}
                placeholder={localProps.dataSource === 'sqlite' ? 'SELECT * FROM ...' : localProps.dataSource === 'json' ? '/data/file.json' : 'https://api.example.com/data'} />
            </div>
          </>
        );
      default:
        return <div style={{ color: 'var(--text-dim)' }}>[ Properties not available ]</div>;
    }
  };

  return (
    <div className="inspector">
      <h3>[{component.type.toUpperCase()}]</h3>
      <div className="property-group">
        <label>ID</label>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{component.id}</div>
      </div>
      <div className="property-divider" />
      {renderProperties()}
      <div className="property-divider" />
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="inspector-btn duplicate" onClick={onDuplicate}>Duplicate</button>
        <button className="inspector-btn delete" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

export default Inspector;
