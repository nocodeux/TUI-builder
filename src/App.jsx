import React, { useState, useCallback, useRef, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Toolbox from './components/Toolbox';
import Canvas from './components/Canvas';
import Inspector from './components/Inspector';
import DatabasePanel from './components/DatabasePanel';
import './App.css';

const CONTAINER_TYPES = ['Window', 'Frame', 'PictureBox'];

const THEMES = {
  'theme-nano': { name: 'Nano', bg: '#000000', panelBg: '#000000', border: '#00aa00', text: '#00ff00', textDim: '#008800', accent: '#ffff00', selected: '#003300' },
  'theme-bios': { name: 'BIOS', bg: '#0000aa', panelBg: '#0000aa', border: '#aaaaaa', text: '#ffffff', textDim: '#cccccc', accent: '#ffff00', selected: '#000088' },
  'theme-retro': { name: 'Retro', bg: '#0a0a0a', panelBg: '#0c0c0c', border: '#2a5a2a', text: '#33ff33', textDim: '#1a7a1a', accent: '#ffaa00', selected: '#1e3a1e' },
  'theme-amber': { name: 'Amber', bg: '#0a0800', panelBg: '#0d0a00', border: '#aa7700', text: '#ffb000', textDim: '#886600', accent: '#ffcc00', selected: '#332200' }
};

function App() {
  const [components, setComponents] = useState([]);
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

  const getDefaultProps = (type) => {
    const defaults = {
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
    };
    return defaults[type] || defaults.Button;
  };

  const triggerSave = useCallback(() => {
    setSaveStatus('Saving...');
    requestAnimationFrame(() => {
      const projectData = {
        name: currentProject.name,
        theme,
        viewMode,
        components,
        activeWindow,
        database,
        modified: new Date().toISOString()
      };
      localStorage.setItem(`nanostudio_project_${currentProject.id}`, JSON.stringify(projectData));
      localStorage.setItem('nanostudio_current_project', JSON.stringify(currentProject));
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 800);
    });
  }, [components, database, currentProject, theme, viewMode, activeWindow]);

  useEffect(() => {
    localStorage.setItem('nanostudio_theme', theme);
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem(`nanostudio_project_${currentProject.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setComponents(data.components || []);
        setTheme(data.theme || 'theme-nano');
        setViewMode(data.viewMode || 'desktop');
        setActiveWindow(data.activeWindow || null);
        setDatabase(data.database || { tables: [], data: {} });
      } catch(e) { console.error(e); setComponents([]); }
    } else {
      setComponents([]);
    }
    setSaveStatus('');
  }, [currentProject.id]);

  useEffect(() => {
    if (components.length > 0 || currentProject.id !== 'default') {
      triggerSave();
    }
  }, [components, triggerSave]);

  const addComponent = useCallback((type, parentId = null) => {
    const newComponent = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
      type,
      props: getDefaultProps(type),
      children: []
    };

    setComponents(prev => {
      if (parentId) {
        return addToParent(prev, parentId, newComponent);
      }
      return [...prev, newComponent];
    });
  }, []);

  const addToParent = (items, parentId, newComponent) => {
    return items.map(item => {
      if (item.id === parentId) {
        return { ...item, children: [...(item.children || []), newComponent] };
      }
      if (item.children && item.children.length > 0) {
        return { ...item, children: addToParent(item.children, parentId, newComponent) };
      }
      return item;
    });
  };

  const updateComponent = (id, newProps) => {
    const updateRecursive = (items) => {
      return items.map(item => {
        if (item.id === id) {
          return { ...item, props: { ...item.props, ...newProps } };
        }
        if (item.children) {
          return { ...item, children: updateRecursive(item.children) };
        }
        return item;
      });
    };
    setComponents(prev => updateRecursive(prev));
  };

  const deleteComponent = (id) => {
    const deleteRecursive = (items) => {
      return items.filter(item => {
        if (item.id === id) return false;
        if (item.children) {
          item.children = deleteRecursive(item.children);
        }
        return true;
      });
    };
    setComponents(prev => deleteRecursive(prev));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateComponent = (id) => {
    let duplicated = null;
    const findAndDuplicate = (items) => {
      return items.map(item => {
        if (item.id === id) {
          duplicated = {
            ...item,
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
            children: item.children ? JSON.parse(JSON.stringify(item.children)) : []
          };
          return item;
        }
        if (item.children) {
          item.children = findAndDuplicate(item.children);
        }
        return item;
      });
    };
    setComponents(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      findAndDuplicate(copy);
      if (duplicated) return [...prev, duplicated];
      return prev;
    });
  };

  const findComponentById = (items, id) => {
    if (!items) return null;
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findComponentById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const getWindows = () => {
    const findWindows = (items) => {
      let wins = [];
      for (const c of items) {
        if (c.type === 'Window') wins.push(c);
        if (c.children) wins = wins.concat(findWindows(c.children));
      }
      return wins;
    };
    return findWindows(components);
  };

  const newProject = () => {
    const newId = `proj_${Date.now().toString(36)}`;
    const proj = { id: newId, name: `Project ${newId.slice(-6)}` };
    setCurrentProject(proj);
    setComponents([]);
    setSelectedId(null);
    setActiveWindow(null);
    setDatabase({ tables: [], data: {} });
    setShowProjects(false);
    setTimeout(() => {
      localStorage.setItem(`nanostudio_project_${newId}`, JSON.stringify({
        name: proj.name, theme, viewMode, components: [], activeWindow: null, database: { tables: [], data: {} }, modified: new Date().toISOString()
      }));
      localStorage.setItem('nanostudio_current_project', JSON.stringify(proj));
    }, 0);
  };

  const loadProject = (projectId) => {
    setCurrentProject({ id: projectId, name: projectId });
    setShowProjects(false);
  };

  const deleteProject = (projectId) => {
    localStorage.removeItem(`nanostudio_project_${projectId}`);
    if (currentProject.id === projectId) {
      const projects = getProjectList();
      if (projects.length > 0) {
        loadProject(projects[0].id);
      } else {
        newProject();
      }
    }
  };

  const renameProject = (projectId, newName) => {
    const key = `nanostudio_project_${projectId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const data = JSON.parse(saved);
      data.name = newName;
      localStorage.setItem(key, JSON.stringify(data));
    }
    if (currentProject.id === projectId) {
      setCurrentProject(prev => ({ ...prev, name: newName }));
    }
  };

  const getProjectList = () => {
    const projects = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('nanostudio_project_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          projects.push({
            id: key.replace('nanostudio_project_', ''),
            name: data.name || key.replace('nanostudio_project_', ''),
            modified: data.modified ? new Date(data.modified).toLocaleString() : 'N/A'
          });
        } catch(e) {}
      }
    }
    return projects;
  };

  const countComponents = (comps) => {
    let count = 0;
    for (const c of comps) {
      count++;
      if (c.children) count += countComponents(c.children);
    }
    return count;
  };

  const exportHTML = () => {
    const currentTheme = THEMES[theme];
    const html = generateHTML(components, currentTheme, activeWindow, database);
    const blob = new Blob([html], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentProject.name}.html`;
    link.click();
  };

  const generateHTML = (comps, t, activeWin, db) => {
    const windows = comps.filter(c => c.type === 'Window');
    const genId = (id) => `el_${id.slice(-8)}`;

    const renderComponent = (comp) => {
      const p = comp.props;
      const id = genId(comp.id);
      const txtColor = p.textColor || t.text;
      const bgColor = p.bgColor || 'transparent';
      const borderColor = p.borderColor || t.border;

      switch(comp.type) {
        case 'Window':
          const isHidden = activeWin && comp.id !== activeWin;
          return `<div id="${id}" class="tui-window" data-window-id="${comp.id}" style="${isHidden ? 'display:none;' : ''}width:${p.width}px;${p.height ? `height:${p.height}px;` : ''}background:${p.bgColor || t.bg};border:2px solid ${p.borderColor || t.border};margin:16px auto">
            <div class="tui-titlebar" style="background:${t.selected};border-bottom:1px solid ${p.borderColor || t.border};padding:6px 12px;color:${t.accent}">${p.title}</div>
            <div class="tui-content" style="padding:16px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px">${(comp.children || []).map(c => renderComponent(c)).join('')}</div>
          </div>`;
        case 'Frame': {
          const bs = p.borderStyle === 'double' ? '3px double' : p.borderStyle === 'dashed' ? '1px dashed' : '1px solid';
          const hStyle = p.height && p.height !== '' && p.height !== 'auto' ? `height:${p.height}px;` : '';
          return `<fieldset id="${id}" class="tui-frame" style="border:${bs} ${p.borderColor || t.border};padding:12px;margin:8px 0;width:${p.width}px;${hStyle}background:${p.bgColor || 'transparent'}">
            <legend style="color:${p.textColor || t.accent};padding:0 8px">${p.title}</legend>
            <div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px">${(comp.children || []).map(c => renderComponent(c)).join('')}</div>
          </fieldset>`;
        }
        case 'Button': {
          const actionJs = p.action === 'navigate' ? `onclick="navigateTo('${p.targetWindow}')"` :
                          p.action === 'email' ? `onclick="location.href='mailto:${p.actionValue}'"` :
                          p.action === 'external' ? `onclick="window.open('${p.actionValue}','_blank')"` :
                          p.action === 'alert' ? `onclick="alert('${p.text}')"` : '';
          return `<button id="${id}" class="tui-btn" ${actionJs} style="width:${p.width}px;background:${p.bgColor || 'transparent'};border:1px solid ${p.borderColor || t.text};color:${p.textColor || t.text};padding:4px 12px;font-family:monospace;cursor:pointer">${p.text}</button>`;
        }
        case 'Label': {
          const content = p.linkUrl ? `<a href="${p.linkUrl}" target="_blank" style="color:${txtColor};text-decoration:underline">${p.text}</a>` : p.text;
          return `<span id="${id}" class="tui-label" style="color:${txtColor};font-size:${p.fontSize || 12}px;text-align:${p.alignment || 'left'}">${content}</span>`;
        }
        case 'TextBox':
          return `<input id="${id}" type="${p.inputType || 'text'}" placeholder="${p.placeholder}" ${p.readOnly ? 'readonly' : ''} ${p.maxLength > 0 ? `maxlength="${p.maxLength}"` : ''} style="width:${p.width}px;background:${p.bgColor || '#000'};border:1px solid ${p.borderColor || t.text};color:${txtColor};padding:4px 8px;font-family:monospace">`;
        case 'CheckBox':
          return `<label id="${id}" class="tui-check" style="color:${txtColor};display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ${p.checked ? 'checked' : ''}> ${p.text}</label>`;
        case 'RadioButton':
          return `<label id="${id}" class="tui-radio" style="color:${txtColor};display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="${p.group}" ${p.checked ? 'checked' : ''}> ${p.text}</label>`;
        case 'ComboBox':
          return `<select id="${id}" class="tui-select" style="width:${p.width}px;background:${p.bgColor || '#000'};border:1px solid ${p.borderColor || t.text};color:${txtColor};padding:4px;font-family:monospace">
            ${(p.items || []).map((item, i) => `<option ${i === (p.selectedIndex || 0) ? 'selected' : ''}>${item}</option>`).join('')}
          </select>`;
        case 'ListBox':
          return `<select id="${id}" class="tui-list" multiple size="4" style="width:${p.width}px;height:${p.height}px;background:${p.bgColor || '#000'};border:1px solid ${p.borderColor || t.text};color:${txtColor};padding:4px;font-family:monospace">
            ${(p.items || []).map(item => `<option>${item}</option>`).join('')}
          </select>`;
        case 'HScrollBar':
          return `<div id="${id}" class="tui-scroll-h" style="width:${p.width}px;height:12px;background:${p.bgColor || '#000'};border:1px solid ${t.border}"><div style="width:${((p.value - p.min) / (p.max - p.min)) * 100}%;height:100%;background:${p.thumbColor || t.text};opacity:0.5"></div></div>`;
        case 'VScrollBar':
          return `<div id="${id}" class="tui-scroll-v" style="width:12px;height:${p.height}px;background:${p.bgColor || '#000'};border:1px solid ${t.border}"><div style="height:${((p.value - p.min) / (p.max - p.min)) * 100}%;width:100%;background:${p.thumbColor || t.text};opacity:0.5"></div></div>`;
        case 'Timer':
          return '';
        case 'PictureBox':
          return `<div id="${id}" class="tui-picbox" style="width:${p.width}px;height:${p.height}px;border:${p.border ? `1px solid ${p.borderColor || t.border}` : 'none'};background:${t.bg};display:flex;align-items:center;justify-content:center">${(comp.children || []).map(c => renderComponent(c)).join('')}</div>`;
        case 'Shape': {
          const ss = `width:${p.width}px;height:${p.height}px;border:1px solid ${p.borderColor || t.text};background:${p.fill ? (p.bgColor || p.borderColor || t.text) : 'transparent'};display:inline-block;${p.shapeType === 'circle' ? 'border-radius:50%;' : ''}`;
          return `<div id="${id}" class="tui-shp" style="${ss}"></div>`;
        }
        case 'Line': {
          if (p.fullWidth) {
            return `<div id="${id}" class="tui-line" style="width:${p.widthPercent}%;height:${p.thickness || 1}px;background:${p.color || t.text};margin:4px 0"></div>`;
          }
          return `<div id="${id}" class="tui-line" style="width:100px;height:${p.thickness || 1}px;background:${p.color || t.text};margin:4px 0"></div>`;
        }
        case 'Image':
          return p.src ?
            `<img id="${id}" class="tui-img" src="${p.src}" alt="${p.alt}" style="width:${p.width}px;height:${p.height}px;border:1px solid ${t.border}">` :
            `<div id="${id}" class="tui-img" style="width:${p.width}px;height:${p.height}px;border:1px solid ${t.border};display:flex;align-items:center;justify-content:center;background:${t.bg}"><span style="font-size:9px;color:${t.textDim}">[IMG]</span></div>`;
        case 'Data':
          return `<div id="${id}" class="tui-data" style="color:${t.textDim};font-size:11px;padding:4px 8px;border:1px dashed var(--border)">[Data: ${p.tableName || 'none'}]</div>`;
        default:
          return `<div id="${id}" style="border:1px solid ${t.border};padding:8px">[${comp.type}]</div>`;
      }
    };

    const navScript = windows.length > 1 ? `
function navigateTo(wid){document.querySelectorAll('.tui-window').forEach(function(w){w.style.display='none'});var t=document.querySelector('[data-window-id="'+wid+'"]');if(t)t.style.display='block';}` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${currentProject.name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:${t.bg};--text:${t.text};--border:${t.border};--accent:${t.accent};--selected:${t.selected};--text-dim:${t.textDim}}
body{background:${t.bg};background-image:url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='2' height='2' fill='%23${t.text.slice(1)}' opacity='0.06'/%3E%3Crect x='4' y='4' width='2' height='2' fill='%23${t.text.slice(1)}' opacity='0.06'/%3E%3C/svg%3E");font-family:'Courier New',monospace;color:${t.text}}
.tui-window{margin:16px auto;box-shadow:0 0 10px rgba(0,255,0,0.1)}
.tui-btn:hover{background:${t.text}!important;color:${t.bg}!important}
.tui-container{display:flex;align-items:flex-start;justify-content:center;min-height:100vh;padding:20px}
.tui-content{max-width:1200px;width:100%}
</style>
</head>
<body>
<div class="tui-container">
${comps.map(c => renderComponent(c)).join('\n')}
</div>
<script>${navScript}<\/script>
</body>
</html>`;
  };

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
          <Toolbox onAddComponent={addComponent} />
          <Canvas
            components={components}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteComponent}
            onDuplicate={duplicateComponent}
            viewMode={viewMode}
            onAddComponent={addComponent}
            activeWindow={activeWindow}
            setActiveWindow={setActiveWindow}
            theme={theme}
          />
          <Inspector
            component={findComponentById(components, selectedId)}
            onUpdate={updateComponent}
            onDelete={() => selectedId && deleteComponent(selectedId)}
            onDuplicate={() => selectedId && duplicateComponent(selectedId)}
            windows={getWindows()}
            database={database}
          />
        </div>

        <div className="status-bar">
          <span>{currentProject.name}</span>
          <span>{countComponents(components)} components</span>
          <span>{viewMode === 'desktop' ? 'Desktop' : 'Mobile'}</span>
          <span>Theme: {THEMES[theme]?.name}</span>
          <span className={`save-status ${saveStatus === 'Saved' ? 'saved' : saveStatus === 'Saving...' ? 'saving' : ''}`}>{saveStatus}</span>
        </div>

        {showProjects && (
          <div className="projects-overlay" onClick={() => setShowProjects(false)}>
            <div className="projects-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-titlebar">
                <span className="modal-title">[ Project Manager ]</span>
                <button className="modal-close" onClick={() => setShowProjects(false)}>X</button>
              </div>
              <div className="modal-body">
                <button className="modal-action-btn" onClick={newProject}>+ New Project</button>
                <div className="modal-divider" />
                <h3 style={{ fontSize: 11, marginBottom: 8, color: 'var(--accent)' }}>Saved Projects:</h3>
                {getProjectList().length === 0 && (
                  <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>No projects</div>
                )}
                {getProjectList().map(proj => (
                  <div key={proj.id} className="project-item">
                    <div className="project-name-cell" onClick={(e) => e.stopPropagation()}>
                      <EditableText value={proj.name} onSave={(n) => renameProject(proj.id, n)} />
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
          <DatabasePanel
            database={database}
            setDatabase={setDatabase}
            onClose={() => setShowDatabase(false)}
            triggerSave={triggerSave}
          />
        )}
      </div>
    </DndProvider>
  );
}

function EditableText({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setEditing(false); if (text.trim()) onSave(text.trim()); else setText(value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); if (text.trim()) onSave(text.trim()); } if (e.key === 'Escape') { setEditing(false); setText(value); } }}
        className="editable-input"
      />
    );
  }

  return <div onClick={() => setEditing(true)} style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 'bold' }}>{value}</div>;
}

export default App;
