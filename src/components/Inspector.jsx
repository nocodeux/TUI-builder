/**
 * Inspector.jsx — Con panel AutoLayout cuando se selecciona una ROW
 *
 * Cuando isRow=true, muestra controles de layout estilo Figma:
 * - Dirección (row / column)
 * - Gap (espaciado entre hijos)
 * - Align items (cross-axis)
 * - Justify content (main-axis)
 * - Wrap
 */
import React, { useState, useEffect, useCallback } from 'react';
import IconPicker from './IconPicker';

// ─── Panel AutoLayout (solo para filas) ──────────────────────────────────────
function AutoLayoutPanel({ layout = {}, onUpdate }) {
  const [localGap, setLocalGap] = useState(layout.gap ?? 8);
  const [localP, setLocalP] = useState({
    T: layout.paddingTop ?? 0,
    R: layout.paddingRight ?? 0,
    B: layout.paddingBottom ?? 0,
    L: layout.paddingLeft ?? 0
  });

  useEffect(() => {
    setLocalGap(layout.gap ?? 8);
    setLocalP({
      T: layout.paddingTop ?? 0,
      R: layout.paddingRight ?? 0,
      B: layout.paddingBottom ?? 0,
      L: layout.paddingLeft ?? 0
    });
  }, [layout]);

  const dir = layout.direction || 'row';
  const align = layout.align || 'flex-start';
  const justify = layout.justify || 'flex-start';
  const wrap = layout.wrap || false;
  const pLinked = layout.paddingLinked !== false;

  const AlignBtn = ({ value, icon, field, current }) => (
    <button className={`al-btn ${current === value ? 'al-active' : ''}`} onClick={() => onUpdate({ [field]: value })} title={value}>{icon}</button>
  );

  const commitPadding = (side, val) => {
    const v = parseInt(val, 10);
    if (isNaN(v)) {
      setLocalP(prev => ({ ...prev, [side]: layout[`padding${side === 'T' ? 'Top' : side === 'R' ? 'Right' : side === 'B' ? 'Bottom' : 'Left'}`] ?? 0 }));
      return;
    }
    if (pLinked) {
      onUpdate({ paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v });
    } else {
      const field = side === 'T' ? 'paddingTop' : side === 'R' ? 'paddingRight' : side === 'B' ? 'paddingBottom' : 'paddingLeft';
      onUpdate({ [field]: v });
    }
  };

  const commitGap = (val) => {
    const v = parseInt(val, 10);
    if (!isNaN(v)) onUpdate({ gap: v });
    else setLocalGap(layout.gap ?? 8);
  };

  return (
    <div className="autolayout-panel">
      <div className="al-section-title">AUTO LAYOUT</div>
      <div className="property-group">
        <label>DIRECTION</label>
        <div className="al-btn-group">
          <button className={`al-btn ${dir === 'row' ? 'al-active' : ''}`} onClick={() => onUpdate({ direction: 'row' })}>→ Row</button>
          <button className={`al-btn ${dir === 'column' ? 'al-active' : ''}`} onClick={() => onUpdate({ direction: 'column' })}>↓ Col</button>
        </div>
      </div>
      <div className="property-group">
        <label>GAP (px)</label>
        <input 
          type="text" 
          inputMode="numeric" 
          value={localGap}
          onChange={e => setLocalGap(e.target.value)}
          onBlur={e => commitGap(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
          style={{ width: '100%' }} 
        />
      </div>
      <div className="property-group">
        <label>{dir === 'row' ? 'ALIGN VERTICAL' : 'ALIGN HORIZONTAL'}</label>
        <div className="al-btn-group">
          <AlignBtn field="align" value="flex-start" current={align} icon={dir === 'row' ? '⬆' : '⬅'} />
          <AlignBtn field="align" value="center" current={align} icon="⊕" />
          <AlignBtn field="align" value="flex-end" current={align} icon={dir === 'row' ? '⬇' : '➡'} />
          <AlignBtn field="align" value="stretch" current={align} icon="↕" />
        </div>
      </div>
      <div className="property-group">
        <label>{dir === 'row' ? 'JUSTIFY HORIZONTAL' : 'JUSTIFY VERTICAL'}</label>
        <div className="al-btn-group">
          <AlignBtn field="justify" value="flex-start" current={justify} icon="⊢" />
          <AlignBtn field="justify" value="center" current={justify} icon="⊙" />
          <AlignBtn field="justify" value="flex-end" current={justify} icon="⊣" />
          <AlignBtn field="justify" value="space-between" current={justify} icon="⟺" />
          <AlignBtn field="justify" value="space-around" current={justify} icon="↔" />
        </div>
      </div>
      <div className="property-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <label style={{ margin: 0 }}>WRAP</label>
        <input type="checkbox" checked={wrap} onChange={e => onUpdate({ wrap: e.target.checked })} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{wrap ? 'On' : 'Off'}</span>
      </div>
      {/* Padding */}
      <div className="property-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>PADDING
          <button onClick={() => onUpdate({ paddingLinked: !pLinked })} style={{ background: 'none', border: '1px solid var(--border)', color: pLinked ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 9, padding: '1px 4px', fontFamily: 'monospace' }}>{pLinked ? '🔗' : '⋯'}</button>
        </label>
        {pLinked ? (
          <input 
            type="text" 
            inputMode="numeric" 
            value={localP.T} 
            onChange={e => { const v = e.target.value; setLocalP({ T: v, R: v, B: v, L: v }); }} 
            onBlur={e => commitPadding('T', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            style={{ width: '100%' }} 
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <div><span style={{ fontSize: 8, color: 'var(--text-dim)' }}>T</span><input type="text" inputMode="numeric" value={localP.T} onChange={e => setLocalP(prev => ({ ...prev, T: e.target.value }))} onBlur={e => commitPadding('T', e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%' }} /></div>
            <div><span style={{ fontSize: 8, color: 'var(--text-dim)' }}>R</span><input type="text" inputMode="numeric" value={localP.R} onChange={e => setLocalP(prev => ({ ...prev, R: e.target.value }))} onBlur={e => commitPadding('R', e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%' }} /></div>
            <div><span style={{ fontSize: 8, color: 'var(--text-dim)' }}>B</span><input type="text" inputMode="numeric" value={localP.B} onChange={e => setLocalP(prev => ({ ...prev, B: e.target.value }))} onBlur={e => commitPadding('B', e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%' }} /></div>
            <div><span style={{ fontSize: 8, color: 'var(--text-dim)' }}>L</span><input type="text" inputMode="numeric" value={localP.L} onChange={e => setLocalP(prev => ({ ...prev, L: e.target.value }))} onBlur={e => commitPadding('L', e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%' }} /></div>
          </div>
        )}
      </div>
      {/* Preview */}
      <div className="al-preview">
        <div style={{ display: 'flex', flexDirection: dir, gap: Math.min(parseInt(localGap, 10) || 0, 6), alignItems: align, justifyContent: justify, flexWrap: wrap ? 'wrap' : 'nowrap', width: '100%', height: 40, padding: 4 }}>
          {[1,2,3].map(i => (<div key={i} style={{ width: 14, height: 14, background: 'var(--accent)', opacity: 0.7, flexShrink: 0 }} />))}
        </div>
      </div>
    </div>
  );
}

// ─── Inspector principal ──────────────────────────────────────────────────────
function Inspector({ component, isRow, onUpdate, onDelete, onDuplicate, windows, database, canvasPadding, onCanvasPaddingChange, selectedId, themeColors = {}, activeScreen, screens, onUpdateScreen }) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [localProps, setLocalProps] = useState({});

  useEffect(() => {
    if (component) {
      const layoutProps = isRow
        ? (component.layout || {})
        : (component.props?.layout || {});
      setLocalProps({ ...component.props, ...layoutProps });
    }
  }, [component?.id]);

  const commitChange = useCallback((field, value) => {
    if (component) onUpdate(component.id, { [field]: value });
  }, [component, onUpdate]);

  if (!component) {
    return (
      <div className="inspector">
        <h3>[INSPECTOR]</h3>
        <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 10, fontSize: 11 }}>
          [ {activeScreen?.name || 'Screen'} selected ]
        </div>
        
        <div className="property-divider" style={{ marginTop: 15 }} />
        
        <div className="al-section-title">SCREEN SETTINGS</div>
        <div className="property-group">
          <label>NAME</label>
          <input 
            type="text" 
            value={activeScreen?.name || ''} 
            onChange={e => onUpdateScreen(activeScreen.id, { name: e.target.value })}
          />
        </div>
        <div className="property-group">
          <label>AUTO JUMP (sec)</label>
          <input 
            type="number" 
            min="0" 
            value={activeScreen?.settings?.timeout || 0}
            onChange={e => onUpdateScreen(activeScreen.id, { settings: { ...activeScreen.settings, timeout: parseInt(e.target.value, 10) || 0 } })}
            placeholder="0 = disabled"
          />
        </div>
        {(activeScreen?.settings?.timeout > 0) && (
          <div className="property-group">
            <label>NEXT SCREEN</label>
            <select 
              value={activeScreen?.settings?.nextScreenId || ''} 
              onChange={e => onUpdateScreen(activeScreen.id, { settings: { ...activeScreen.settings, nextScreenId: e.target.value } })}
            >
              <option value="">-- Select Screen --</option>
              {(screens || []).filter(s => s.id !== activeScreen.id).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="property-divider" style={{ marginTop: 20 }} />
        <div className="al-section-title">CANVAS PADDING</div>
        {canvasPadding && onCanvasPaddingChange && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
            {['top','right','bottom','left'].map(side => (
              <div key={side} className="property-group">
                <label>{side.toUpperCase()}</label>
                <input type="number" min="0" max="200" value={canvasPadding[side] ?? 20}
                  onChange={e => onCanvasPaddingChange({ ...canvasPadding, [side]: parseInt(e.target.value, 10) || 0 })} />
              </div>
            ))}
          </div>
        )}
        <div className="property-divider" />
        <div style={{ color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.7 }}>
          <b style={{ color: 'var(--accent)' }}>SHORTCUTS</b><br />
          Delete — remove<br />
          Ctrl+D — duplicate<br />
          Drag — reorder<br />
        </div>
      </div>
    );
  }

  // ── Si es una fila seleccionada, mostrar AutoLayout ──────────────────────
  if (isRow) {
    return (
      <div className="inspector">
        <h3>[ROW LAYOUT]</h3>
        <div className="property-group">
          <label>ID</label>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{component.id}</div>
        </div>
        <div className="property-divider" />
        <AutoLayoutPanel
          layout={component.layout || {}}
          onUpdate={(changes) => onUpdate(component.id, changes)}
        />
        <div className="property-divider" />
        <button className="inspector-btn delete" onClick={onDelete} style={{ width: '100%' }}>
          Delete Row
        </button>
      </div>
    );
  }

  // ── Inspector normal para componentes ─────────────────────────────────────
  const updateLocal = (field, value) => setLocalProps(prev => ({ ...prev, [field]: value }));
  const updateAndCommit = (field, value) => { updateLocal(field, value); commitChange(field, value); };
  const showLayoutPanel = ['Window', 'Frame', 'Row'].includes(component.type);

  const renderNumber = (field, label, placeholder = '', min) => (
    <div className="property-group">
      <label>{label}</label>
      <input
        type="text" inputMode="numeric"
        value={localProps[field] ?? ''}
        onChange={e => updateLocal(field, e.target.value)}
        onBlur={() => {
          const v = localProps[field];
          if (v === '' || v === undefined) { commitChange(field, 0); updateLocal(field, 0); return; }
          const n = parseInt(v, 10);
          if (!isNaN(n)) { commitChange(field, n); updateLocal(field, n); }
          else updateLocal(field, component.props[field] || 0);
        }}
        onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(localProps[field], 10); if (!isNaN(n)) { commitChange(field, n); } e.target.blur(); } }}
        placeholder={placeholder}
      />
    </div>
  );

  const isHex = v => /^#[0-9a-fA-F]{6}$/.test(v);
  const normalizePickerColor = (value, fallback) => isHex(value) ? value : fallback;
  const isTransparentColor = v => v === 'transparent';
  const isTransparentPrefix = v => 'transparent'.startsWith((v || '').toLowerCase());

  const renderColor = (label, field, defValue = '', allowTransparent = false) => {
    let themeDefault = defValue;
    if (!themeDefault) {
      const fl = field.toLowerCase();
      if (fl.includes('text') || fl.includes('color') || fl.includes('icon')) themeDefault = themeColors.text || '#00ff00';
      else if (fl.includes('border')) themeDefault = themeColors.border || '#00ff00';
      else if (fl.includes('bg')) themeDefault = themeColors.bg || '#000000';
      else themeDefault = themeColors.text || '#00ff00';
    }

    return (
      <div className="property-group">
        <label>{label}</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input type="text" className="hex-input" placeholder={themeDefault} maxLength={allowTransparent ? 11 : 7}
            value={localProps[field] ?? ''}
            onChange={e => {
              const value = e.target.value;
              if (value === '' || /^#[0-9a-fA-F]{0,6}$/.test(value) || (allowTransparent && isTransparentPrefix(value))) {
                updateLocal(field, value);
              }
            }}
            onBlur={() => {
              const value = localProps[field];
              if (value === '' || isHex(value) || (allowTransparent && isTransparentColor(value))) {
                commitChange(field, value);
              } else {
                updateLocal(field, component.props[field] ?? '');
              }
            }}
            onKeyDown={e => {
              const value = localProps[field];
              if (e.key === 'Enter' && (value === '' || isHex(value) || (allowTransparent && isTransparentColor(value)))) {
                commitChange(field, value);
                e.target.blur();
              }
            }}
          />
          <input type="color" className="color-picker" 
            value={normalizePickerColor(localProps[field], themeDefault)} 
            onChange={e => commitChange(field, e.target.value.toLowerCase())} 
          />
        </div>
      </div>
    );
  };

  const renderProps = () => {
    const t = component.type;
    switch (t) {
      case 'Window': return (<>
        <div className="property-group"><label>TITLE</label><input type="text" value={localProps.title||''} onChange={e => updateAndCommit('title', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','400')}
        <div className="property-group"><label>HEIGHT</label>
          <select value={localProps.height||''} onChange={e => updateAndCommit('height', e.target.value)}>
            <option value="">Auto</option>
            {[200,300,400,500,600,700,800].map(h => <option key={h} value={h}>{h}px</option>)}
          </select>
        </div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BACKGROUND','bgColor','#000000', true)}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
        
        <div className="property-divider" />
        <div className="property-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <label style={{ margin: 0 }}>SHOW CLOSE [X]</label>
          <input type="checkbox" checked={localProps.showClose||false} onChange={e => updateAndCommit('showClose', e.target.checked)} />
        </div>
        {localProps.showClose && (
          <div className="property-group">
            <label>CLOSE TARGET SCREEN</label>
            <select value={localProps.closeNextScreenId||''} onChange={e => updateAndCommit('closeNextScreenId', e.target.value)}>
              <option value="">-- Select Screen --</option>
              {(screens||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </>);
      case 'Frame': return (<>
        <div className="property-group"><label>TITLE</label><input type="text" value={localProps.title||''} onChange={e => updateAndCommit('title', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','300')}
        {renderNumber('height','HEIGHT (px)','auto')}
        {renderNumber('fontSize','FONT SIZE (px)','12')}
        <div className="property-group"><label>ALIGNMENT</label>
          <select value={localProps.alignment||'left'} onChange={e => updateAndCommit('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </div>
        <div className="property-group"><label>BORDER STYLE</label>
          <select value={localProps.borderStyle||'single'} onChange={e => updateAndCommit('borderStyle', e.target.value)}>
            <option value="single">Single</option><option value="double">Double</option><option value="dashed">Dashed</option>
          </select>
        </div>
        {renderColor('TEXT COLOR','textColor','#ffff00')}
        {renderColor('BACKGROUND','bgColor','#000000', true)}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
      </>);
      case 'Button': return (<>
        <div className="property-group"><label>TEXT</label><input type="text" value={localProps.text||''} onChange={e => updateAndCommit('text', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','80')}
        <div className="property-group"><label>DISABLED</label><input type="checkbox" checked={localProps.disabled||false} onChange={e => updateAndCommit('disabled', e.target.checked)} /></div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BACKGROUND','bgColor','#000000', true)}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
        <div className="property-divider" />
        <div className="property-group"><label>ACTION</label>
          <select value={localProps.action||'none'} onChange={e => updateAndCommit('action', e.target.value)}>
            <option value="none">None</option>
            <option value="screen">Navigate to Screen</option>
            <option value="navigate">Navigate to Window</option>
            <option value="external">Open External Link</option>
            <option value="email">Send Email</option>
          </select>
        </div>
        {localProps.action === 'screen' && (
          <div className="property-group"><label>TARGET SCREEN</label>
            <select value={localProps.targetScreenId||''} onChange={e => updateAndCommit('targetScreenId', e.target.value)}>
              <option value="">-- Select Screen --</option>
              {(screens||[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {localProps.action === 'navigate' && (
          <div className="property-group"><label>TARGET WINDOW</label>
            <select value={localProps.targetWindow||''} onChange={e => updateAndCommit('targetWindow', e.target.value)}>
              <option value="">-- Select --</option>
              {(windows||[]).map(w => <option key={w.id} value={w.id}>{w.props.title}</option>)}
            </select>
          </div>
        )}
        {localProps.action === 'external' && (
          <div className="property-group"><label>URL</label><input type="text" value={localProps.href||''} onChange={e => updateAndCommit('href', e.target.value)} placeholder="https://..." /></div>
        )}
        {localProps.action === 'email' && (
          <div className="property-group"><label>EMAIL</label><input type="text" value={localProps.mailto||''} onChange={e => updateAndCommit('mailto', e.target.value)} placeholder="user@example.com" /></div>
        )}
      </>);
      case 'Text':
      case 'Label': {
        const wrapSelection = (tag) => {
          const textarea = document.querySelector('.inspector-textarea');
          if (!textarea) return;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const val = localProps.text || '';
          const before = val.substring(0, start);
          const selection = val.substring(start, end);
          const after = val.substring(end);
          const newVal = `${before}[${tag}]${selection}[/${tag}]${after}`;
          updateAndCommit('text', newVal);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length + 2, end + tag.length + 2);
          }, 0);
        };

        const handleKeyDown = (e) => {
          if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') { e.preventDefault(); wrapSelection('b'); }
            if (e.key === 'i') { e.preventDefault(); wrapSelection('i'); }
            if (e.key === 'u') { e.preventDefault(); wrapSelection('u'); }
            if (e.key === 's') { e.preventDefault(); wrapSelection('s'); }
          }
        };

        return (<>
          <div className="property-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label>TEXT</label>
              <div className="text-tools" style={{ display: 'flex', gap: 2 }}>
                <button title="Bold (Ctrl+B)" onClick={() => wrapSelection('b')}><b>B</b></button>
                <button title="Italic (Ctrl+I)" onClick={() => wrapSelection('i')}><i>I</i></button>
                <button title="Underline (Ctrl+U)" onClick={() => wrapSelection('u')}><u>U</u></button>
                <button title="Strike (Ctrl+S)" onClick={() => wrapSelection('s')}><s>S</s></button>
                <button title="Superscript" onClick={() => wrapSelection('sup')}>x²</button>
                <button title="Subscript" onClick={() => wrapSelection('sub')}>x₂</button>
              </div>
            </div>
            <textarea 
              className="inspector-textarea"
              value={localProps.text||''} 
              onChange={e => updateAndCommit('text', e.target.value)} 
              onKeyDown={handleKeyDown}
              rows={4} 
            />
          </div>
          {renderNumber('fontSize','FONT SIZE (px)','12')}
          <div className="property-group"><label>ALIGNMENT</label>
            <select value={localProps.alignment||'left'} onChange={e => updateAndCommit('alignment', e.target.value)}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </div>
          {renderColor('TEXT COLOR','textColor','#00ff00')}
          <div className="property-group"><label>LINK URL</label><input type="text" value={localProps.linkUrl||''} onChange={e => updateAndCommit('linkUrl', e.target.value)} placeholder="https://... (opcional)" /></div>
        </>);
      }
      case 'Input':
      case 'TextBox': return (<>
        <div className="property-group"><label>PLACEHOLDER</label><input type="text" value={localProps.placeholder||''} onChange={e => updateAndCommit('placeholder', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','150')}
        <div className="property-group"><label>INPUT TYPE</label>
          <select value={localProps.inputType||'text'} onChange={e => updateAndCommit('inputType', e.target.value)}>
            <option value="text">Text</option><option value="password">Password</option><option value="number">Number</option><option value="email">Email</option>
          </select>
        </div>
        <div className="property-group"><label>READ ONLY</label><input type="checkbox" checked={localProps.readOnly||false} onChange={e => updateAndCommit('readOnly', e.target.checked)} /></div>
        <div className="property-group"><label>DISABLED</label><input type="checkbox" checked={localProps.disabled||false} onChange={e => updateAndCommit('disabled', e.target.checked)} /></div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
        {renderColor('BACKGROUND','bgColor','#000000')}
      </>);
      case 'CheckBox': return (<>
        <div className="property-group"><label>TEXT</label><input type="text" value={localProps.text||''} onChange={e => updateAndCommit('text', e.target.value)} /></div>
        <div className="property-group"><label>CHECKED</label><input type="checkbox" checked={localProps.checked||false} onChange={e => updateAndCommit('checked', e.target.checked)} /></div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
      </>);
      case 'RadioButton': return (<>
        <div className="property-group"><label>TEXT</label><input type="text" value={localProps.text||''} onChange={e => updateAndCommit('text', e.target.value)} /></div>
        <div className="property-group"><label>GROUP</label><input type="text" value={localProps.group||'group1'} onChange={e => updateAndCommit('group', e.target.value)} /></div>
        <div className="property-group"><label>CHECKED</label><input type="checkbox" checked={localProps.checked||false} onChange={e => updateAndCommit('checked', e.target.checked)} /></div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
      </>);
      case 'Shape': return (<>
        <div className="property-group"><label>SHAPE</label>
          <select value={localProps.shapeType||'rectangle'} onChange={e => updateAndCommit('shapeType', e.target.value)}>
            <option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="square">Square</option>
          </select>
        </div>
        {renderNumber('width','WIDTH (px)','60')}
        {renderNumber('height','HEIGHT (px)','40')}
        <div className="property-group"><label>FILL</label><input type="checkbox" checked={localProps.fill||false} onChange={e => updateAndCommit('fill', e.target.checked)} /></div>
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
        {renderColor('FILL COLOR','bgColor','#000000', true)}
      </>);
      case 'Line': return (<>
        {renderNumber('thickness','THICKNESS (px)','1')}
        <div className="property-group"><label>LINE STYLE</label>
          <select value={localProps.lineStyle||'solid'} onChange={e => updateAndCommit('lineStyle', e.target.value)}>
            <option value="solid">Solid</option>
            <option value="double">Double</option>
            <option value="dashed">Dashed</option>
          </select>
        </div>
        {renderColor('COLOR','color','#00ff00')}
      </>);
      case 'Image': return (<>
        <div className="property-group"><label>IMAGE URL</label><input type="text" value={localProps.src||''} onChange={e => updateAndCommit('src', e.target.value)} placeholder="https://..." /></div>
        {renderNumber('width','WIDTH (px)','80')}
        {renderNumber('height','HEIGHT (px)','80')}
        <div className="property-group"><label>ALT TEXT</label><input type="text" value={localProps.alt||''} onChange={e => updateAndCommit('alt', e.target.value)} /></div>
        {renderNumber('borderThickness', 'BORDER', '1')}
        {renderColor('BORDER COLOR', 'borderColor', '')}
        <div className="property-divider" />
        <div className="al-section-title">ICON LIBRARY</div>
        {localProps.iconSrc && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div dangerouslySetInnerHTML={{ __html: localProps.iconSrc }} style={{ width: 24, height: 24, color: localProps.iconColor || '#00ff00' }} />
            <button onClick={() => { updateAndCommit('iconSrc', ''); }} style={{ background: 'none', border: '1px solid #ff6666', color: '#ff6666', cursor: 'pointer', fontFamily: 'monospace', fontSize: 9, padding: '2px 6px' }}>Clear</button>
          </div>
        )}
        {renderColor('ICON COLOR', 'iconColor', '#00ff00')}
        <button onClick={() => setShowIconPicker(true)} style={{ width: '100%', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '6px', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', marginTop: 4 }}>
          {localProps.iconSrc ? 'Change Icon' : 'Browse Icons'}
        </button>
        {showIconPicker && (
          <IconPicker
            currentIcon=""
            onSelect={(filename, svg) => { updateAndCommit('iconSrc', svg); setShowIconPicker(false); }}
            onClose={() => setShowIconPicker(false)}
          />
        )}
      </>);
      case 'Timer': return (<>
        {renderNumber('interval','INTERVAL (ms)','1000')}
        <div className="property-group"><label>ENABLED</label><input type="checkbox" checked={localProps.enabled||false} onChange={e => updateAndCommit('enabled', e.target.checked)} /></div>
      </>);
      case 'ComboBox': return (<>
        <div className="property-group"><label>ITEMS (comma separated)</label>
          <textarea value={(localProps.items||[]).join(', ')} onChange={e => updateAndCommit('items', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} rows={3} />
        </div>
        {renderNumber('width','WIDTH (px)','150')}
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BACKGROUND','bgColor','#000000')}
      </>);
      case 'ListBox': return (<>
        <div className="property-group"><label>ITEMS (comma separated)</label>
          <textarea value={(localProps.items||[]).join(', ')} onChange={e => updateAndCommit('items', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} rows={3} />
        </div>
        {renderNumber('width','WIDTH (px)','150')}
        {renderNumber('height','HEIGHT (px)','100')}
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BACKGROUND','bgColor','#000000')}
      </>);
      case 'Table': return (<>
        {renderNumber('width','WIDTH (px)','400')}
        {renderNumber('height','HEIGHT (px)','200')}
        <div className="property-group"><label>SHOW HEADERS</label><input type="checkbox" checked={localProps.showHeaders!==false} onChange={e => updateAndCommit('showHeaders', e.target.checked)} /></div>
        <div className="property-group"><label>STRIPED ROWS</label><input type="checkbox" checked={localProps.stripedRows!==false} onChange={e => updateAndCommit('stripedRows', e.target.checked)} /></div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
        {renderColor('HEADER BG','headerBgColor','#003300')}
        <div className="property-divider" />
        <div className="al-section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          DATA SOURCE
          <button onClick={() => window.openDatabasePanel?.()} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 9, cursor: 'pointer', textDecoration: 'underline' }}>Manage Data</button>
        </div>
        <div className="property-group"><label>SOURCE TYPE</label>
          <select value={localProps.dataSourceType||'manual'} onChange={e => updateAndCommit('dataSourceType', e.target.value)}>
            <option value="manual">Manual</option><option value="database">Database Table</option>
          </select>
        </div>
        {localProps.dataSourceType === 'database' && (database?.tables||[]).length > 0 && (
          <div className="property-group"><label>TABLE</label>
            <select value={localProps.dataSource||''} onChange={e => updateAndCommit('dataSource', e.target.value)}>
              <option value="">-- Select --</option>
              {(database.tables||[]).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div className="property-divider" />
        <div className="al-section-title">COLUMNS</div>
        {(localProps.columns||[]).map((col, ci) => (
          <div key={ci} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
            <input type="text" value={col.name} style={{ flex: 1, fontSize: 10 }}
              onChange={e => { const cols = [...(localProps.columns||[])]; cols[ci] = { ...cols[ci], name: e.target.value }; updateAndCommit('columns', cols); }} />
            <input type="text" inputMode="numeric" value={col.width ?? 80} style={{ width: 50, fontSize: 10 }}
              onChange={e => { 
                const cols = [...(localProps.columns||[])]; 
                cols[ci] = { ...cols[ci], width: e.target.value }; 
                updateAndCommit('columns', cols); 
              }} 
              onBlur={e => {
                const n = parseInt(e.target.value, 10);
                const cols = [...(localProps.columns||[])];
                cols[ci] = { ...cols[ci], width: isNaN(n) ? 80 : n };
                updateAndCommit('columns', cols);
              }}
            />
            <button onClick={() => { const cols = (localProps.columns||[]).filter((_,i)=>i!==ci); updateAndCommit('columns', cols); }}
              style={{ background: 'none', border: 'none', color: '#ff6666', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>×</button>
          </div>
        ))}
        <button onClick={() => { const cols = [...(localProps.columns||[]), { name: `Col${(localProps.columns||[]).length+1}`, type: 'text', width: 80 }]; updateAndCommit('columns', cols); }}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', width: '100%' }}>+ Add Column</button>
        <div className="al-section-title">ROWS ({(localProps.rows||[]).length})</div>
        {(localProps.rows||[]).map((row, ri) => (
          <div key={ri} style={{ border: '1px solid var(--border)', padding: 4, marginBottom: 4, fontSize: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-dim)' }}>Row {ri+1}</span>
              <button onClick={() => { updateAndCommit('rows', (localProps.rows||[]).filter((_,i)=>i!==ri)); }}
                style={{ background: 'none', border: 'none', color: '#ff6666', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10 }}>×</button>
            </div>
            {(localProps.columns||[]).map((col, ci) => (
              <input key={ci} type="text" value={String(row[col.name]??'')} placeholder={col.name}
                style={{ width: '100%', marginBottom: 2, fontSize: 10 }}
                onChange={e => { const rows = [...(localProps.rows||[])]; rows[ri] = { ...rows[ri], [col.name]: e.target.value }; updateAndCommit('rows', rows); }} />
            ))}
          </div>
        ))}
        <button onClick={() => { const newRow = {}; (localProps.columns||[]).forEach(c => { newRow[c.name] = ''; }); updateAndCommit('rows', [...(localProps.rows||[]), newRow]); }}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', width: '100%', marginTop: 4 }}>+ Add Row</button>
      </>);
      case 'Data': return (<>
        <div className="property-group"><label>TABLE</label>
          <input type="text" value={localProps.tableName||''} onChange={e => updateAndCommit('tableName', e.target.value)} list="table-list-insp" />
          {(database?.tables||[]).length > 0 && <datalist id="table-list-insp">{(database.tables||[]).map(t => <option key={t.name} value={t.name} />)}</datalist>}
        </div>
        <div className="property-group"><label>SOURCE</label>
          <select value={localProps.dataSource||'sqlite'} onChange={e => updateAndCommit('dataSource', e.target.value)}>
            <option value="sqlite">SQLite</option><option value="json">JSON</option><option value="api">API</option>
          </select>
        </div>
        <div className="property-group"><label>QUERY / PATH</label>
          <input type="text" value={localProps.query||''} onChange={e => updateAndCommit('query', e.target.value)} />
        </div>
      </>);
      default: return <div style={{ color: 'var(--text-dim)' }}>[ Properties not available ]</div>;
    }
  };

  // Sizing mode panel
  const sizing = component.props?.sizing;
  const renderSizingPanel = () => {
    if (!sizing) return null;
    return (
      <>
        <div className="property-divider" />
        <div className="al-section-title">SIZING</div>
        <div className="property-group">
          <label>WIDTH MODE</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={sizing.widthMode || 'fixed'} style={{ flex: 1 }}
              onChange={e => onUpdate(component.id, { sizing: { ...sizing, widthMode: e.target.value } })}>
              <option value="fixed">Fixed</option>
              <option value="fill">Fill Container</option>
              <option value="hug">Hug Contents</option>
            </select>
            <input 
              type="text" 
              inputMode="numeric"
              value={localProps.width ?? component.props.width ?? ''} 
              disabled={sizing.widthMode !== 'fixed'}
              style={{ width: 55, opacity: sizing.widthMode !== 'fixed' ? 0.5 : 1 }}
              onChange={e => updateLocal('width', e.target.value)}
              onBlur={() => {
                const n = parseInt(localProps.width, 10);
                if (!isNaN(n)) commitChange('width', n);
                else updateLocal('width', component.props.width);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const n = parseInt(localProps.width, 10);
                  if (!isNaN(n)) commitChange('width', n);
                  e.target.blur();
                }
              }}
            />
          </div>
        </div>
        <div className="property-group">
          <label>HEIGHT MODE</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={sizing.heightMode || 'hug'} style={{ flex: 1 }}
              onChange={e => onUpdate(component.id, { sizing: { ...sizing, heightMode: e.target.value } })}>
              <option value="fixed">Fixed</option>
              <option value="fill">Fill Container</option>
              <option value="hug">Hug Contents</option>
            </select>
            <input 
              type="text" 
              inputMode="numeric"
              value={localProps.height ?? component.props.height ?? ''} 
              disabled={sizing.heightMode !== 'fixed'}
              style={{ width: 55, opacity: sizing.heightMode !== 'fixed' ? 0.5 : 1 }}
              onChange={e => updateLocal('height', e.target.value)}
              onBlur={() => {
                const n = parseInt(localProps.height, 10);
                if (!isNaN(n)) commitChange('height', n);
                else updateLocal('height', component.props.height);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const n = parseInt(localProps.height, 10);
                  if (!isNaN(n)) commitChange('height', n);
                  e.target.blur();
                }
              }}
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="inspector">
      <h3>[{component.type.toUpperCase()}]</h3>
      <div className="property-group">
        <label>ID</label>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{component.id}</div>
      </div>
      <div className="property-divider" />
      {showLayoutPanel && (
        <>
          <AutoLayoutPanel
            layout={component.props?.layout || component.layout || {}}
            onUpdate={(changes) => onUpdate(component.id, changes)}
          />
          <div className="property-divider" />
        </>
      )}
      {renderProps()}
      {renderSizingPanel()}
      <div className="property-divider" />
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="inspector-btn duplicate" onClick={onDuplicate}>Duplicate</button>
        <button className="inspector-btn delete" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

export default Inspector;
