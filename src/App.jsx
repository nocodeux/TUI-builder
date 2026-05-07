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

import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
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
  const [rows, setRows] = useState([]);           // [ { id, layout, children } ]

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
  const [canvasPadding, setCanvasPadding] = useState({ top: 20, right: 20, bottom: 20, left: 20 });

  // ── Defaults por tipo ────────────────────────────────────────────────────
  const getDefaultProps = type => ({
    Window: { title: 'Window1', width: 400, height: '', bgColor: '', textColor: '', borderColor: '', layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Frame: { title: 'Frame1', width: 300, height: '', borderStyle: 'single', bgColor: '', textColor: '', borderColor: '', layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Row: { layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Button: { text: 'Button1', bgColor: '', textColor: '', borderColor: '', width: 80, disabled: false, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Label: { text: 'Label1', textColor: '', fontSize: 12, alignment: 'left', linkUrl: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    Input: { placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '', borderColor: '', bgColor: '', inputType: 'text', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    TextBox: { placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '', borderColor: '', bgColor: '', inputType: 'text', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    CheckBox: { text: 'CheckBox1', checked: false, textColor: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    RadioButton: { text: 'Option1', checked: false, group: 'group1', textColor: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    ComboBox: { items: ['Option 1', 'Option 2', 'Option 3'], width: 150, selectedIndex: 0, textColor: '', borderColor: '', bgColor: '', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    ListBox: { items: ['Item 1', 'Item 2', 'Item 3'], width: 150, height: 100, multiSelect: false, textColor: '', borderColor: '', bgColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    HScrollBar: { value: 50, min: 0, max: 100, width: 150, bgColor: '', thumbColor: '', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    VScrollBar: { value: 50, min: 0, max: 100, height: 100, bgColor: '', thumbColor: '', sizing: { widthMode: 'hug', heightMode: 'fixed' } },
    Timer: { interval: 1000, enabled: false, sizing: { widthMode: 'hug', heightMode: 'hug' } },
    PictureBox: { width: 150, height: 100, stretch: false, border: true, borderColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    Shape: { shapeType: 'rectangle', width: 60, height: 40, borderColor: '', bgColor: '', fill: false, sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    Line: { color: '', thickness: 1, fullWidth: true, widthPercent: 100, sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Image: { src: '', width: 80, height: 80, alt: 'Image', iconSrc: '', iconColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
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
    const canonicalType = type === 'TextBox' ? 'Input' : type;
    return { id: mkId(), type: canonicalType, props: getDefaultProps(canonicalType), children: [] };
  };

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

  const addToCompChildren = (comps, parentId, newComp, index = null) =>
    comps.map(c => c.id === parentId
      ? {
          ...c,
          children: (() => {
            const nextChildren = [...(c.children || [])];
            const insertAt = index === null ? nextChildren.length : Math.min(Math.max(index, 0), nextChildren.length);
            nextChildren.splice(insertAt, 0, newComp);
            return nextChildren;
          })()
        }
      : { ...c, children: c.children ? addToCompChildren(c.children, parentId, newComp, index) : c.children }
    );

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

  // ── Agregar componente a una fila existente ───────────────────────────────
  const addToRow = useCallback((type, rowId, index, parentContainerId = null) => {
    const newComp = mkComp(type);
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      if (parentContainerId) {
        // Agregar dentro de un Window/Frame que está en esta fila
        return { ...row, children: addToCompChildren(row.children, parentContainerId, newComp, index) };
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

  // ── Actualizar props de componente ────────────────────────────────────────
  const updateComponent = useCallback((id, newProps) => {
    setRows(prev => prev.map(row => {
      if (row.id === id) {
        // It's a row — update its layout (includes padding now)
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

    setRows(prev => prev.map(row => ({ ...row, children: duplicateTree(row.children) })));
    if (newSelectedId) setSelectedId(newSelectedId);
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
          setRows(normalizeRows(migrated));
        } else {
          setRows(normalizeRows(data.rows || []));
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
  const collectByType = (comps, type) => comps.flatMap(comp => [
    ...(comp.type === type ? [comp] : []),
    ...collectByType(comp.children || [], type)
  ]);
  const getWindows = () => rows.flatMap(r => collectByType(r.children, 'Window'));
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
        const html = `<div class="retro-window" style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%'),
          minHeight: isHeightFill ? '100%' : (p.height ? `${p.height}px` : ''),
          height: isHeightFill ? '100%' : 'auto',
          background: getThemeColor(p.bgColor, '--bg'),
          borderColor: getThemeColor(p.borderColor, '--border'),
        })}"><div class="retro-window-titlebar"><span class="retro-window-title" style="color:${getThemeColor(p.textColor, '--accent')}">${escapeHtml(p.title)}</span></div><div class="retro-window-content" style="${styleObjToString(paddedStyles)}">${renderChildren()}</div></div>`;
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
        })}"><legend style="color:${getThemeColor(p.textColor, '--accent')}">${escapeHtml(p.title)}</legend><div class="retro-frame-content" style="${styleObjToString(layoutToStyles(p.layout))}">${renderChildren()}</div></fieldset></div>`;
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
      case 'Button':
        return wrapComponent(`<button class="retro-button" style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : 'auto'),
          height: isHeightFill ? '100%' : 'auto',
          '--button-bg': p.bgColor || 'transparent',
          '--button-text': getThemeColor(p.textColor, '--text'),
          '--button-border': getThemeColor(p.borderColor, '--text'),
        })}" ${p.disabled ? 'disabled' : ''}>${escapeHtml(p.text)}</button>`);
      case 'Label': {
        const textAlign = p.alignment || 'left';
        const content = p.linkUrl
          ? `<a href="${escapeHtml(p.linkUrl)}" target="_blank" rel="noopener noreferrer" style="color:${getThemeColor(p.textColor, '--text')};text-decoration:underline;">${escapeHtml(p.text)}</a>`
          : `<span style="color:${getThemeColor(p.textColor, '--text')};">${escapeHtml(p.text)}</span>`;
        return wrapComponent(`<label class="retro-label" style="${styleObjToString({
          fontSize: p.fontSize || 12,
          textAlign,
          justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
        })}">${content}</label>`);
      }
      case 'Input':
      case 'TextBox':
        return wrapComponent(`<input class="retro-textbox" type="${p.inputType || 'text'}" placeholder="${escapeHtml(p.placeholder)}" style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%'),
          height: isHeightFill ? '100%' : 'auto',
          borderColor: getThemeColor(p.borderColor, '--text'),
          color: getThemeColor(p.textColor, '--text'),
          background: getThemeColor(p.bgColor, '--input-bg'),
        })}" ${p.readOnly ? '' : ''} ${p.disabled ? '' : ''} />`);
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
      case 'Line':
        return wrapComponent(`<div style="${styleObjToString({
          width: p.fullWidth ? `${p.widthPercent || 100}%` : '100px',
          height: `${p.thickness || 1}px`,
          background: getThemeColor(p.color, '--text'),
          margin: '4px 0'
        })}"></div>`);
      case 'Image':
        if (p.src) {
          return wrapComponent(`<img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt)}" style="${styleObjToString({
            width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '80px'),
            height: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '80px'),
            border: `1px solid var(--border)`
          })}" />`);
        }
        if (p.iconSrc) {
          return wrapComponent(`<div class="image-icon-render" style="${styleObjToString({
            width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '80px'),
            height: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '80px'),
            border: `1px solid var(--border)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            color: getThemeColor(p.iconColor, '--text'),
            padding: '4px',
          })}">${p.iconSrc}</div>`);
        }
        return wrapComponent(`<div style="${styleObjToString({
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '80px'),
          height: isHeightFill ? '100%' : (p.height ? `${p.height}px` : '80px'),
          border: `1px solid var(--border)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
        })}"><span style="font-size:10px;color:var(--text-dim);">[IMG ${p.width || 80}x${p.height || 80}]</span></div>`);
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
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportHTML = () => {
    const t = THEMES[theme];
    const rowsHtml = rows.map(row => `<div class="layout-row" style="${styleObjToString({
      ...layoutToStyles(row.layout),
      width: '100%',
      margin: '12px 0',
    })}">${(row.children || []).map(renderComponentExport).join('')}</div>`).join('');

    const dotColor = (t.accent || '#00aa00').replace('#', '%23');
    const css = `${appCss}
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
<title>${escapeHtml(currentProject.name)}</title>
<style>
${css}
</style>
</head>
<body class="${theme}">
<div class="canvas ${viewMode} ${theme}">
<div class="preview-area">
${rowsHtml}
</div>
</div>
</body>
</html>`;

    const baseName = `${currentProject.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'project'}`;
    downloadFile(`${baseName}.html`, html, 'text/html');
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

  useEffect(() => {
    window.openDatabasePanel = () => setViewMode('database');
    return () => { delete window.openDatabasePanel; };
  }, []);

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
            canvasPadding={canvasPadding}
            database={database}
          />
          <Inspector
            component={selectedElement}
            isRow={isRowSelected}
            onUpdate={updateComponent}
            onDelete={() => selectedId && deleteComponent(selectedId)}
            onDuplicate={() => selectedId && duplicateComponent(selectedId)}
            windows={getWindows()}
            database={database}
            canvasPadding={canvasPadding}
            onCanvasPaddingChange={setCanvasPadding}
            selectedId={selectedId}
            themeColors={THEMES[theme]}
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
