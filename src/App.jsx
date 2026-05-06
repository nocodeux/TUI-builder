/**
 * App.jsx — Modelo de datos con filas (rows) para AutoLayout estilo Figma
 *
 * CAMBIOS PRINCIPALES:
 * - `components` ahora es `rows`: array de { id, layout, children }
 * - addComponent → addToRow(type, rowId, index)
 * - addNewRow(type, existingItem, afterIndex) → crea nueva fila
 * - moveComponent(item, toRowId, toIndex) → reordena existentes
 * - Canvas y Inspector reciben `rows` y handlers actualizados
 * - Inspector muestra controles AutoLayout cuando se selecciona una ROW
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Toolbox from './components/Toolbox';
import Canvas from './components/Canvas';
import Inspector from './components/Inspector';
import DatabasePanel from './components/DatabasePanel';
import './App.css';

const THEMES = {
  'theme-nano': { name: 'Nano', bg: '#000000', panelBg: '#000000', border: '#00aa00', text: '#00ff00', textDim: '#008800', accent: '#ffff00', selected: '#003300' },
  'theme-bios': { name: 'BIOS', bg: '#0000aa', panelBg: '#0000aa', border: '#aaaaaa', text: '#ffffff', textDim: '#cccccc', accent: '#ffff00', selected: '#000088' },
  'theme-retro': { name: 'Retro', bg: '#0a0a0a', panelBg: '#0c0c0c', border: '#2a5a2a', text: '#33ff33', textDim: '#1a7a1a', accent: '#ffaa00', selected: '#1e3a1e' },
  'theme-amber': { name: 'Amber', bg: '#0a0800', panelBg: '#0d0a00', border: '#aa7700', text: '#ffb000', textDim: '#886600', accent: '#ffcc00', selected: '#332200' }
};

const DEFAULT_LAYOUT = { direction: 'row', gap: 8, align: 'flex-start', justify: 'flex-start', wrap: false };

const mkId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

function App() {
  const [rows, setRows] = useState([]);           // [ { id, layout, children } ]
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('desktop');
  const [theme, setTheme] = useState(() => localStorage.getItem('nanostudio_theme') || 'theme-nano');
  const [showProjects, setShowProjects] = useState(false);
  const [showDatabase, setShowDatabase] = useState(false);
  const [currentProject, setCurrentProject] = useState(() => {
    const saved = localStorage.getItem('nanostudio_current_project');
    return saved ? JSON.parse(saved) : { id: 'default', name: 'Untitled' };
  });
  const [saveStatus, setSaveStatus] = useState('');
  const [activeWindow, setActiveWindow] = useState(null);
  const [database, setDatabase] = useState({ tables: [], data: {} });

  // ── Defaults por tipo ────────────────────────────────────────────────────
  const getDefaultProps = type => ({
    Window: { title: 'Window1', width: 400, height: '', bgColor: '', textColor: '', borderColor: '' },
    Frame: { title: 'Frame1', width: 300, height: '', borderStyle: 'single', bgColor: '', textColor: '', borderColor: '' },
    Button: { text: 'Button1', bgColor: 'transparent', textColor: '#00ff00', borderColor: '#00ff00', width: 80 },
    Label: { text: 'Label1', textColor: '#00ff00', fontSize: 12, alignment: 'left', linkUrl: '' },
    TextBox: { placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, textColor: '#00ff00', borderColor: '#00ff00', bgColor: '#000000', inputType: 'text' },
    CheckBox: { text: 'CheckBox1', checked: false, textColor: '#00ff00' },
    RadioButton: { text: 'Option1', checked: false, group: 'group1', textColor: '#00ff00' },
    ComboBox: { items: ['Option 1', 'Option 2', 'Option 3'], width: 150, selectedIndex: 0, textColor: '#00ff00', borderColor: '#00ff00', bgColor: '#000000' },
    ListBox: { items: ['Item 1', 'Item 2', 'Item 3'], width: 150, height: 100, multiSelect: false, textColor: '#00ff00', borderColor: '#00ff00', bgColor: '#000000' },
    HScrollBar: { value: 50, min: 0, max: 100, width: 150, bgColor: '#000000', thumbColor: '#00ff00' },
    VScrollBar: { value: 50, min: 0, max: 100, height: 100, bgColor: '#000000', thumbColor: '#00ff00' },
    Timer: { interval: 1000, enabled: false },
    PictureBox: { width: 150, height: 100, stretch: false, border: true, borderColor: '' },
    Shape: { shapeType: 'rectangle', width: 60, height: 40, borderColor: '#00ff00', bgColor: 'transparent', fill: false },
    Line: { color: '#00ff00', thickness: 1, fullWidth: true, widthPercent: 100 },
    Image: { src: '', width: 80, height: 80, alt: 'Image' },
    Data: { tableName: '', dataSource: 'sqlite', query: '' }
  }[type] || { text: type });

  const mkComp = type => ({ id: mkId(), type, props: getDefaultProps(type), children: [] });

  // ── Helpers recursivos ────────────────────────────────────────────────────
  const findInRows = (rowsArr, id) => {
    for (const row of rowsArr) {
      if (row.id === id) return row;
      for (const comp of row.children) {
        if (comp.id === id) return comp;
        if (comp.children) {
          const found = findInComps(comp.children, id);
          if (found) return found;
        }
      }
    }
    return null;
  };

  const findInComps = (comps, id) => {
    for (const c of comps) {
      if (c.id === id) return c;
      if (c.children) { const f = findInComps(c.children, id); if (f) return f; }
    }
    return null;
  };

  const updateCompRecursive = (comps, id, newProps) =>
    comps.map(c => c.id === id
      ? { ...c, props: { ...c.props, ...newProps } }
      : { ...c, children: c.children ? updateCompRecursive(c.children, id, newProps) : c.children }
    );

  const deleteCompRecursive = (comps, id) =>
    comps.filter(c => c.id !== id).map(c => ({ ...c, children: c.children ? deleteCompRecursive(c.children, id) : c.children }));

  const addToCompChildren = (comps, parentId, newComp) =>
    comps.map(c => c.id === parentId
      ? { ...c, children: [...(c.children || []), newComp] }
      : { ...c, children: c.children ? addToCompChildren(c.children, parentId, newComp) : c.children }
    );

  // ── Agregar componente a una fila existente ───────────────────────────────
  const addToRow = useCallback((type, rowId, index, parentContainerId = null) => {
    const newComp = mkComp(type);
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      if (parentContainerId) {
        // Agregar dentro de un Window/Frame que está en esta fila
        return { ...row, children: addToCompChildren(row.children, parentContainerId, newComp) };
      }
      const newChildren = [...row.children];
      newChildren.splice(index, 0, newComp);
      return { ...row, children: newChildren };
    }));
    setSelectedId(newComp.id);
  }, []);

  // ── Crear nueva fila ──────────────────────────────────────────────────────
  const addNewRow = useCallback((type, existingItem = null, afterIndex = null) => {
    const newRow = { id: mkId(), layout: { ...DEFAULT_LAYOUT }, children: [] };
    if (type) {
      newRow.children = [mkComp(type)];
    }
    setRows(prev => {
      if (afterIndex !== null) {
        const next = [...prev];
        next.splice(afterIndex, 0, newRow);
        return next;
      }
      return [...prev, newRow];
    });
    if (newRow.children.length > 0) setSelectedId(newRow.children[0].id);
    else setSelectedId(newRow.id);
  }, []);

  // ── Mover componente existente ────────────────────────────────────────────
  const moveComponent = useCallback((item, toRowId, toIndex, newRowAfter = null) => {
    setRows(prev => {
      // Extraer el componente de donde estaba
      let moved = null;
      const stripped = prev.map(row => {
        const found = row.children.find(c => c.id === item.id);
        if (found) { moved = found; return { ...row, children: row.children.filter(c => c.id !== item.id) }; }
        return row;
      });

      if (!moved) return prev;

      if (toRowId === '__newrow__') {
        // Crear nueva fila con este componente
        const newRow = { id: mkId(), layout: { ...DEFAULT_LAYOUT }, children: [moved] };
        const result = [...stripped];
        result.splice(newRowAfter ?? result.length, 0, newRow);
        return result;
      }

      return stripped.map(row => {
        if (row.id !== toRowId) return row;
        const newChildren = [...row.children];
        // Ajustar índice si movemos dentro de la misma fila
        const adjustedIndex = item.fromRowId === toRowId && toIndex > item.fromIndex ? toIndex - 1 : toIndex;
        newChildren.splice(Math.min(adjustedIndex, newChildren.length), 0, moved);
        return { ...row, children: newChildren };
      });
    });
  }, []);

  // ── Actualizar props de componente ────────────────────────────────────────
  const updateComponent = useCallback((id, newProps) => {
    setRows(prev => prev.map(row => {
      if (row.id === id) {
        // Es una fila — actualizar su layout
        return { ...row, layout: { ...(row.layout || DEFAULT_LAYOUT), ...newProps } };
      }
      return { ...row, children: updateCompRecursive(row.children, id, newProps) };
    }));
  }, []);

  // ── Eliminar componente ───────────────────────────────────────────────────
  const deleteComponent = useCallback((id) => {
    setRows(prev => {
      // ¿Es una fila entera?
      const isRow = prev.some(r => r.id === id);
      if (isRow) return prev.filter(r => r.id !== id);
      // Es un componente dentro de una fila
      return prev.map(row => ({ ...row, children: deleteCompRecursive(row.children, id) }))
                 .filter(row => true); // mantener filas vacías (el usuario decide)
    });
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  // ── Duplicar componente ───────────────────────────────────────────────────
  const duplicateComponent = useCallback((id) => {
    setRows(prev => prev.map(row => {
      const idx = row.children.findIndex(c => c.id === id);
      if (idx === -1) return row;
      const dup = { ...row.children[idx], id: mkId(), children: JSON.parse(JSON.stringify(row.children[idx].children || [])) };
      const newChildren = [...row.children];
      newChildren.splice(idx + 1, 0, dup);
      setSelectedId(dup.id);
      return { ...row, children: newChildren };
    }));
  }, []);

  // ── Seleccionar fila ──────────────────────────────────────────────────────
  const selectRow = useCallback((rowId) => {
    setSelectedId(rowId);
  }, []);

  // ── Encontrar elemento seleccionado ──────────────────────────────────────
  const findSelected = () => {
    if (!selectedId) return null;
    return findInRows(rows, selectedId);
  };

  // ── Persistencia ──────────────────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    setSaveStatus('Saving...');
    requestAnimationFrame(() => {
      const projectData = { name: currentProject.name, theme, viewMode, rows, activeWindow, database, modified: new Date().toISOString() };
      localStorage.setItem(`nanostudio_project_${currentProject.id}`, JSON.stringify(projectData));
      localStorage.setItem('nanostudio_current_project', JSON.stringify(currentProject));
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 800);
    });
  }, [rows, database, currentProject, theme, viewMode, activeWindow]);

  useEffect(() => { localStorage.setItem('nanostudio_theme', theme); }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem(`nanostudio_project_${currentProject.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Migración: si el proyecto guardado usa formato viejo (components[]), convertir
        if (data.components && !data.rows) {
          const migrated = data.components.map(comp => ({
            id: mkId(), layout: { ...DEFAULT_LAYOUT },
            children: [comp]
          }));
          setRows(migrated);
        } else {
          setRows(data.rows || []);
        }
        setTheme(data.theme || 'theme-nano');
        setViewMode(data.viewMode || 'desktop');
        setActiveWindow(data.activeWindow || null);
        setDatabase(data.database || { tables: [], data: {} });
      } catch(e) { console.error(e); setRows([]); }
    } else { setRows([]); }
    setSaveStatus('');
  }, [currentProject.id]);

  useEffect(() => { if (rows.length > 0 || currentProject.id !== 'default') triggerSave(); }, [rows, triggerSave]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const countAll = (rowsArr) => rowsArr.reduce((acc, row) => acc + countComps(row.children), 0);
  const countComps = (comps) => comps.reduce((acc, c) => acc + 1 + (c.children ? countComps(c.children) : 0), 0);
  const getWindows = () => rows.flatMap(r => r.children.filter(c => c.type === 'Window'));
  const getProjectList = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('nanostudio_project_'));
    return keys.map(k => { try { const d = JSON.parse(localStorage.getItem(k)); return { id: k.replace('nanostudio_project_', ''), ...d }; } catch { return null; } }).filter(Boolean);
  };

  // ── Export HTML ───────────────────────────────────────────────────────────
  const exportHTML = () => {
    const t = THEMES[theme];
    const allComps = rows.flatMap(r => r.children);
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${currentProject.name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:${t.bg};font-family:'Courier New',monospace;color:${t.text};padding:20px}</style>
</head><body>${allComps.map(c => `<div>[${c.type}]</div>`).join('\n')}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${currentProject.name}.html`; a.click();
  };

  const newProject = () => {
    const name = prompt('Project name:', 'New Project');
    if (!name) return;
    const id = mkId();
    setCurrentProject({ id, name });
    setRows([]); setSelectedId(null); setActiveWindow(null);
    setDatabase({ tables: [], data: {} });
    setShowProjects(false);
  };

  const loadProject = (id) => {
    const proj = getProjectList().find(p => p.id === id);
    if (proj) { setCurrentProject({ id, name: proj.name }); setShowProjects(false); }
  };

  const deleteProject = (id) => {
    if (!confirm('Delete project?')) return;
    localStorage.removeItem(`nanostudio_project_${id}`);
    if (currentProject.id === id) { setCurrentProject({ id: 'default', name: 'Untitled' }); setRows([]); }
  };

  const renameProject = (id, name) => {
    const saved = localStorage.getItem(`nanostudio_project_${id}`);
    if (saved) { const d = JSON.parse(saved); localStorage.setItem(`nanostudio_project_${id}`, JSON.stringify({ ...d, name })); }
    if (currentProject.id === id) setCurrentProject(p => ({ ...p, name }));
  };

  const selectedElement = findSelected();
  const isRowSelected = selectedElement && rows.some(r => r.id === selectedId);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={`app ${theme}`}>
        <div className="toolbar">
          {Object.entries(THEMES).map(([key, t]) => (
            <button key={key} className={`toolbar-btn ${theme === key ? 'active' : ''}`} onClick={() => setTheme(key)}>{t.name}</button>
          ))}
          <span className="toolbar-sep">|</span>
          <button className={`toolbar-btn ${viewMode === 'desktop' ? 'active' : ''}`} onClick={() => setViewMode('desktop')}>Desktop</button>
          <button className={`toolbar-btn ${viewMode === 'mobile' ? 'active' : ''}`} onClick={() => setViewMode('mobile')}>Mobile</button>
          <span className="toolbar-sep">|</span>
          <button className="toolbar-btn" onClick={exportHTML}>Export</button>
          <button className="toolbar-btn" onClick={() => setShowDatabase(!showDatabase)}>Database</button>
          <button className="toolbar-btn" onClick={() => setShowProjects(!showProjects)}>Projects</button>
          <button className="toolbar-btn" onClick={() => selectedId && duplicateComponent(selectedId)} disabled={!selectedId}>Duplicate</button>
        </div>

        <div className="main-layout">
          <Toolbox />
          <Canvas
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteComponent}
            onDuplicate={duplicateComponent}
            viewMode={viewMode}
            onAddToRow={addToRow}
            onAddNewRow={addNewRow}
            onMoveComponent={moveComponent}
            onSelectRow={selectRow}
            activeWindow={activeWindow}
          />
          <Inspector
            component={selectedElement}
            isRow={isRowSelected}
            onUpdate={updateComponent}
            onDelete={() => selectedId && deleteComponent(selectedId)}
            onDuplicate={() => selectedId && duplicateComponent(selectedId)}
            windows={getWindows()}
            database={database}
          />
        </div>

        <div className="status-bar">
          <span>{currentProject.name}</span>
          <span>{countAll(rows)} components · {rows.length} rows</span>
          <span>{viewMode === 'desktop' ? 'Desktop' : 'Mobile'}</span>
          <span>Theme: {THEMES[theme]?.name}</span>
          <span className={`save-status ${saveStatus === 'Saved' ? 'saved' : saveStatus === 'Saving...' ? 'saving' : ''}`}>{saveStatus}</span>
        </div>

        {showProjects && (
          <div className="projects-overlay" onClick={() => setShowProjects(false)}>
            <div className="projects-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-titlebar">
                <span className="modal-title">[ Project Manager ]</span>
                <button className="modal-close" onClick={() => setShowProjects(false)}>X</button>
              </div>
              <div className="modal-body">
                <button className="modal-action-btn" onClick={newProject}>+ New Project</button>
                <div className="modal-divider" />
                {getProjectList().map(proj => (
                  <div key={proj.id} className="project-item">
                    <div className="project-name-cell">
                      <div style={{ color: 'var(--text)', fontWeight: 'bold', cursor: 'pointer' }}
                           onClick={() => loadProject(proj.id)}>{proj.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{proj.modified}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="small-btn" onClick={() => loadProject(proj.id)}>Load</button>
                      <button className="small-btn danger" onClick={() => deleteProject(proj.id)}>X</button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <button className="modal-action-btn" onClick={() => setShowProjects(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDatabase && (
          <DatabasePanel database={database} setDatabase={setDatabase} onClose={() => setShowDatabase(false)} triggerSave={triggerSave} />
        )}
      </div>
    </DndProvider>
  );
}

export default App;
