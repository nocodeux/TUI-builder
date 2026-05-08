/**
 * App.jsx — Data model with rows for layout
 *
 * MAIN CHANGES:
 * - `components` is now `rows`: array of { id, layout, children }
 * - addComponent → addToRow(type, rowId, index)
 * - addNewRow(type, existingItem, afterIndex) → creates a new row
 * - moveComponent(item, toRowId, toIndex) → reorders existing components
 * - Canvas and Inspector receive updated `rows` and handlers
 * - Inspector shows AutoLayout controls when a ROW is selected
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Toolbox from './components/Toolbox';
import Canvas from './components/Canvas';
import Inspector from './components/Inspector';
import DatabasePanel from './components/DatabasePanel';
import './App.css';
import appCss from './App.css?raw';

const THEMES = {
  'theme-nano': { name: 'Nano', bg: '#000000', panelBg: '#000000', border: '#00aa00', text: '#00ff00', textDim: '#008800', accent: '#ffff00', selected: '#003300' },
  'theme-bios': { name: 'BIOS', bg: '#0000aa', panelBg: '#0000aa', border: '#aaaaaa', text: '#ffffff', textDim: '#cccccc', accent: '#ffff00', selected: '#000088' },
  'theme-retro': { name: 'Retro', bg: '#0a0a0a', panelBg: '#0c0c0c', border: '#2a5a2a', text: '#33ff33', textDim: '#1a7a1a', accent: '#ffaa00', selected: '#1e3a1e' },
  'theme-amber': { name: 'Amber', bg: '#0a0800', panelBg: '#0d0a00', border: '#aa7700', text: '#ffb000', textDim: '#886600', accent: '#ffcc00', selected: '#332200' }
};

const DEFAULT_LAYOUT = {
  direction: 'row', gap: 8, align: 'flex-start', justify: 'flex-start', wrap: false,
  paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, paddingLinked: true,
};

const mkId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

function App() {
  const [screens, setScreens] = useState([
    { id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }
  ]);
  const [currentScreenId, setCurrentScreenId] = useState('screen-1');
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('desktop');
  const [theme, setTheme] = useState(() => localStorage.getItem('nanostudio_theme') || 'theme-nano');
  const [showUserJourney, setShowUserJourney] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showDatabase, setShowDatabase] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [builderName, setBuilderName] = useState(() => localStorage.getItem('nanostudio_builder_name') || 'TUI Builder');
  const [currentProject, setCurrentProject] = useState(() => {
    const saved = localStorage.getItem('nanostudio_current_project');
    return saved ? JSON.parse(saved) : { id: 'default', name: 'Untitled' };
  });
  const [saveStatus, setSaveStatus] = useState('');
  const [activeWindow, setActiveWindow] = useState(null);
  const [database, setDatabase] = useState({ tables: [], data: {} });
  const [canvasPadding, setCanvasPadding] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
  const [downloadLink, setDownloadLink] = useState(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('nanostudio_api_key') || '');
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('nanostudio_api_url') || '');

  const isInitialLoading = useRef(true);
  // ── Persistencia ──────────────────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    if (isInitialLoading.current) return;
    setSaveStatus('Saving...');
    requestAnimationFrame(() => {
      const projectData = { 
        name: currentProject.name, 
        theme, 
        viewMode, 
        screens, 
        currentScreenId,
        activeWindow, 
        database, 
        modified: new Date().toISOString() 
      };
      localStorage.setItem(`nanostudio_project_${currentProject.id}`, JSON.stringify(projectData));
      localStorage.setItem('nanostudio_current_project', JSON.stringify(currentProject));
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 800);
    });
  }, [screens, currentScreenId, database, currentProject, theme, viewMode, activeWindow]);

  // Helper to get active screen
  const activeScreen = screens.find(s => s.id === currentScreenId) || screens[0];
  const rows = activeScreen.rows;

  // Wrapped setRows to update the active screen in the screens array
  const setRows = useCallback((newRowsOrFn) => {
    setScreens(prev => prev.map(s => {
      if (s.id === currentScreenId) {
        const nextRows = typeof newRowsOrFn === 'function' ? newRowsOrFn(s.rows) : newRowsOrFn;
        return { ...s, rows: nextRows };
      }
      return s;
    }));
  }, [currentScreenId]);

  const moveScreen = useCallback((dragIndex, hoverIndex) => {
    setScreens(prev => {
      const next = [...prev];
      const [dragged] = next.splice(dragIndex, 1);
      next.splice(hoverIndex, 0, dragged);
      return next;
    });
  }, []);

  const addScreen = useCallback(() => {
    const newScreen = { id: mkId(), name: `Screen ${screens.length + 1}`, rows: [], settings: { timeout: 0, nextScreenId: null } };
    setScreens(prev => [...prev, newScreen]);
    setCurrentScreenId(newScreen.id);
  }, [screens.length]);

  const deleteScreen = useCallback((id) => {
    if (screens.length <= 1) return;
    const targetScreen = screens.find(s => s.id === id);
    if (targetScreen && targetScreen.rows.length > 0) {
      setConfirmModal({
        title: 'DELETE SCREEN',
        message: `The screen "${targetScreen.name}" has elements. Are you sure you want to delete it?`,
        confirmText: 'Delete screen',
        onConfirm: () => {
          setScreens(prev => {
            const next = prev.filter(s => s.id !== id);
            if (currentScreenId === id) setCurrentScreenId(next[0].id);
            return next;
          });
          setConfirmModal(null);
        }
      });
      return;
    }
    setScreens(prev => {
      const next = prev.filter(s => s.id !== id);
      if (currentScreenId === id) setCurrentScreenId(next[0].id);
      return next;
    });
  }, [screens, currentScreenId]);

  const updateScreen = useCallback((id, updates) => {
    setScreens(prev => prev.map(s => {
      if (s.id === id) {
        if (updates.settings) {
          return { ...s, settings: { ...(s.settings || {}), ...updates.settings } };
        }
        return { ...s, ...updates };
      }
      return s;
    }));
  }, []);

  // ── Color Migration for Existing Components ──────────────────────────────
  useEffect(() => {
    const cleanProps = (props) => {
      const next = { ...props };
      const targets = ['textColor', 'borderColor', 'bgColor', 'color', 'thumbColor', 'iconColor'];
      targets.forEach(key => {
        const val = String(next[key] || '').toLowerCase();
        // If it matches the old hardcoded defaults, clear it so it uses the theme variables
        if (val === '#00ff00' || val === '#000000' || val === 'transparent' || val === 'rgba(0,0,0,0)') {
           next[key] = '';
        }
      });
      return next;
    };

    const cleanComps = (comps) => comps.map(c => ({
      ...c,
      props: cleanProps(c.props),
      children: c.children ? cleanComps(c.children) : []
    }));

    const cleanRows = (rs) => rs.map(r => ({
      ...r,
      props: r.props ? cleanProps(r.props) : {},
      children: r.children ? cleanComps(r.children) : []
    }));

    // Perform one-time migration of existing rows to remove hardcoded green/black defaults
    setRows(prev => cleanRows(prev));
  }, []);

  // ── Defaults by type ────────────────────────────────────────────────────
  const getDefaultProps = type => ({
    Window: { title: 'Window1', width: 400, height: '', bgColor: '', textColor: '', borderColor: '', layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Frame: { title: 'Frame1', width: 300, height: '', borderStyle: 'single', bgColor: '', textColor: '', borderColor: '', fontSize: 12, alignment: 'left', layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Row: { layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Button: { text: 'Button1', bgColor: '', textColor: '', borderColor: '', width: 80, disabled: false, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Text: { text: 'Text', textColor: '', fontSize: 12, alignment: 'left', linkUrl: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    Input: { label: '', placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '', borderColor: '', bgColor: '', inputType: 'text', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    TextBox: { label: '', placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '', borderColor: '', bgColor: '', inputType: 'text', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    CheckBox: { text: 'CheckBox1', checked: false, textColor: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    RadioButton: { text: 'Option1', checked: false, group: 'group1', textColor: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    ComboBox: { items: ['Option 1', 'Option 2', 'Option 3'], width: 150, selectedIndex: 0, textColor: '', borderColor: '', bgColor: '', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    ListBox: { items: ['Item 1', 'Item 2', 'Item 3'], width: 150, height: 100, multiSelect: false, textColor: '', borderColor: '', bgColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    HScrollBar: { value: 50, min: 0, max: 100, width: 150, bgColor: '', thumbColor: '', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    VScrollBar: { value: 50, min: 0, max: 100, height: 100, bgColor: '', thumbColor: '', sizing: { widthMode: 'hug', heightMode: 'fixed' } },
    Timer: { interval: 1000, enabled: false, sizing: { widthMode: 'hug', heightMode: 'hug' } },
    PictureBox: { width: 150, height: 100, stretch: false, border: true, borderColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    Shape: { shapeType: 'rectangle', width: 60, height: 40, borderColor: '', bgColor: '', fill: false, sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    Line: { color: '', thickness: 1, fullWidth: true, widthPercent: 100, lineStyle: 'solid', sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Image: { src: '', width: 80, height: 80, alt: 'Image', iconSrc: '', iconColor: '', borderThickness: 1, borderColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    Table: {
      columns: [
        { name: 'ID', type: 'number', width: 60 },
        { name: 'Name', type: 'text', width: 120 },
        { name: 'Status', type: 'text', width: 80 },
      ],
      rows: [
        { ID: 1, Name: 'Item 1', Status: 'Active' },
      ],
      width: 400,
      height: 200,
      showHeaders: true,
      stripedRows: true,
      borderColor: '',
      textColor: '',
      headerBgColor: '',
      dataSource: '',
      dataSourceType: 'manual',
      sizing: { widthMode: 'fixed', heightMode: 'fixed' },
    },
    Data: { tableName: '', dataSource: 'sqlite', query: '', sizing: { widthMode: 'hug', heightMode: 'hug' } }
  }[type] || { text: type });

  const mkComp = type => {
    const canonicalType = (type === 'TextBox' ? 'Input' : (type === 'Label' ? 'Text' : type));
    return { id: mkId(), type: canonicalType, props: getDefaultProps(canonicalType), children: [] };
  };

  // ── Recursive helpers ────────────────────────────────────────────────────
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
    comps.map(c => {
      if (c.id === id) {
        const layoutKeys = ['direction', 'gap', 'align', 'justify', 'wrap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingLinked'];
        const hasLayoutKeys = Object.keys(newProps).some(key => layoutKeys.includes(key));
        const nextProps = { ...c.props };

        // Handle sizing updates
        if (newProps.sizing) {
          nextProps.sizing = { ...(c.props?.sizing || {}), ...newProps.sizing };
        }

        // Copy non-layout, non-sizing props
        Object.keys(newProps).forEach(key => {
          if (!layoutKeys.includes(key) && key !== 'sizing') {
            nextProps[key] = newProps[key];
          }
        });

        if (hasLayoutKeys) {
          nextProps.layout = {
            ...(c.props?.layout || DEFAULT_LAYOUT),
            ...layoutKeys.reduce((acc, key) => {
              if (newProps[key] !== undefined) acc[key] = newProps[key];
              return acc;
            }, {})
          };
        }

        return { ...c, props: nextProps };
      }

      return { ...c, children: c.children ? updateCompRecursive(c.children, id, newProps) : c.children };
    });

  const deleteCompRecursive = (comps, id) =>
    comps.filter(c => c.id !== id).map(c => ({ ...c, children: c.children ? deleteCompRecursive(c.children, id) : c.children }));

  const addToCompChildren = (comps, parentId, newComp, index = null) => {
    console.log(`[addToCompChildren] Looking for ${parentId} in`, comps.map(c => c.id));
    return comps.map(c => {
      if (c.id === parentId) {
        const nextChildren = [...(c.children || [])];
        const insertAt = index === null ? nextChildren.length : Math.min(Math.max(index, 0), nextChildren.length);
        nextChildren.splice(insertAt, 0, newComp);
        return { ...c, children: nextChildren };
      }
      if (c.children && c.children.length > 0) {
        return { ...c, children: addToCompChildren(c.children, parentId, newComp, index) };
      }
      return c;
    });
  };

  const removeCompRecursive = (comps, id, parentId) => {
    for (let i = 0; i < comps.length; i += 1) {
      const comp = comps[i];
      if (comp.id === id) {
        const nextComps = [...comps];
        const [moved] = nextComps.splice(i, 1);
        return { comps: nextComps, moved, parentId, fromIndex: i };
      }

      if (comp.children?.length) {
        const nested = removeCompRecursive(comp.children, id, comp.id);
        if (nested.moved) {
          const nextComps = [...comps];
          nextComps[i] = { ...comp, children: nested.comps };
          return { comps: nextComps, moved: nested.moved, parentId: nested.parentId, fromIndex: nested.fromIndex };
        }
      }
    }

    return { comps, moved: null, parentId: null, fromIndex: -1 };
  };

  const removeCompFromRows = (rowsArr, id) => {
    for (let i = 0; i < rowsArr.length; i += 1) {
      const row = rowsArr[i];
      const nested = removeCompRecursive(row.children, id, row.id);
      if (nested.moved) {
        const nextRows = [...rowsArr];
        nextRows[i] = { ...row, children: nested.comps };
        return { rows: nextRows, moved: nested.moved, parentId: nested.parentId, fromIndex: nested.fromIndex };
      }
    }

    return { rows: rowsArr, moved: null, parentId: null, fromIndex: -1 };
  };

  const insertIntoComps = (comps, targetId, movedComp, index) => {
    for (let i = 0; i < comps.length; i += 1) {
      const comp = comps[i];
      if (comp.id === targetId) {
        const nextChildren = [...(comp.children || [])];
        const insertAt = Math.min(Math.max(index, 0), nextChildren.length);
        nextChildren.splice(insertAt, 0, movedComp);
        const nextComps = [...comps];
        nextComps[i] = { ...comp, children: nextChildren };
        return { comps: nextComps, inserted: true };
      }

      if (comp.children?.length) {
        const nested = insertIntoComps(comp.children, targetId, movedComp, index);
        if (nested.inserted) {
          const nextComps = [...comps];
          nextComps[i] = { ...comp, children: nested.comps };
          return { comps: nextComps, inserted: true };
        }
      }
    }

    return { comps, inserted: false };
  };

  const insertIntoRows = (rowsArr, targetId, movedComp, index) => {
    for (let i = 0; i < rowsArr.length; i += 1) {
      const row = rowsArr[i];
      if (row.id === targetId) {
        const nextChildren = [...row.children];
        const insertAt = Math.min(Math.max(index, 0), nextChildren.length);
        nextChildren.splice(insertAt, 0, movedComp);
        const nextRows = [...rowsArr];
        nextRows[i] = { ...row, children: nextChildren };
        return { rows: nextRows, inserted: true };
      }

      const nested = insertIntoComps(row.children, targetId, movedComp, index);
      if (nested.inserted) {
        const nextRows = [...rowsArr];
        nextRows[i] = { ...row, children: nested.comps };
        return { rows: nextRows, inserted: true };
      }
    }

    return { rows: rowsArr, inserted: false };
  };

  const subtreeContainsId = (comp, targetId) => {
    if (!comp || !targetId) return false;
    if (comp.id === targetId) return true;
    return (comp.children || []).some(child => subtreeContainsId(child, targetId));
  };

  const normalizeComponentTree = (comps = []) => comps.map(comp => {
    const canonicalType = comp.type === 'TextBox' ? 'Input' : comp.type;
    const baseProps = getDefaultProps(canonicalType);
    const normalizedProps = { ...baseProps, ...(comp.props || {}) };

    if (['Window', 'Frame', 'Row'].includes(canonicalType)) {
      normalizedProps.layout = {
        ...DEFAULT_LAYOUT,
        ...(baseProps.layout || {}),
        ...(comp.props?.layout || {})
      };
    }

    const cleanColor = (val) => {
      if (!val) return '';
      const low = String(val).toLowerCase();
      if (low === '#00ff00' || low === '#000000' || low === 'transparent' || low === 'rgba(0,0,0,0)') return '';
      return val;
    };

    const colorKeys = ['textColor', 'borderColor', 'bgColor', 'color', 'thumbColor', 'iconColor'];
    colorKeys.forEach(k => {
      if (normalizedProps[k] !== undefined) {
        normalizedProps[k] = cleanColor(normalizedProps[k]);
      }
    });

    return {
      ...comp,
      type: canonicalType,
      props: normalizedProps,
      children: normalizeComponentTree(comp.children || [])
    };
  });

  const normalizeRows = (rowsArr = []) => rowsArr.map(row => ({
    ...row,
    layout: { ...DEFAULT_LAYOUT, ...(row.layout || {}) },
    children: normalizeComponentTree(row.children || [])
  }));

  // ── Add component to existing row ─────────────────────────────────────────
  const addToRow = useCallback((type, rowId, index, parentContainerId = null) => {
    console.log(`🚀 [DEBUG] addToRow: screen=${currentScreenId}, row=${rowId}, parent=${parentContainerId}, type=${type}`);
    const newComp = mkComp(type);
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      if (parentContainerId) {
        return { ...row, children: addToCompChildren(row.children, parentContainerId, newComp, index) };
      }
      const newChildren = [...row.children];
      newChildren.splice(index, 0, newComp);
      return { ...row, children: newChildren };
    }));
    setSelectedId(newComp.id);
  }, [setRows]);

  // ── Create new row ────────────────────────────────────────────────────────
  const addNewRow = useCallback((type, existingItem = null, afterIndex = null, targetScreenId = currentScreenId) => {
    const newRow = { id: mkId(), layout: { ...DEFAULT_LAYOUT }, children: [] };
    if (type) {
      newRow.children = [mkComp(type)];
    }
    setScreens(prevScreens => prevScreens.map(s => {
      if (s.id === targetScreenId) {
        const currentRows = s.rows;
        if (afterIndex !== null) {
          const next = [...currentRows];
          next.splice(afterIndex, 0, newRow);
          return { ...s, rows: next };
        }
        return { ...s, rows: [...currentRows, newRow] };
      }
      return s;
    }));
    if (newRow.children.length > 0) setSelectedId(newRow.children[0].id);
    else setSelectedId(newRow.id);
  }, [currentScreenId]);

  // ── Move existing component ───────────────────────────────────────────────
  const moveComponent = useCallback((item, toRowId, toIndex, newRowAfter = null) => {
    setRows(prev => {
      const source = findInRows(prev, item.id);
      if (!source || !source.type) return prev;

      if (item.id === toRowId || subtreeContainsId(source, toRowId)) {
        return prev;
      }

      const removed = removeCompFromRows(prev, item.id);
      if (!removed.moved) return prev;

      if (toRowId === '__newrow__') {
        // Crear nueva fila con este componente
        const newRow = { id: mkId(), layout: { ...DEFAULT_LAYOUT }, children: [removed.moved] };
        const result = [...removed.rows];
        result.splice(newRowAfter ?? result.length, 0, newRow);
        return result;
      }

      if (removed.parentId === toRowId && (toIndex === removed.fromIndex || toIndex === removed.fromIndex + 1)) {
        return prev;
      }

      const adjustedIndex = removed.parentId === toRowId && toIndex > removed.fromIndex ? toIndex - 1 : toIndex;
      const inserted = insertIntoRows(removed.rows, toRowId, removed.moved, adjustedIndex);
      return inserted.inserted ? inserted.rows : prev;
    });
  }, [findInRows]);

  // ── Update component props ────────────────────────────────────────────────
  const updateComponent = useCallback((id, newProps) => {
    setRows(prev => prev.map(row => {
      if (row.id === id) {
        // It's a row — update its layout (includes padding now)
        return { ...row, layout: { ...(row.layout || DEFAULT_LAYOUT), ...newProps } };
      }
      return { ...row, children: updateCompRecursive(row.children, id, newProps) };
    }));
    triggerSave();
  }, [triggerSave]);

  // ── Delete component ───────────────────────────────────────────────────────
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

  // ── Duplicate component ────────────────────────────────────────────────────
  const duplicateComponent = useCallback((id) => {
    let newSelectedId = null;

    const cloneTree = (node) => ({
      ...node,
      id: mkId(),
      children: (node.children || []).map(cloneTree)
    });

    const duplicateTree = (comps) => comps.flatMap(comp => {
      if (comp.id === id) {
        const duplicate = cloneTree(comp);
        newSelectedId = duplicate.id;
        return [comp, duplicate];
      }

      if (comp.children?.length) {
        return [{ ...comp, children: duplicateTree(comp.children) }];
      }

      return [comp];
    });

    setScreens(prev => prev.map(s => {
      if (s.id !== currentScreenId) return s;
      
      // Check if ID is a row
      const isRow = s.rows.some(r => r.id === id);
      if (isRow) {
        const nextRows = s.rows.flatMap(row => {
          if (row.id === id) {
            const duplicate = { ...row, id: mkId(), children: row.children.map(cloneTree) };
            newSelectedId = duplicate.id;
            return [row, duplicate];
          }
          return [row];
        });
        return { ...s, rows: nextRows };
      }

      // It's a component deep inside
      return { ...s, rows: s.rows.map(row => ({ ...row, children: duplicateTree(row.children) })) };
    }));

    if (newSelectedId) setSelectedId(newSelectedId);
  }, [currentScreenId]);

  // ── Seleccionar fila ──────────────────────────────────────────────────────
  const selectRow = useCallback((rowId) => {
    setSelectedId(rowId);
  }, []);

  // ── Find selected element ──────────────────────────────────────────────────
  const findSelected = () => {
    if (!selectedId) return null;
    return findInRows(rows, selectedId);
  };

  useEffect(() => {
    const handleShortcuts = (e) => {
      if (!selectedId) return;
      const tagName = e.target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
      if (e.key === 'Delete') {
        e.preventDefault();
        deleteComponent(selectedId);
      }
      if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateComponent(selectedId);
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [selectedId, deleteComponent, duplicateComponent]);



  useEffect(() => { localStorage.setItem('nanostudio_theme', theme); }, [theme]);
  useEffect(() => { 
    localStorage.setItem('nanostudio_builder_name', builderName); 
    document.title = builderName;
  }, [builderName]);

  useEffect(() => { localStorage.setItem('nanostudio_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('nanostudio_api_url', apiUrl); }, [apiUrl]);

  useEffect(() => {
    isInitialLoading.current = true;
    const saved = localStorage.getItem(`nanostudio_project_${currentProject.id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Migration: If it's the old format (rows only)
        if (data.rows && !data.screens) {
          const migratedScreens = [{ id: 'screen-1', name: 'Screen 1', rows: normalizeRows(data.rows), settings: { timeout: 0, nextScreenId: null } }];
          setScreens(migratedScreens);
          setCurrentScreenId('screen-1');
        } else if (data.screens && data.screens.length > 0) {
          setScreens(data.screens);
          setCurrentScreenId(data.currentScreenId || data.screens[0].id);
        } else {
          setScreens([{ id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }]);
          setCurrentScreenId('screen-1');
        }
        
        setTheme(data.theme || 'theme-nano');
        setViewMode(data.viewMode || 'desktop');
        setActiveWindow(data.activeWindow || null);
        setDatabase(data.database || { tables: [], data: {} });
      } catch(e) { 
        console.error("Load error:", e); 
        setScreens([{ id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }]);
        setCurrentScreenId('screen-1');
      }
    } else { 
      setScreens([{ id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }]);
      setCurrentScreenId('screen-1');
    }
    setSaveStatus('');
    // Allow saving after a short delay to ensure React has finished updating state
    setTimeout(() => { isInitialLoading.current = false; }, 500);
  }, [currentProject.id]);

  useEffect(() => { if (screens.length > 0 || currentProject.id !== 'default') triggerSave(); }, [screens, currentScreenId, triggerSave]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const countAll = (rowsArr) => rowsArr.reduce((acc, row) => acc + countComps(row.children), 0);
  const countComps = (comps) => comps.reduce((acc, c) => acc + 1 + (c.children ? countComps(c.children) : 0), 0);
  const collectByType = (comps, type) => comps.flatMap(comp => [
    ...(comp.type === type ? [comp] : []),
    ...collectByType(comp.children || [], type)
  ]);
  const getWindows = () => rows.flatMap(r => collectByType(r.children, 'Window'));

  const handleNavigate = useCallback((comp) => {
    const p = comp.props || {};
    if (p.action === 'screen' && p.targetScreenId) {
      setCurrentScreenId(p.targetScreenId);
      setSelectedId(null);
    } else if (p.action === 'navigate' && p.targetWindow) {
      setSelectedId(p.targetWindow);
    } else if (p.action === 'external' && p.href) {
      window.open(p.href, '_blank');
    } else if (p.action === 'email' && p.mailto) {
      window.location.href = `mailto:${p.mailto}`;
    }
  }, [setCurrentScreenId, setSelectedId]);

  const getProjectList = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('nanostudio_project_'));
    return keys.map(k => { try { const d = JSON.parse(localStorage.getItem(k)); return { id: k.replace('nanostudio_project_', ''), ...d }; } catch { return null; } }).filter(Boolean);
  };

  // ── Export HTML ───────────────────────────────────────────────────────────
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const styleObjToString = (styles) => {
    const unitless = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom', 'tabSize']);
    const camelToKebab = (str) => str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

    return Object.entries(styles)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        let cssValue = value;
        if (typeof cssValue === 'number' && cssValue !== 0 && !unitless.has(key)) {
          cssValue = `${cssValue}px`;
        }
        return `${camelToKebab(key)}:${cssValue}`;
      })
      .join(';');
  };

  const layoutToStyles = (layout = {}) => ({
    display: 'flex',
    flexDirection: layout.direction || 'row',
    gap: layout.gap !== '' && layout.gap != null ? `${layout.gap}px` : '8px',
    alignItems: layout.align || 'flex-start',
    justifyContent: layout.justify || 'flex-start',
    flexWrap: layout.wrap ? 'wrap' : 'nowrap',
    paddingTop: layout.paddingTop ? `${layout.paddingTop}px` : undefined,
    paddingRight: layout.paddingRight ? `${layout.paddingRight}px` : undefined,
    paddingBottom: layout.paddingBottom ? `${layout.paddingBottom}px` : undefined,
    paddingLeft: layout.paddingLeft ? `${layout.paddingLeft}px` : undefined,
  });

  const getThemeColor = (val, themeVar) => {
    if (!val) return `var(${themeVar})`;
    const low = String(val).toLowerCase();
    if (low === '#00ff00' || low === '#000000' || low === 'transparent') return `var(${themeVar})`;
    return val;
  };

  const renderComponentExport = (comp) => {
    const p = comp.props || {};
    const isWidthFill = p.sizing?.widthMode === 'fill';
    const isHeightFill = p.sizing?.heightMode === 'fill';
    const isWidthHug = p.sizing?.widthMode === 'hug';
    const isHeightHug = p.sizing?.heightMode === 'hug';

    const renderChildren = () => (comp.children || []).map(renderComponentExport).join('');

    const wrapComponent = (innerHtml) => {
      const wrapperStyle = {
        display: (isWidthFill || isHeightFill) ? 'flex' : 'inline-flex',
        flex: isWidthFill ? '1 1 0%' : '0 0 auto',
        alignSelf: (isWidthFill || isHeightFill) ? 'stretch' : 'auto',
        minWidth: 0,
        minHeight: 0,
        boxSizing: 'border-box',
        maxWidth: '100%',
      };
      return `<div class="export-wrapper" style="${styleObjToString(wrapperStyle)}">${innerHtml}</div>`;
    };

    switch (comp.type) {
      case 'Window': {
        const layoutStyles = layoutToStyles(p.layout);
        const paddedStyles = {
          ...layoutStyles,
          paddingTop: `${(parseInt(p.layout?.paddingTop) || 0) + 12}px`,
          paddingRight: `${(parseInt(p.layout?.paddingRight) || 0) + 12}px`,
          paddingBottom: `${(parseInt(p.layout?.paddingBottom) || 0) + 12}px`,
          paddingLeft: `${(parseInt(p.layout?.paddingLeft) || 0) + 12}px`,
        };
        
        let closeBtnHtml = '';
        if (p.showClose && p.closeNextScreenId) {
          closeBtnHtml = `<button class="retro-window-close" onclick="goToScreen('${p.closeNextScreenId}')">X</button>`;
        }

        const html = `<div class="retro-window" style="${styleObjToString({
          width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width ? `${p.width}px` : '100%')),
          minHeight: isHeightFill ? '100%' : (isHeightHug ? 'auto' : (p.height ? `${p.height}px` : '')),
          height: isHeightFill ? '100%' : (isHeightHug ? 'auto' : 'auto'),
          background: getThemeColor(p.bgColor, '--bg'),
          borderColor: getThemeColor(p.borderColor, '--border'),
        })}"><div class="retro-window-titlebar"><span class="retro-window-title" style="color:${getThemeColor(p.textColor, '--accent')}">${escapeHtml(p.title)}</span>${closeBtnHtml}</div><div class="retro-window-content" style="${styleObjToString(paddedStyles)}">${renderChildren()}</div></div>`;
        return wrapComponent(html);
      }
      case 'Frame': {
        const borderValue = p.borderStyle === 'double' ? '3px double' : p.borderStyle === 'dashed' ? '1px dashed' : '1px solid';
        const html = `<div class="retro-frame-wrapper" style="${styleObjToString({ 
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%'),
          height: isHeightFill ? '100%' : 'auto',
        })}"><fieldset class="retro-frame" style="${styleObjToString({
          border: `${borderValue} ${getThemeColor(p.borderColor, '--border')}`,
          background: p.bgColor || 'transparent',
          minHeight: isHeightFill ? '100%' : (p.height ? `${p.height}px` : 'auto'),
          height: isHeightFill ? '100%' : 'auto',
        })}"><legend style="color:${getThemeColor(p.textColor, '--accent')};font-size:${p.fontSize||12}px;text-align:${p.alignment||'left'};">${escapeHtml(p.title)}</legend><div class="retro-frame-content" style="${styleObjToString(layoutToStyles(p.layout))}">${renderChildren()}</div></fieldset></div>`;
        return wrapComponent(html);
      }
      case 'Row': {
        const html = `<div class="retro-row" style="${styleObjToString({
          ...layoutToStyles(p.layout),
          width: isWidthFill ? '100%' : (p.width ? (typeof p.width === 'string' ? p.width : `${p.width}px`) : '100%'),
          minHeight: isHeightFill ? '100%' : (p.height ? (typeof p.height === 'string' ? p.height : `${p.height}px`) : '32px'),
          height: isHeightFill ? '100%' : 'auto',
        })}">${renderChildren()}</div>`;
        return wrapComponent(html);
      }
      case 'Button': {
        const btnStyle = styleObjToString({
          width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width ? `${p.width}px` : 'auto')),
          background: getThemeColor(p.bgColor, '--bg'),
          color: getThemeColor(p.textColor, '--text'),
          borderColor: getThemeColor(p.borderColor, '--text'),
          cursor: p.disabled ? 'not-allowed' : 'pointer',
          opacity: p.disabled ? 0.6 : 1,
        });
        
        let onClickAttr = '';
        if (p.action === 'screen' && p.targetScreenId) {
          onClickAttr = `onclick="goToScreen('${p.targetScreenId}')"`;
        } else if (p.action === 'navigate' && p.targetWindow) {
          onClickAttr = `onclick="document.getElementById('${p.targetWindow}')?.scrollIntoView({behavior:'smooth'})"`;
        } else if (p.action === 'external' && p.href) {
          onClickAttr = `onclick="window.open('${escapeHtml(p.href)}','_blank')"`;
        } else if (p.action === 'email' && p.mailto) {
          onClickAttr = `onclick="location.href='mailto:${escapeHtml(p.mailto)}'"`
        }

        return wrapComponent(`<button class="retro-button" style="${btnStyle}" ${onClickAttr} ${p.disabled ? 'disabled' : ''}>${escapeHtml(p.text)}</button>`);
      }
      case 'Text':
      case 'Label': {
        const textAlign = p.alignment || 'left';
        
        // Helper to convert [tag] to <tag> for export (multiline support)
        const formatForExport = (txt) => {
          if (!txt) return '';
          return escapeHtml(txt)
            .replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<strong>$1</strong>')
            .replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<em>$1</em>')
            .replace(/\[u\]([\s\S]*?)\[\/u\]/g, '<u style="text-decoration:underline;">$1</u>')
            .replace(/\[s\]([\s\S]*?)\[\/s\]/g, '<s style="text-decoration:line-through;">$1</s>')
            .replace(/\[sup\]([\s\S]*?)\[\/sup\]/g, '<sup>$1</sup>')
            .replace(/\[sub\]([\s\S]*?)\[\/sub\]/g, '<sub>$1</sub>');
        };

        const style = styleObjToString({
          fontSize: p.fontSize || 12,
          textAlign,
          justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: getThemeColor(p.textColor, '--text'),
          display: 'inline-block',
          width: isWidthFill ? '100%' : 'auto'
        });

        const innerContent = formatForExport(p.text);
        const html = p.linkUrl 
          ? `<a href="${escapeHtml(p.linkUrl)}" target="_blank" style="text-decoration:none; display:inline-block; width:${isWidthFill?'100%':'auto'};">${wrapComponent(`<span style="${style}">${innerContent}</span>`)}</a>`
          : wrapComponent(`<span style="${style}">${innerContent}</span>`);
          
        return html;
      }
      case 'Input':
      case 'TextBox': {
        const inputHtml = `<input class="retro-textbox" type="${p.inputType || 'text'}" placeholder="${escapeHtml(p.placeholder)}" style="${styleObjToString({
          width: '100%',
          borderColor: getThemeColor(p.borderColor, '--text'),
          color: getThemeColor(p.textColor, '--text'),
          background: getThemeColor(p.bgColor, '--input-bg'),
        })}" ${p.readOnly ? 'readonly' : ''} ${p.disabled ? 'disabled' : ''} />`;

        const finalHtml = p.label 
          ? `<div class="property-group" style="width: ${isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%')};">
               <label>${escapeHtml(p.label)}</label>
               ${inputHtml}
             </div>`
          : inputHtml;

        return wrapComponent(finalHtml);
      }
      case 'CheckBox':
        return wrapComponent(`<label class="retro-checkbox" style="color:${getThemeColor(p.textColor, '--text')};"><input type="checkbox" ${p.checked ? 'checked' : ''} /><span>${escapeHtml(p.text)}</span></label>`);
      case 'RadioButton':
        return wrapComponent(`<label class="retro-radio" style="color:${getThemeColor(p.textColor, '--text')};"><input type="radio" name="${escapeHtml(p.group || 'group1')}" ${p.checked ? 'checked' : ''} /><span>${escapeHtml(p.text)}</span></label>`);
      case 'ComboBox': {
        const items = (p.items || []).map(item => `<option ${item === p.value ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
        return wrapComponent(`<select class="retro-select" style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '150px'),
          height: isHeightFill ? '100%' : 'auto',
          borderColor: getThemeColor(p.borderColor, '--border'),
          color: getThemeColor(p.textColor, '--text'),
          background: getThemeColor(p.bgColor, '--bg'),
        })}">${items}</select>`);
      }
      case 'ListBox': {
        const items = (p.items || []).map(item => `<option ${item === p.value ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
        return wrapComponent(`<select class="retro-listbox" ${p.multiSelect ? 'multiple' : ''} size="4" style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '150px'),
          height: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '100px'),
          borderColor: getThemeColor(p.borderColor, '--border'),
          color: getThemeColor(p.textColor, '--text'),
          background: getThemeColor(p.bgColor, '--bg'),
        })}">${items}</select>`);
      }
      case 'HScrollBar':
      case 'VScrollBar': {
        const isVertical = comp.type === 'VScrollBar';
        const barStyle = styleObjToString({
          width: isVertical ? '16px' : (p.width ? `${p.width}px` : '150px'),
          height: isVertical ? (p.height ? `${p.height}px` : '100px') : '16px',
          background: getThemeColor(p.bgColor, '--bg'),
          border: `1px solid var(--border)`,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        });
        const thumbStyle = styleObjToString({
          width: isVertical ? '100%' : `${p.value || 50}%`,
          height: isVertical ? `${p.value || 50}%` : '100%',
          background: getThemeColor(p.thumbColor, '--text'),
          opacity: 0.5,
        });
        return wrapComponent(`<div class="retro-scrollbar" style="${barStyle}"><div style="${thumbStyle}"></div></div>`);
      }
      case 'PictureBox':
        return wrapComponent(`<div class="retro-picturebox" style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '150px'),
          minHeight: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '100px'),
          height: isHeightFill ? '100%' : 'auto',
          border: p.border ? `1px solid ${getThemeColor(p.borderColor, '--border')}` : 'none',
        })}">${renderChildren()}</div>`);
      case 'Shape':
        return wrapComponent(`<div style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '60px'),
          height: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '40px'),
          background: p.fill ? getThemeColor(p.bgColor, '--text') : 'transparent',
          border: `1px solid ${getThemeColor(p.borderColor, '--text')}`,
          borderRadius: p.shapeType === 'circle' ? '50%' : '0',
          display: 'inline-block',
        })}"></div>`);
      case 'Line': {
        const borderValue = 
          p.lineStyle === 'double' ? `${p.thickness || 1}px double` :
          p.lineStyle === 'dashed' ? `${p.thickness || 1}px dashed` :
          `${p.thickness || 1}px solid`;
        return wrapComponent(`<div style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%'),
          borderTop: `${borderValue} ${getThemeColor(p.color, '--text')}`,
          margin: '8px 0',
          height: 0,
          flexShrink: 0
        })}"></div>`);
      }
      case 'Image': {
        const bThick = p.borderThickness !== undefined ? p.borderThickness : 1;
        const bStyle = bThick > 0 ? `${bThick}px solid ${getThemeColor(p.borderColor, '--border')}` : 'none';
        const isSvg = p.src && (p.src.toLowerCase().endsWith('.svg') || p.src.startsWith('data:image/svg+xml'));
        const finalIconColor = getThemeColor(p.iconColor, '--accent');

        const containerStyle = {
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '80px'),
          height: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '80px'),
          border: bStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'transparent'
        };

        if (isSvg && p.iconColor) {
          return wrapComponent(`<div style="${styleObjToString(containerStyle)}"><div style="width:100%;height:100%;background-color:${finalIconColor};mask-image:url('${p.src}');mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:url('${p.src}');-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;"></div></div>`);
        }

        if (p.src) {
          return wrapComponent(`<div style="${styleObjToString(containerStyle)}"><img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt || '')}" style="width:100%;height:100%;object-fit:contain;"></div>`);
        }
        if (p.iconSrc) {
          return wrapComponent(`<div class="image-icon-render" style="${styleObjToString({
            ...containerStyle,
            color: finalIconColor,
            padding: '10%'
          })}">${p.iconSrc}</div>`);
        }
        return wrapComponent(`<div style="${styleObjToString(containerStyle)}"><span style="font-size:10px;color:var(--text-dim);">[IMG ${p.width || 80}x${p.height || 80}]</span></div>`);
      }
      case 'Data':
        return wrapComponent(`<div class="retro-data" style="font-size:11px;color:var(--text-dim);padding:4px 8px;border:1px dashed var(--border);">[DATA] Table: ${escapeHtml(p.tableName || 'none')} | Source: ${escapeHtml(p.dataSource || 'sqlite')}${p.query ? `<div style="font-size:9px;margin-top:2px;">${p.dataSource === 'sqlite' ? 'Query' : p.dataSource === 'json' ? 'JSON Path' : 'API URL'}: ${escapeHtml(p.query)}</div>` : ''}</div>`);
      case 'Table': {
        const cols = p.columns || [];
        const trows = p.rows || [];
        const thRow = p.showHeaders !== false ? `<tr>${cols.map(c => `<th style="border:1px solid ${getThemeColor(p.borderColor, '--border')};padding:4px 8px;font-size:11px;background:${p.headerBgColor || 'var(--selected)'};color:${getThemeColor(p.textColor, '--accent')};">${escapeHtml(c.name)}</th>`).join('')}</tr>` : '';
        const tbRows = trows.map((r, ri) => `<tr style="background:${p.stripedRows && ri % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent'}">${cols.map(c => `<td style="border:1px solid ${getThemeColor(p.borderColor, '--border')};padding:4px 8px;font-size:11px;color:${getThemeColor(p.textColor, '--text')};">${escapeHtml(String(r[c.name] ?? '')) || '&nbsp;'}</td>`).join('')}</tr>`).join('');
        return wrapComponent(`<div style="${styleObjToString({ width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%'), maxHeight: isHeightFill ? '100%' : (p.height ? `${p.height}px` : 'auto'), height: isHeightFill ? '100%' : 'auto', overflow: 'auto' })}"><table style="width:100%;border-collapse:collapse;">${thRow ? `<thead>${thRow}</thead>` : ''}<tbody>${tbRows}</tbody></table></div>`);
      }
      default:
        return wrapComponent(`<div style="${styleObjToString({ color: THEMES[theme].text, background: 'transparent', padding: '6px' })}">[${escapeHtml(comp.type)}]</div>`);
    }
  };

  const downloadFile = (filename, content, type) => {
    console.log('--- downloadFile starting ---');
    try {
      if (content instanceof Blob) {
        console.log('Content is Blob');
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 5000);
        return;
      }

      const a = document.createElement('a');
      if (typeof content === 'string' && content.startsWith('data:')) {
        console.log('Content is direct data URI');
        a.href = content;
      } else {
        console.log('Content is string, using base64 encoding');
        const base64 = btoa(unescape(encodeURIComponent(content)));
        a.href = `data:${type};base64,${base64}`;
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error in downloadFile:', err);
    }
  };

  const exportHTML = () => {
    console.log('--- exportHTML starting ---');
    console.log('Current Project:', currentProject);
    console.log('Screens count:', screens.length);
    
    try {
      const t = THEMES[theme];
    
    const screensHtml = screens.map((screen, sIdx) => {
      const isSingleWindow = screen.rows.length === 1 && screen.rows[0].children.length === 1 && screen.rows[0].children[0].type === 'Window';
      
      const rowsHtml = screen.rows.map(row => `<div class="layout-row" style="${styleObjToString({
        ...layoutToStyles(row.layout),
        width: '100%',
        margin: isSingleWindow ? '0' : '12px 0',
      })}">${(row.children || []).map(renderComponentExport).join('')}</div>`).join('');

      const previewStyles = styleObjToString({
        padding: `${canvasPadding.top}px ${canvasPadding.right}px ${canvasPadding.bottom}px ${canvasPadding.left}px`,
        display: isSingleWindow ? 'flex' : 'block',
        flexDirection: isSingleWindow ? 'column' : undefined,
        alignItems: isSingleWindow ? 'center' : undefined,
        justifyContent: isSingleWindow ? 'center' : undefined,
        minHeight: isSingleWindow ? '100vh' : undefined,
      });

      return `
        <div id="${screen.id}" class="screen-container" style="display: ${sIdx === 0 ? 'block' : 'none'};" 
             data-timeout="${screen.settings?.timeout || 0}" 
             data-next="${screen.settings?.nextScreenId || ''}">
          <div class="canvas ${viewMode === 'mobile' ? 'mobile' : ''}">
            <div class="preview-area ${isSingleWindow ? 'centered' : ''}" style="${previewStyles}">
              ${rowsHtml}
            </div>
          </div>
        </div>`;
    }).join('');

    const dotColor = (t.accent || '#00aa00').replace('#', '%23');
    const baseCss = typeof appCss === 'string' ? appCss : '';
    const css = `${baseCss}
body { 
  overflow: auto !important; 
  min-height: 100vh; 
  background: ${t.bg}; 
  color: ${t.text}; 
  margin: 0; 
  padding: 0; 
  background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='2' height='2' fill='${dotColor}' opacity='0.08'/%3E%3Crect x='4' y='4' width='2' height='2' fill='${dotColor}' opacity='0.08'/%3E%3C/svg%3E");
  background-size: 8px 8px;
  background-repeat: repeat;
}
.screen-container { width: 100%; min-height: 100vh; }
.canvas { 
  width: 100%; 
  margin: 0; 
  display: flex; 
  flex-direction: column; 
  background: transparent !important; 
  border: none !important; 
}
.canvas.mobile { 
  max-width: 420px; 
  margin: 0 auto; 
  background: transparent !important; 
  border: none !important;
}
.preview-area { 
  min-width: 0; 
  width: 100%; 
  flex: 1; 
  background: transparent !important; 
}
.layout-row, .retro-row, .export-wrapper { 
  background: transparent !important; 
  border: none !important; 
}
.retro-window, .retro-frame {
  background: ${t.bg} !important;
}
.retro-window-titlebar {
  background: ${t.selected || 'rgba(0,170,0,0.1)'};
  border-bottom: 1px solid ${t.border};
  padding: 4px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.retro-window-title {
  color: ${t.accent};
  font-size: 12px;
  font-weight: bold;
  font-family: monospace;
}
.retro-window-close {
  background: transparent;
  border: 1px solid ${t.border};
  color: ${t.textDim || t.text};
  font-family: monospace;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.property-group label {
  display: block;
  font-size: 11px;
  color: ${t.accent};
  margin-bottom: 4px;
  font-weight: bold;
  text-transform: uppercase;
}
.retro-textbox {
  background: ${t.inputBg || 'rgba(0,0,0,0.3)'};
  border: 1px solid ${t.border};
  color: ${t.text};
  padding: 4px 8px;
  font-family: monospace;
  font-size: 12px;
}
.layout-row, .export-wrapper, .retro-window, .retro-window-content, .retro-frame, .retro-frame-content, .retro-row { min-width: 0; }
.export-wrapper > * { max-width: 100%; }
.export-wrapper { padding: 0 !important; border: none !important; outline: none !important; }
.drop-zone, .new-row-drop, .drop-indicator { display: none !important; }
`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(currentProject.name || 'Prototype')}</title>
<style>
${css}
</style>
</head>
<body class="${theme}">
  ${screensHtml}

  <script>
    let timer = null;

    function goToScreen(screenId) {
      if (timer) clearTimeout(timer);
      
      // Hide all screens
      document.querySelectorAll('.screen-container').forEach(s => {
        s.style.display = 'none';
      });
      
      // Show target screen
      const target = document.getElementById(screenId);
      if (target) {
        target.style.display = 'block';
        window.scrollTo(0, 0);
        
        // Handle auto-jump timer
        const timeout = parseFloat(target.getAttribute('data-timeout') || '0');
        const nextId = target.getAttribute('data-next');
        
        if (timeout > 0 && nextId) {
          timer = setTimeout(() => {
            goToScreen(nextId);
          }, timeout * 1000);
        }
      }
    }

    // Initialize first screen timer
    window.onload = () => {
      const firstScreen = document.querySelector('.screen-container');
      if (firstScreen) {
        const timeout = parseFloat(firstScreen.getAttribute('data-timeout') || '0');
        const nextId = firstScreen.getAttribute('data-next');
        if (timeout > 0 && nextId) {
          timer = setTimeout(() => {
            goToScreen(nextId);
          }, timeout * 1000);
        }
      }
    };
  </script>
</body>
</html>`;

    console.log('Final HTML length:', html.length);
    const baseName = `${currentProject.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '') || 'project'}`;
    console.log('Base name for file:', baseName);
    
    // Log full HTML for agent to "deploy"
    console.log('--- DEPLOY_START ---');
    console.log(html);
    console.log('--- DEPLOY_END ---');

    downloadFile(`${baseName}.html`, html, 'text/html');
    } catch (err) {
      console.error('Error in exportHTML:', err);
    }
  };

  const newProject = () => {
    const name = prompt('Project name:', 'New Project');
    if (!name) return;
    const id = mkId();
    setCurrentProject({ id, name });
    const initialScreens = [{ id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }];
    setScreens(initialScreens);
    setCurrentScreenId('screen-1');
    setSelectedId(null);
    setActiveWindow(null);
    setDatabase({ tables: [], data: {} });
    setShowProjects(false);
  };

  useEffect(() => {
    window.openDatabasePanel = () => setViewMode('database');
    return () => { delete window.openDatabasePanel; };
  }, []);

  const loadProject = (id) => {
    const proj = getProjectList().find(p => p.id === id);
    if (proj) {
      setCurrentProject({ id, name: proj.name });
      const saved = localStorage.getItem(`nanostudio_project_${id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setScreens([{ id: 'screen-1', name: 'Screen 1', rows: parsed, settings: { timeout: 0, nextScreenId: null } }]);
          setCurrentScreenId('screen-1');
        } else if (parsed.screens) {
          setScreens(parsed.screens);
          setCurrentScreenId(parsed.currentScreenId || parsed.screens[0].id);
        }
      }
      setShowProjects(false);
    }
  };

  const deleteProject = (id) => {
    if (!confirm('Delete project?')) return;
    localStorage.removeItem(`nanostudio_project_${id}`);
    if (currentProject.id === id) { setCurrentProject({ id: 'default', name: 'Untitled' }); setScreens([]); setCurrentScreenId(null); }
  };

  const renameProject = (id, name) => {
    const saved = localStorage.getItem(`nanostudio_project_${id}`);
    if (saved) { const d = JSON.parse(saved); localStorage.setItem(`nanostudio_project_${id}`, JSON.stringify({ ...d, name })); }
    if (currentProject.id === id) setCurrentProject(p => ({ ...p, name }));
  };

  const selectedElement = findSelected();
  const isRowSelected = selectedElement && (activeScreen?.rows || []).some(r => r.id === selectedId);

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
          <button className="toolbar-btn" onClick={() => setShowSettings(true)} title="Settings" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ 
              width: 16, 
              height: 16, 
              backgroundColor: 'currentColor', 
              maskImage: 'url(/src/img/icons/imgi_17_gear.svg)',
              WebkitMaskImage: 'url(/src/img/icons/imgi_17_gear.svg)',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat'
            }} />
          </button>
        </div>

        <div className="main-layout" style={{ position: 'relative' }}>
          <Toolbox />
          <div className="canvas-container" style={{ position: 'relative', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
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
              canvasPadding={canvasPadding}
              database={database}
              onNavigate={handleNavigate}
            />

            {showUserJourney && (
              <UserJourneyPanel 
                screens={screens} 
                currentScreenId={currentScreenId} 
                onSelect={setCurrentScreenId} 
                onAdd={addScreen} 
                onDelete={deleteScreen}
                onMove={moveScreen}
                onClose={() => setShowUserJourney(false)}
              />
            )}

        {/* Global Toolbar Buttons (Floating) */}
        {!showUserJourney && (
          <button 
            className="toolbar-btn user-journey-toggle"
            onClick={() => setShowUserJourney(true)}
            title="User Journey"
            style={{ 
              zIndex: 100, 
              width: 40, 
              height: 40,
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--bg)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--accent)';
            }}
          >
            <div style={{ 
              width: 32, 
              height: 32, 
              backgroundColor: 'currentColor', 
              maskImage: 'url(/src/img/icons/imgi_47_monitor-medical.svg)',
              WebkitMaskImage: 'url(/src/img/icons/imgi_47_monitor-medical.svg)',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat'
            }} />
          </button>
        )}


          </div>
          <Inspector 
            component={selectedElement} 
            onUpdate={updateComponent} 
            onDelete={() => selectedId && deleteComponent(selectedId)}
            onDuplicate={() => selectedId && duplicateComponent(selectedId)}
            isRow={isRowSelected}
            database={database}
            screens={screens}
            activeScreen={activeScreen}
            onUpdateScreen={updateScreen}
            windows={getWindows()}
            canvasPadding={canvasPadding}
            onCanvasPaddingChange={setCanvasPadding}
            selectedId={selectedId}
            themeColors={THEMES[theme]}
          />
        </div>

        <div className="status-bar">
          <div style={{ display: 'flex', gap: 16 }}>
            <span>Project: {currentProject.name}</span>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Screen: {screens.find(s => s.id === currentScreenId)?.name || 'Default'}</span>
          </div>
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
                      <button className="small-btn danger" onClick={() => deleteProject(proj.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0 }}>
                        <TrashIcon />
                      </button>
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

        {showSettings && (
          <div className="projects-overlay" onClick={() => setShowSettings(false)}>
            <div className="projects-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <div className="modal-titlebar">
                <span className="modal-title">[ Settings ]</span>
                <button className="modal-close" onClick={() => setShowSettings(false)}>X</button>
              </div>
              <div className="modal-body">
                <div className="property-group">
                  <label>BUILDER NAME</label>
                  <input 
                    type="text" 
                    value={builderName} 
                    onChange={e => setBuilderName(e.target.value)} 
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px', width: '100%', fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ marginTop: 24 }}>
                  <div className="retro-frame" style={{ padding: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '-10px', left: '10px', background: 'var(--panel-bg)', padding: '0 5px', fontSize: '11px', color: 'var(--accent)' }}>Backend</div>
                    
                    <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '15px' }}>Connect to backend.</div>
                    
                    <div className="property-group" style={{ marginBottom: '12px' }}>
                      <label>API KEY:</label>
                      <input 
                        type="text" 
                        value={apiKey} 
                        onChange={e => setApiKey(e.target.value)} 
                        placeholder="Enter API KEY..."
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px', width: '100%', fontFamily: 'monospace' }}
                      />
                    </div>
                    
                    <div className="property-group">
                      <label>API Public URL:</label>
                      <input 
                        type="text" 
                        value={apiUrl} 
                        onChange={e => setApiUrl(e.target.value)} 
                        placeholder="Enter public URL..."
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px', width: '100%', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24, textAlign: 'center' }}>
                  <button className="modal-action-btn" onClick={() => setShowSettings(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDatabase && (
          <DatabasePanel database={database} setDatabase={setDatabase} onClose={() => setShowDatabase(false)} triggerSave={triggerSave} />
        )}
      </div>
      {/* Confirm Modal */}
      {confirmModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--panel-bg)',
            border: '2px solid var(--accent)',
            width: '100%', maxWidth: 400,
            boxShadow: '0 0 30px rgba(255,255,0,0.2)',
            padding: 0
          }}>
            <div style={{
              background: 'var(--accent)', color: 'var(--bg)',
              padding: '6px 12px', fontWeight: 'bold', fontSize: 12,
              display: 'flex', justifyContent: 'space-between'
            }}>
              <span>[ {confirmModal.title} ]</span>
              <button onClick={() => setConfirmModal(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>X</button>
            </div>
            <div style={{ padding: 24, color: 'var(--text)', fontSize: 13, lineHeight: 1.5 }}>
              {confirmModal.message}
            </div>
            <div style={{ 
              padding: 12, borderTop: '1px solid var(--border)', 
              display: 'flex', justifyContent: 'flex-end', gap: 12 
            }}>
              <button 
                className="toolbar-btn" 
                onClick={() => setConfirmModal(null)}
                style={{ padding: '6px 16px' }}
              >
                Cancel
              </button>
              <button 
                className="toolbar-btn" 
                onClick={confirmModal.onConfirm}
                style={{ 
                  padding: '6px 16px', 
                  background: 'var(--accent)', 
                  color: 'var(--bg)',
                  borderColor: 'var(--accent)'
                }}
              >
                {confirmModal.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DndProvider>
  );
}

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M14 10V17M10 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── User Journey Auxiliary Components ──────────────────────────────────────


function DraggableScreenCard({ screen, index, currentScreenId, onSelect, onDelete, onMove }) {
  const ref = React.useRef(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: 'SCREEN_CARD',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'SCREEN_CARD',
    hover(item, monitor) {
      if (!ref.current) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      onMove(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  drag(drop(ref));

  return (
    <div 
      ref={ref}
      className={`uj-screen-card ${currentScreenId === screen.id ? 'active' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onClick={() => onSelect(screen.id)}
    >
      <div className="uj-screen-thumb">
        {screen.rows.length > 0 ? (
          <div style={{ fontSize: 9, opacity: 0.5 }}>[ Screen {index + 1} ]</div>
        ) : (
          <div style={{ fontSize: 9, opacity: 0.3 }}>[ Empty ]</div>
        )}
      </div>
      <div className="uj-screen-info">
        <span className="uj-screen-name">{screen.name}</span>
        {index > 0 && (
          <button 
            className="uj-screen-delete" 
            onClick={(e) => { e.stopPropagation(); onDelete(screen.id); }}
          >
            delete
          </button>
        )}
      </div>
    </div>
  );
}

function UserJourneyPanel({ screens, currentScreenId, onSelect, onAdd, onDelete, onMove, onClose }) {
  return (
    <div className="user-journey-panel">
      <div className="uj-header">
        <span>[ USER JOURNEY ]</span>
        <button className="uj-close" onClick={onClose}>X</button>
      </div>
      <div className="uj-content">
        <div className="uj-screens-list">
          {screens.map((screen, idx) => (
            <DraggableScreenCard 
              key={screen.id}
              screen={screen}
              index={idx}
              currentScreenId={currentScreenId}
              onSelect={onSelect}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
          <button className="uj-add-screen" onClick={onAdd}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>+</div>
            <span>Add Screen</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
