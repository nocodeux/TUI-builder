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
    Window: { title: 'Window1', width: 400, height: '', bgColor: '', textColor: '', borderColor: '', layout: { ...DEFAULT_LAYOUT } },
    Frame: { title: 'Frame1', width: 300, height: '', borderStyle: 'single', bgColor: '', textColor: '', borderColor: '', layout: { ...DEFAULT_LAYOUT } },
    Row: { layout: { ...DEFAULT_LAYOUT } },
    Button: { text: 'Button1', bgColor: 'transparent', textColor: '#00ff00', borderColor: '#00ff00', width: 80, disabled: false },
    Label: { text: 'Label1', textColor: '#00ff00', fontSize: 12, alignment: 'left', linkUrl: '' },
    Input: { placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '#00ff00', borderColor: '#00ff00', bgColor: '#000000', inputType: 'text' },
    TextBox: { placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '#00ff00', borderColor: '#00ff00', bgColor: '#000000', inputType: 'text' },
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
        const layoutKeys = ['direction', 'gap', 'align', 'justify', 'wrap'];
        const hasLayoutKeys = Object.keys(newProps).some(key => layoutKeys.includes(key));
        const nextProps = { ...c.props, ...newProps };

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
  });

  const renderComponentExport = (comp) => {
    const p = comp.props || {};
    const renderChildren = () => (comp.children || []).map(renderComponentExport).join('');
    const wrapComponent = (innerHtml) => `<div class="component-wrapper" style="display:inline-flex;align-items:flex-start;padding:2px;flex-shrink:0;box-sizing:border-box;max-width:100%;outline:none;border:1px solid transparent;cursor:default;">${innerHtml}</div>`;

    switch (comp.type) {
      case 'Window': {
        const html = `<div class="retro-window" style="${styleObjToString({
          width: p.width ? `${p.width}px` : '100%',
          minHeight: p.height ? `${p.height}px` : '',
          background: p.bgColor || 'transparent',
          borderColor: p.borderColor || THEMES[theme].border,
        })}"><div class="retro-window-titlebar"><span class="retro-window-title" style="color:${p.textColor || THEMES[theme].accent}">${escapeHtml(p.title)}</span></div><div class="retro-window-content" style="${styleObjToString(layoutToStyles(p.layout))}">${renderChildren()}</div></div>`;
        return wrapComponent(html);
      }
      case 'Frame': {
        const borderValue = p.borderStyle === 'double' ? '3px double' : p.borderStyle === 'dashed' ? '1px dashed' : '1px solid';
        const html = `<div class="retro-frame-wrapper" style="${styleObjToString({ width: p.width ? `${p.width}px` : '100%' })}"><fieldset class="retro-frame" style="${styleObjToString({
          border: `${borderValue} ${p.borderColor || THEMES[theme].border}`,
          background: p.bgColor || 'transparent',
          minHeight: p.height ? `${p.height}px` : 'auto',
        })}"><legend style="color:${p.textColor || THEMES[theme].accent}">${escapeHtml(p.title)}</legend><div class="retro-frame-content" style="${styleObjToString(layoutToStyles(p.layout))}">${renderChildren()}</div></fieldset></div>`;
        return wrapComponent(html);
      }
      case 'Row': {
        const html = `<div class="retro-row" style="${styleObjToString({
          ...layoutToStyles(p.layout),
          width: '100%',
          minHeight: '32px',
        })}">${renderChildren()}</div>`;
        return wrapComponent(html);
      }
      case 'Button':
        return wrapComponent(`<button class="retro-button" style="${styleObjToString({
          width: p.width ? `${p.width}px` : 'auto',
          '--button-bg': p.bgColor || 'transparent',
          '--button-text': p.textColor || THEMES[theme].text,
          '--button-border': p.borderColor || THEMES[theme].text,
        })}" ${p.disabled ? 'disabled' : ''}>${escapeHtml(p.text)}</button>`);
      case 'Label': {
        const textAlign = p.alignment || 'left';
        const content = p.linkUrl
          ? `<a href="${escapeHtml(p.linkUrl)}" target="_blank" rel="noopener noreferrer" style="color:${p.textColor || THEMES[theme].text};text-decoration:underline;">${escapeHtml(p.text)}</a>`
          : `<span style="color:${p.textColor || THEMES[theme].text};">${escapeHtml(p.text)}</span>`;
        return wrapComponent(`<label class="retro-label" style="${styleObjToString({
          fontSize: p.fontSize || 12,
          textAlign,
          justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
        })}">${content}</label>`);
      }
      case 'Input':
      case 'TextBox':
        return wrapComponent(`<input class="retro-textbox" type="${p.inputType || 'text'}" placeholder="${escapeHtml(p.placeholder)}" style="${styleObjToString({
          width: p.width ? `${p.width}px` : '100%',
          borderColor: p.borderColor || THEMES[theme].text,
          color: p.textColor || THEMES[theme].text,
          background: p.bgColor || THEMES[theme].inputBg,
        })}" ${p.readOnly ? 'readonly' : ''} ${p.disabled ? 'disabled' : ''} />`);
      case 'CheckBox':
        return wrapComponent(`<label class="retro-checkbox" style="color:${p.textColor || THEMES[theme].text};"><input type="checkbox" ${p.checked ? 'checked' : ''} disabled /><span>${escapeHtml(p.text)}</span></label>`);
      case 'RadioButton':
        return wrapComponent(`<label class="retro-radio" style="color:${p.textColor || THEMES[theme].text};"><input type="radio" name="${escapeHtml(p.group || 'group1')}" ${p.checked ? 'checked' : ''} disabled /><span>${escapeHtml(p.text)}</span></label>`);
      case 'ComboBox': {
        const items = (p.items || []).map(item => `<option>${escapeHtml(item)}</option>`).join('');
        return wrapComponent(`<select class="retro-select" disabled style="${styleObjToString({
          width: p.width ? `${p.width}px` : '150px',
          borderColor: p.borderColor || THEMES[theme].border,
          color: p.textColor || THEMES[theme].text,
          background: p.bgColor || '#000000',
        })}">${items}</select>`);
      }
      case 'ListBox': {
        const items = (p.items || []).map(item => `<option>${escapeHtml(item)}</option>`).join('');
        return wrapComponent(`<select class="retro-listbox" disabled multiple size="4" style="${styleObjToString({
          width: p.width ? `${p.width}px` : '150px',
          height: p.height ? `${p.height}px` : '100px',
          borderColor: p.borderColor || THEMES[theme].border,
          color: p.textColor || THEMES[theme].text,
          background: p.bgColor || '#000000',
        })}">${items}</select>`);
      }
      case 'HScrollBar':
      case 'VScrollBar': {
        const isVertical = comp.type === 'VScrollBar';
        const barStyle = styleObjToString({
          width: isVertical ? '16px' : (p.width ? `${p.width}px` : '150px'),
          height: isVertical ? (p.height ? `${p.height}px` : '100px') : '16px',
          background: p.bgColor || '#000000',
          border: `1px solid ${THEMES[theme].border}`,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        });
        const thumbStyle = styleObjToString({
          width: isVertical ? '100%' : `${p.value || 50}%`,
          height: isVertical ? `${p.value || 50}%` : '100%',
          background: p.thumbColor || THEMES[theme].text,
          opacity: 0.5,
        });
        return wrapComponent(`<div class="retro-scrollbar" style="${barStyle}"><div style="${thumbStyle}"></div></div>`);
      }
      case 'PictureBox':
        return wrapComponent(`<div class="retro-picturebox" style="${styleObjToString({
          width: p.width ? `${p.width}px` : '150px',
          minHeight: p.height ? `${p.height}px` : '100px',
          border: p.border ? `1px solid ${p.borderColor || THEMES[theme].border}` : 'none',
        })}">${renderChildren()}</div>`);
      case 'Shape':
        return wrapComponent(`<div style="${styleObjToString({
          width: p.width ? `${p.width}px` : '60px',
          height: p.height ? `${p.height}px` : '40px',
          background: p.fill ? p.bgColor || THEMES[theme].text : 'transparent',
          border: `1px solid ${p.borderColor || THEMES[theme].text}`,
          borderRadius: p.shapeType === 'circle' ? '50%' : '0',
          display: 'inline-block',
        })}"></div>`);
      case 'Line':
        return wrapComponent(`<div style="${styleObjToString({
          width: p.fullWidth ? `${p.widthPercent || 100}%` : '100px',
          height: `${p.thickness || 1}px`,
          background: p.color || THEMES[theme].text,
          margin: '4px 0'
        })}"></div>`);
      case 'Image':
        if (p.src) {
          return wrapComponent(`<img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt)}" style="${styleObjToString({
            width: p.width ? `${p.width}px` : '80px',
            height: p.height ? `${p.height}px` : '80px',
            border: `1px solid ${THEMES[theme].border}`
          })}" />`);
        }
        return wrapComponent(`<div style="${styleObjToString({
          width: p.width ? `${p.width}px` : '80px',
          height: p.height ? `${p.height}px` : '80px',
          border: `1px solid ${THEMES[theme].border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: THEMES[theme].bg,
        })}"><span style="font-size:10px;color:${THEMES[theme].textDim};">[IMG ${p.width || 80}x${p.height || 80}]</span></div>`);
      case 'Data':
        return wrapComponent(`<div class="retro-data" style="font-size:11px;color:${THEMES[theme].textDim};padding:4px 8px;border:1px dashed ${THEMES[theme].border};">[DATA] Table: ${escapeHtml(p.tableName || 'none')} | Source: ${escapeHtml(p.dataSource || 'sqlite')}${p.query ? `<div style="font-size:9px;margin-top:2px;">${p.dataSource === 'sqlite' ? 'Query' : p.dataSource === 'json' ? 'JSON Path' : 'API URL'}: ${escapeHtml(p.query)}</div>` : ''}</div>`);
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

    const css = `${appCss}
body { overflow: auto !important; min-height: 100vh; background: ${t.bg}; color: ${t.text}; }
.canvas { width: min(100%, 900px); max-width: 900px; margin: 0 auto; background-color: ${t.bg}; background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='2' height='2' fill='%2300aa00' opacity='0.08'/%3E%3Crect x='4' y='4' width='2' height='2' fill='%2300aa00' opacity='0.08'/%3E%3C/svg%3E"); background-size: 8px 8px; background-repeat: repeat; }
.canvas.mobile { width: 100%; max-width: 420px; }
.canvas.mobile .preview-area { max-width: 420px; margin: 0 auto; width: 100%; }
.preview-area { min-width: 0; }
.layout-row, .component-wrapper, .retro-window, .retro-window-content, .retro-frame, .retro-frame-content, .retro-row { min-width: 0; }
.component-wrapper > * { max-width: 100%; }
.drop-zone, .new-row-drop { display: none !important; }
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
