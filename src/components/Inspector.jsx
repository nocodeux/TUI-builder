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

// ─── Panel AutoLayout (solo para filas) ──────────────────────────────────────
function AutoLayoutPanel({ layout = {}, onUpdate }) {
  const dir = layout.direction || 'row';
  const gap = layout.gap ?? 8;
  const align = layout.align || 'flex-start';
  const justify = layout.justify || 'flex-start';
  const wrap = layout.wrap || false;

  const AlignBtn = ({ value, icon, field, current }) => (
    <button
      className={`al-btn ${current === value ? 'al-active' : ''}`}
      onClick={() => onUpdate({ [field]: value })}
      title={value}
    >
      {icon}
    </button>
  );

  return (
    <div className="autolayout-panel">
      <div className="al-section-title">AUTO LAYOUT</div>

      {/* Dirección */}
      <div className="property-group">
        <label>DIRECCIÓN</label>
        <div className="al-btn-group">
          <button className={`al-btn ${dir === 'row' ? 'al-active' : ''}`} onClick={() => onUpdate({ direction: 'row' })} title="Horizontal">→ Row</button>
          <button className={`al-btn ${dir === 'column' ? 'al-active' : ''}`} onClick={() => onUpdate({ direction: 'column' })} title="Vertical">↓ Col</button>
        </div>
      </div>

      {/* Gap */}
      <div className="property-group">
        <label>GAP (px)</label>
        <input
          type="number" min="0" max="200" value={gap}
          onChange={e => onUpdate({ gap: parseInt(e.target.value, 10) || 0 })}
          style={{ width: '100%' }}
        />
      </div>

      {/* Align Items (cross-axis) */}
      <div className="property-group">
        <label>{dir === 'row' ? 'ALIGN VERTICAL' : 'ALIGN HORIZONTAL'}</label>
        <div className="al-btn-group">
          <AlignBtn field="align" value="flex-start" current={align} icon={dir === 'row' ? '⬆' : '⬅'} />
          <AlignBtn field="align" value="center"    current={align} icon="⊕" />
          <AlignBtn field="align" value="flex-end"  current={align} icon={dir === 'row' ? '⬇' : '➡'} />
          <AlignBtn field="align" value="stretch"   current={align} icon="↕" />
        </div>
      </div>

      {/* Justify Content (main-axis) */}
      <div className="property-group">
        <label>{dir === 'row' ? 'JUSTIFY HORIZONTAL' : 'JUSTIFY VERTICAL'}</label>
        <div className="al-btn-group">
          <AlignBtn field="justify" value="flex-start"    current={justify} icon="⊢" />
          <AlignBtn field="justify" value="center"        current={justify} icon="⊙" />
          <AlignBtn field="justify" value="flex-end"      current={justify} icon="⊣" />
          <AlignBtn field="justify" value="space-between" current={justify} icon="⟺" />
          <AlignBtn field="justify" value="space-around"  current={justify} icon="↔" />
        </div>
      </div>

      {/* Wrap */}
      <div className="property-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <label style={{ margin: 0 }}>WRAP</label>
        <input type="checkbox" checked={wrap} onChange={e => onUpdate({ wrap: e.target.checked })} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{wrap ? 'Sí (multi-línea)' : 'No (una línea)'}</span>
      </div>

      {/* Vista previa del layout */}
      <div className="al-preview">
        <div style={{
          display: 'flex',
          flexDirection: dir,
          gap: Math.min(gap, 6),
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? 'wrap' : 'nowrap',
          width: '100%', height: 40,
          padding: 4,
        }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ width: 14, height: 14, background: 'var(--accent)', opacity: 0.7, flexShrink: 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Inspector principal ──────────────────────────────────────────────────────
function Inspector({ component, isRow, onUpdate, onDelete, onDuplicate, windows, database }) {
  const [localProps, setLocalProps] = useState({});

  useEffect(() => {
    if (component) setLocalProps({ ...component.props, ...(isRow ? component.layout || {} : {}) });
  }, [component?.id]);

  const commitChange = useCallback((field, value) => {
    if (component) onUpdate(component.id, { [field]: value });
  }, [component, onUpdate]);

  if (!component) {
    return (
      <div className="inspector">
        <h3>[INSPECTOR]</h3>
        <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 20, fontSize: 11 }}>
          [ No selection ]<br /><br />
          [ Click un componente ]<br />
          [ Click borde de fila = layout ]
        </div>
        <div className="property-divider" style={{ marginTop: 20 }} />
        <div style={{ color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.7 }}>
          <b style={{ color: 'var(--accent)' }}>SHORTCUTS</b><br />
          Delete — eliminar<br />
          Ctrl+D — duplicar<br />
          Drag — reordenar<br />
          Drop en fila — mover<br />
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

  const renderColor = (label, field, def = '#00ff00') => (
    <div className="property-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <input type="text" className="hex-input" placeholder={def} maxLength={7}
          value={localProps[field] || def}
          onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateLocal(field, e.target.value); }}
          onBlur={() => { if (isHex(localProps[field])) commitChange(field, localProps[field]); else updateLocal(field, component.props[field] || def); }}
          onKeyDown={e => { if (e.key === 'Enter' && isHex(localProps[field])) { commitChange(field, localProps[field]); e.target.blur(); } }}
        />
        <input type="color"
          value={isHex(localProps[field]) ? localProps[field] : (component.props[field] || def)}
          onChange={e => updateAndCommit(field, e.target.value)}
          className="color-picker"
        />
      </div>
    </div>
  );

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
        {renderColor('BACKGROUND','bgColor','#000000')}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
      </>);
      case 'Frame': return (<>
        <div className="property-group"><label>TITLE</label><input type="text" value={localProps.title||''} onChange={e => updateAndCommit('title', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','300')}
        {renderNumber('height','HEIGHT (px)','auto')}
        <div className="property-group"><label>BORDER STYLE</label>
          <select value={localProps.borderStyle||'single'} onChange={e => updateAndCommit('borderStyle', e.target.value)}>
            <option value="single">Single</option><option value="double">Double</option><option value="dashed">Dashed</option>
          </select>
        </div>
        {renderColor('TEXT COLOR','textColor','#ffff00')}
        {renderColor('BACKGROUND','bgColor','transparent')}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
      </>);
      case 'Button': return (<>
        <div className="property-group"><label>TEXT</label><input type="text" value={localProps.text||''} onChange={e => updateAndCommit('text', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','80')}
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        {renderColor('BACKGROUND','bgColor','transparent')}
        {renderColor('BORDER COLOR','borderColor','#00ff00')}
        <div className="property-divider" />
        <div className="property-group"><label>ACTION</label>
          <select value={localProps.action||'none'} onChange={e => updateAndCommit('action', e.target.value)}>
            <option value="none">None</option>
            <option value="navigate">Navigate to Window</option>
            <option value="external">Open External Link</option>
            <option value="email">Send Email</option>
          </select>
        </div>
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
      case 'Label': return (<>
        <div className="property-group"><label>TEXT</label><textarea value={localProps.text||''} onChange={e => updateAndCommit('text', e.target.value)} rows={3} /></div>
        {renderNumber('fontSize','FONT SIZE (px)','12')}
        <div className="property-group"><label>ALIGNMENT</label>
          <select value={localProps.alignment||'left'} onChange={e => updateAndCommit('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </div>
        {renderColor('TEXT COLOR','textColor','#00ff00')}
        <div className="property-group"><label>LINK URL</label><input type="text" value={localProps.linkUrl||''} onChange={e => updateAndCommit('linkUrl', e.target.value)} placeholder="https://... (opcional)" /></div>
      </>);
      case 'TextBox': return (<>
        <div className="property-group"><label>PLACEHOLDER</label><input type="text" value={localProps.placeholder||''} onChange={e => updateAndCommit('placeholder', e.target.value)} /></div>
        {renderNumber('width','WIDTH (px)','150')}
        <div className="property-group"><label>INPUT TYPE</label>
          <select value={localProps.inputType||'text'} onChange={e => updateAndCommit('inputType', e.target.value)}>
            <option value="text">Text</option><option value="password">Password</option><option value="number">Number</option><option value="email">Email</option>
          </select>
        </div>
        <div className="property-group"><label>READ ONLY</label><input type="checkbox" checked={localProps.readOnly||false} onChange={e => updateAndCommit('readOnly', e.target.checked)} /></div>
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
        {renderColor('FILL COLOR','bgColor','transparent')}
      </>);
      case 'Line': return (<>
        <div className="property-group"><label>FULL WIDTH</label><input type="checkbox" checked={localProps.fullWidth!==false} onChange={e => updateAndCommit('fullWidth', e.target.checked)} /></div>
        {renderNumber('thickness','THICKNESS (px)','1')}
        {renderColor('COLOR','color','#00ff00')}
      </>);
      case 'Image': return (<>
        <div className="property-group"><label>IMAGE URL</label><input type="text" value={localProps.src||''} onChange={e => updateAndCommit('src', e.target.value)} placeholder="https://..." /></div>
        {renderNumber('width','WIDTH (px)','80')}
        {renderNumber('height','HEIGHT (px)','80')}
        <div className="property-group"><label>ALT TEXT</label><input type="text" value={localProps.alt||''} onChange={e => updateAndCommit('alt', e.target.value)} /></div>
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

  return (
    <div className="inspector">
      <h3>[{component.type.toUpperCase()}]</h3>
      <div className="property-group">
        <label>ID</label>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{component.id}</div>
      </div>
      <div className="property-divider" />
      {renderProps()}
      <div className="property-divider" />
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="inspector-btn duplicate" onClick={onDuplicate}>Duplicate</button>
        <button className="inspector-btn delete" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

export default Inspector;
