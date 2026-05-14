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
import LevelTabs from './components/LevelTabs';
import LevelCanvas from './components/LevelCanvas';
import RuntimeView from './components/RuntimeView';
import SpriteSheetManager from './components/SpriteSheetManager';
import { apiFetch, getToken, setToken, clearToken } from './lib/apiFetch';
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
  const [selectedIds, setSelectedIds] = useState([]); // Array of IDs
  const [lastSelectedId, setLastSelectedId] = useState(null); // For shift-select ranges if needed later
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
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('New Project');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [projectList, setProjectList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [gameMode, setGameMode] = useState(false);
  const [selectedLevelId, setSelectedLevelId] = useState(null);
  // Which authoring surface the canvas shows when a level is active.
  // 'game' = entities + tilemap (absolute positioning, LevelCanvas).
  // 'hud'  = level.rows (flexbox layout, the existing Canvas).
  const [levelLayer, setLevelLayer] = useState('game');
  // Active tile brush. When set, clicks on LevelCanvas paint instead of
  // deselecting. tileValue 0 = eraser; 1+ = tileset cell index + 1.
  const [paintBrush, setPaintBrush] = useState(null);
  // True while the runtime is mounted on the level canvas. Toggled by
  // the Play / Stop button on LevelTabs.
  const [isPlaying, setIsPlaying] = useState(false);
  // Assets live in a sidecar file (projects/<id>.assets.json) so the main
  // project JSON stays small and the editor can save schema changes without
  // re-uploading megabytes of base64 sprite data.
  const [assets, setAssetsState] = useState({ sprites: [], tilesets: [], sounds: [], backgrounds: [] });
  const [showSpriteSheetManager, setShowSpriteSheetManager] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState('login'); // 'login' | 'register'
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const isInitialLoading = useRef(true);
  const saveTimer = useRef(null);
  const assetsDirty = useRef(false);
  const assetsSaveTimer = useRef(null);
  const canvasContainerRef = useRef(null);

  // Auth: handle OAuth redirect token in URL hash (#token=...)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get('token');
      const error = params.get('error');
      window.history.replaceState({}, '', window.location.pathname);
      if (token) {
        setToken(token);
        fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(user => { if (user) { setCurrentUser(user); setShowLogin(false); } });
        return;
      }
      if (error) { setShowLogin(true); setLoginError(decodeURIComponent(error)); return; }
    }
    // Normal token check
    const token = getToken();
    if (!token) { setShowLogin(true); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (user) setCurrentUser(user);
        else { clearToken(); setShowLogin(true); }
      })
      .catch(() => { clearToken(); setShowLogin(true); });
  }, []);

  // Show login modal whenever any apiFetch gets a 401
  useEffect(() => {
    const handler = () => setShowLogin(true);
    window.addEventListener('tuify:auth-required', handler);
    return () => window.removeEventListener('tuify:auth-required', handler);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Login failed'); return; }
      setToken(data.token);
      setCurrentUser(data);
      setShowLogin(false);
      setLoginPassword('');
    } catch {
      setLoginError('Connection error — is the server running?');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
    setShowLogin(true);
    setLoginMode('login');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (regPassword !== regConfirm) { setLoginError('Passwords do not match'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, password: regPassword, displayName: regName }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Registration failed'); return; }
      setToken(data.token);
      setCurrentUser(data);
      setShowLogin(false);
      setRegPassword(''); setRegConfirm('');
    } catch {
      setLoginError('Connection error — is the server running?');
    } finally {
      setLoginLoading(false);
    }
  };

  // Wrap setAssets so every mutation flips the dirty flag and schedules a
  // sidecar save. Components should always go through this setter.
  const setAssets = useCallback((updater) => {
    assetsDirty.current = true;
    setAssetsState(prev => typeof updater === 'function' ? updater(prev) : updater);
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await apiFetch('/api/projects');
      const data = await res.json();
      setProjectList(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (showProjects) fetchProjects();
  }, [showProjects]);
  // ── Sidecar assets persistence ───────────────────────────────────────────
  // Debounced 2s after any asset change. Skipped during initial load and when
  // there's no real project (id === 'default').
  useEffect(() => {
    if (isInitialLoading.current) return;
    if (!assetsDirty.current) return;
    if (!currentProject?.id || currentProject.id === 'default') return;
    if (assetsSaveTimer.current) clearTimeout(assetsSaveTimer.current);
    assetsSaveTimer.current = setTimeout(() => {
      apiFetch(`/api/projects/${currentProject.id}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assets),
      })
        .then(res => res.json())
        .then(() => { assetsDirty.current = false; })
        .catch(err => console.error('[Assets] save error:', err));
    }, 2000);
    return () => { if (assetsSaveTimer.current) clearTimeout(assetsSaveTimer.current); };
  }, [assets, currentProject?.id]);

  // ── Persistencia ──────────────────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    if (isInitialLoading.current) return;
    
    if (saveTimer.current) clearTimeout(saveTimer.current);
    
    setSaveStatus('Saving...');
    saveTimer.current = setTimeout(() => {
      const projectData = {
        id: currentProject.id,
        name: currentProject.name,
        theme,
        viewMode,
        screens,
        currentScreenId,
        activeWindow,
        database,
        gameMode,
        lastSaved: new Date().toISOString()
      };

      apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      })
      .then(res => res.json())
      .then(() => {
        setSaveStatus('Saved');
        localStorage.setItem('nanostudio_current_project', JSON.stringify(currentProject));
        if (showProjects) fetchProjects();
        setTimeout(() => setSaveStatus(''), 1500);
      })
      .catch(err => {
        console.error('[Save] Error saving project:', err);
        setSaveStatus('Save Error');
        setTimeout(() => setSaveStatus(''), 2000);
      });
    }, 1000); // 1 second debounce
  }, [screens, currentScreenId, database, currentProject, theme, viewMode, activeWindow, gameMode, showProjects]);

  // Visible screens depend on the current mode. Screens (kind != 'world') and
  // Worlds (kind === 'world') live in the same `screens` array but are surfaced
  // separately so the two authoring modes stay isolated.
  const visibleScreens = gameMode
    ? screens.filter(s => s.kind === 'world')
    : screens.filter(s => s.kind !== 'world');
  const activeScreen = visibleScreens.find(s => s.id === currentScreenId) || visibleScreens[0] || null;
  // When a level is selected on the active world, the canvas content is the
  // level's rows; otherwise we author the world/screen's own rows (the HUD).
  const activeLevel = (activeScreen?.kind === 'world' && activeScreen?.currentLevelId)
    ? (activeScreen.levels || []).find(l => l.id === activeScreen.currentLevelId) || null
    : null;
  const rows = activeLevel ? (activeLevel.rows || []) : (activeScreen?.rows || []);

  // Sync the layer toggle whenever the active level changes so each level
  // independently remembers its last-viewed layer (game vs hud).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeLevel) setLevelLayer(activeLevel.editorLayer || 'game');
  }, [activeLevel?.id]);

  // When toggling modes, keep currentScreenId pointing at something visible.
  useEffect(() => {
    if (!activeScreen && visibleScreens.length > 0) {
      setCurrentScreenId(visibleScreens[0].id);
    } else if (activeScreen && activeScreen.id !== currentScreenId) {
      setCurrentScreenId(activeScreen.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode]);

  // ── History Management ───────────────────────────────────────────────────
  const [isUndoing, setIsUndoing] = useState(false);

  const saveHistory = useCallback((nextScreens) => {
    if (isUndoing) return;
    setHistory(prev => {
      const nextHistory = prev.slice(0, historyIndex + 1);
      nextHistory.push(JSON.parse(JSON.stringify(nextScreens)));
      if (nextHistory.length > 50) nextHistory.shift();
      return nextHistory;
    });
    setHistoryIndex(prev => {
      const next = prev + 1;
      return next > 49 ? 49 : next;
    });
  }, [historyIndex, isUndoing]);

  const updateScreens = useCallback((newScreensOrFn, shouldSaveHistory = true) => {
    setScreens(prev => {
      const next = typeof newScreensOrFn === 'function' ? newScreensOrFn(prev) : newScreensOrFn;
      if (shouldSaveHistory && !isInitialLoading.current) {
        saveHistory(next);
      }
      return next;
    });
  }, [saveHistory]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setIsUndoing(true);
      const prevScreens = history[historyIndex - 1];
      setScreens(JSON.parse(JSON.stringify(prevScreens)));
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => setIsUndoing(false), 50);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setIsUndoing(true);
      const nextScreens = history[historyIndex + 1];
      setScreens(JSON.parse(JSON.stringify(nextScreens)));
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => setIsUndoing(false), 50);
    }
  }, [history, historyIndex]);

  // Wrapped setRows to update the active screen in the screens array
  // Routes row mutations to either Screen.rows or Level.rows depending on
  // whether the active world has a level selected. Keeps undo/history snapshots
  // intact because both arrays live inside the screens tree.
  const setRows = useCallback((newRowsOrFn) => {
    updateScreens(prev => {
      return prev.map(s => {
        if (s.id !== currentScreenId) return s;
        // World + selected level → mutate that level's rows
        if (s.kind === 'world' && s.currentLevelId) {
          const levels = (s.levels || []).map(l => {
            if (l.id !== s.currentLevelId) return l;
            const nextRows = typeof newRowsOrFn === 'function' ? newRowsOrFn(l.rows || []) : newRowsOrFn;
            return { ...l, rows: nextRows };
          });
          return { ...s, levels };
        }
        // Screen, or World with no level selected → mutate the screen's own rows
        const nextRows = typeof newRowsOrFn === 'function' ? newRowsOrFn(s.rows || []) : newRowsOrFn;
        return { ...s, rows: nextRows };
      });
    });
  }, [currentScreenId, updateScreens]);

  // Initial history snapshot
  useEffect(() => {
    if (!isInitialLoading.current && historyIndex === -1 && screens.length > 0) {
       setHistory([screens]);
       setHistoryIndex(0);
    }
  }, [screens, historyIndex]);

  const moveScreen = useCallback((dragIndex, hoverIndex) => {
    // dragIndex / hoverIndex come from the User Journey Panel and refer to
    // VISIBLE positions (filtered by the current mode). Translate them back
    // to absolute positions in the underlying screens array before swapping.
    updateScreens(prev => {
      const visible = gameMode
        ? prev.filter(s => s.kind === 'world')
        : prev.filter(s => s.kind !== 'world');
      const dragged = visible[dragIndex];
      const target = visible[hoverIndex];
      if (!dragged || !target || dragged.id === target.id) return prev;
      const next = [...prev];
      const fromAbs = next.findIndex(s => s.id === dragged.id);
      next.splice(fromAbs, 1);
      const toAbs = next.findIndex(s => s.id === target.id);
      const insertAt = toAbs >= 0 ? (hoverIndex > dragIndex ? toAbs + 1 : toAbs) : next.length;
      next.splice(insertAt, 0, dragged);
      return next;
    });
  }, [updateScreens, gameMode]);

  const addScreen = useCallback(() => {
    const base = { id: mkId(), name: `${gameMode ? 'World' : 'Screen'} ${screens.length + 1}`, rows: [], settings: { timeout: 0, nextScreenId: null } };
    const newScreen = gameMode
      ? { ...base, kind: 'world', levels: [], currentLevelId: null, worldSettings: { defaultViewport: 'topdown', defaultGravity: 0, themeMusicAssetId: null } }
      : base;
    updateScreens(prev => [...prev, newScreen]);
    setCurrentScreenId(newScreen.id);
  }, [screens.length, updateScreens, gameMode]);

  const deleteScreen = useCallback((screenId) => {
    const screen = screens.find(s => s.id === screenId);
    if (!screen) return;
    // Worlds can always be deleted (project may have zero worlds, that's fine).
    // Regular screens must keep at least one — otherwise app mode has nothing.
    if (screen.kind !== 'world') {
      const screenCount = screens.filter(s => s.kind !== 'world').length;
      if (screenCount <= 1) return;
    }
    const hasContent = screen && (
      (screen.rows || []).some(r => r.children && r.children.length > 0) ||
      (screen.kind === 'world' && (screen.levels || []).length > 0)
    );
    const fallbackAfterDelete = (next) => {
      if (currentScreenId !== screenId) return;
      const sameKind = screen.kind === 'world'
        ? next.filter(s => s.kind === 'world')
        : next.filter(s => s.kind !== 'world');
      setCurrentScreenId(sameKind[0]?.id || null);
    };
    if (hasContent) {
      setConfirmModal({
        title: screen.kind === 'world' ? 'Delete World' : 'Delete Screen',
        message: `Are you sure you want to delete "${screen.name}"?`,
        confirmText: screen.kind === 'world' ? 'Delete world' : 'Delete screen',
        onConfirm: () => {
          updateScreens(prev => {
            const next = prev.filter(s => s.id !== screenId);
            fallbackAfterDelete(next);
            return next;
          });
          setConfirmModal(null);
        },
        onCancel: () => setConfirmModal(null)
      });
      return;
    }
    updateScreens(prev => {
      const next = prev.filter(s => s.id !== screenId);
      fallbackAfterDelete(next);
      return next;
    });
  }, [screens, currentScreenId, updateScreens]);

  const duplicateScreen = useCallback((screen) => {
    updateScreens(prev => {
      const next = JSON.parse(JSON.stringify(screen));
      next.id = mkId();
      next.name = `${screen.name} (Copy)`;
      return [...prev, next];
    });
  }, [updateScreens]);

  const updateScreenSettings = useCallback((screenId, settings) => {
    updateScreens(prev => prev.map(s => {
      if (s.id === screenId) {
        return { ...s, settings: { ...s.settings, ...settings } };
      }
      return s;
    }));
  }, [updateScreens]);

  const updateScreen = useCallback((id, updates) => {
    updateScreens(prev => prev.map(s => {
      if (s.id === id) {
        if (updates.settings) {
          return { ...s, settings: { ...(s.settings || {}), ...updates.settings } };
        }
        if (updates.worldSettings) {
          return { ...s, worldSettings: { ...(s.worldSettings || {}), ...updates.worldSettings } };
        }
        return { ...s, ...updates };
      }
      return s;
    }));
  }, [updateScreens]);

  // Measure the visible LevelCanvas area, then pick a tile size that lets
  // the world fit the viewport with exactly 22 columns of tiles. Rows are
  // computed from the same tile size against the available height so the
  // grid stays square-ish. Declared above addLevel (its dependency).
  const measureLevelCanvasGrid = useCallback(() => {
    const TARGET_COLS = 22;
    const c = canvasContainerRef.current;
    if (!c || !c.clientWidth || !c.clientHeight) {
      return { cols: TARGET_COLS, rows: TARGET_COLS, tileSize: 32 };
    }
    const tabsHeight = 36; // LevelTabs strip
    const w = c.clientWidth;
    const h = Math.max(0, c.clientHeight - tabsHeight);
    // Pick the largest tile size that fits TARGET_COLS columns, but never
    // exceed the height. Floor to a power-of-2 friendly value for crispness.
    const rawTile = Math.floor(w / TARGET_COLS);
    const tileSize = Math.max(8, rawTile);
    const rows = Math.max(4, Math.floor(h / tileSize));
    return { cols: TARGET_COLS, rows, tileSize };
  }, []);

  // ── Levels (only meaningful for screens with kind === 'world') ──────────
  const makeDefaultLevel = useCallback((world, index, opts = {}) => {
    const ws = world?.worldSettings || {};
    const tileSize = opts.tileSize || 32;
    const cols = opts.cols ?? 22;
    const rows = opts.rows ?? 22;
    return {
      id: mkId(),
      name: `Level ${index + 1}`,
      viewport: ws.defaultViewport || 'topdown',
      gravity: ws.defaultGravity ?? 0,
      backgroundMusicAssetId: null,
      spawnPointId: null,
      rows: [],
      tileMap: {
        tileWidth: tileSize, tileHeight: tileSize, cols, rows,
        tilesetAssetId: null,
        layers: [{ id: mkId(), name: 'Background', kind: 'tiles', data: [] }],
      },
      entities: [],
      levelType: 'hud-only',
    };
  }, []);

  const addLevel = useCallback((worldId) => {
    // Auto-fit the new level's tilemap to whatever the canvas area
    // measures right now so the world fills the viewport instead of
    // landing on a one-size-fits-all default that leaves empty space.
    const grid = measureLevelCanvasGrid();
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      const levels = s.levels || [];
      const next = makeDefaultLevel(s, levels.length, grid);
      return { ...s, levels: [...levels, next], currentLevelId: next.id };
    }));
  }, [updateScreens, makeDefaultLevel, measureLevelCanvasGrid]);

  const moveLevel = useCallback((worldId, dragIndex, hoverIndex) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      const levels = [...(s.levels || [])];
      const [dragged] = levels.splice(dragIndex, 1);
      levels.splice(hoverIndex, 0, dragged);
      return { ...s, levels };
    }));
  }, [updateScreens]);

  const deleteLevel = useCallback((worldId, levelId) => {
    const world = screens.find(s => s.id === worldId);
    const level = world?.levels?.find(l => l.id === levelId);
    if (!level) return;
    // A level has content if any of its surfaces is non-empty:
    // (a) UI rows authored on the canvas (Phase 1), (b) game entities
    // placed on the level (Phase 3+), or (c) painted tilemap data (Phase 3+).
    const hasContent = (
      (level.rows || []).some(r => (r.children || []).length > 0) ||
      (level.entities || []).length > 0 ||
      (level.tileMap?.layers || []).some(layer => (layer.data || []).some(v => v))
    );
    const apply = () => {
      updateScreens(prev => prev.map(s => {
        if (s.id !== worldId || s.kind !== 'world') return s;
        const levels = (s.levels || []).filter(l => l.id !== levelId);
        // After delete, fall back to the world overlay (currentLevelId = null)
        // so the user sees a clear surface instead of being silently moved.
        const nextCurrent = s.currentLevelId === levelId ? null : s.currentLevelId;
        return { ...s, levels, currentLevelId: nextCurrent };
      }));
      if (selectedLevelId === levelId) setSelectedLevelId(null);
    };
    if (hasContent) {
      setConfirmModal({
        title: 'Delete Level',
        message: `Are you sure you want to delete "${level.name}"? Its content will be removed.`,
        confirmText: 'Delete level',
        onConfirm: () => { apply(); setConfirmModal(null); },
        onCancel: () => setConfirmModal(null),
      });
      return;
    }
    apply();
  }, [screens, selectedLevelId, updateScreens]);

  const duplicateLevel = useCallback((worldId, levelId) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      const src = (s.levels || []).find(l => l.id === levelId);
      if (!src) return s;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = mkId();
      copy.name = `${src.name} (Copy)`;
      // regenerate ids inside the copy
      (copy.tileMap?.layers || []).forEach(layer => { layer.id = mkId(); });
      return { ...s, levels: [...(s.levels || []), copy] };
    }));
  }, [updateScreens]);

  const updateLevel = useCallback((worldId, levelId, patch) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      const levels = (s.levels || []).map(l => l.id === levelId ? { ...l, ...patch } : l);
      return { ...s, levels };
    }));
  }, [updateScreens]);

  const selectLevel = useCallback((worldId, levelId) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return { ...s, currentLevelId: levelId };
    }));
    setSelectedLevelId(levelId);
    setSelectedIds([]);
  }, [updateScreens]);


  // ── Entities (live inside a level, absolute positioning) ────────────────
  const makeDefaultEntity = useCallback((type, position = { x: 0, y: 0 }) => ({
    id: mkId(),
    type, // 'GameEntity' for now; future game component types reuse the same shape
    name: type === 'GameEntity' ? 'Entity' : type,
    role: 'prop',
    position,
    renderSize: { width: 64, height: 64 },
    animations: [],           // per-animation sprite sheet mappings
    spriteSheetAssetId: null, // legacy fallback — kept for backward compat
    defaultAnimation: null,
    facing: 'right',
    stats: { hp: 100, speed: 100, runSpeed: 180, damage: 10, jumpHeight: 3, defense: 0 },
    spriteOffsetY: 0,
    behavior: {
      // Multi-attack / combo list (replaces single attackAnim for new entities)
      attacks: [], idles: [],
      // Single-anim shortcuts (still used as fallback when attacks[] is empty)
      attackAnim: null, runAnim: null, jumpAnim: null,
      hitAnim: null, heavyHitAnim: null,
      hitThreshold: 30, hitDuration: 500,
      // Enemy AI defaults
      detectionRange: 8, attackRange: 48, patrolRange: 3, attackCooldown: 1200,
    },
    persona: {},
  }), []);

  const addEntity = useCallback((worldId, levelId, type, position) => {
    const entity = makeDefaultEntity(type, position);
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l =>
          l.id === levelId ? { ...l, entities: [...(l.entities || []), entity] } : l
        ),
      };
    }));
    setSelectedIds([entity.id]);
    setSelectedLevelId(null);
    return entity.id;
  }, [makeDefaultEntity, updateScreens]);

  const updateEntity = useCallback((worldId, levelId, entityId, patch) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l => {
          if (l.id !== levelId) return l;
          return {
            ...l,
            entities: (l.entities || []).map(e =>
              e.id === entityId ? { ...e, ...patch } : e
            ),
          };
        }),
      };
    }));
  }, [updateScreens]);

  // ── Background layers (per-level, render below the tilemap) ─────────────
  const addBackgroundLayer = useCallback((worldId, levelId, assetId) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l => {
          if (l.id !== levelId) return l;
          const layers = l.backgrounds || [];
          const next = {
            id: mkId(),
            assetId,
            // 0 = static, 0.5 = half-camera-speed (distant), 1 = tracks 1:1.
            parallax: { x: 0.5, y: 0.5 },
            // Continuous auto-scroll in px/sec (clouds, water, etc.). Applied
            // by the runtime; static in the editor preview.
            scroll: { x: 0, y: 0 },
            offset: { x: 0, y: 0 },
            repeat: { x: true, y: false },
            opacity: 1,
            scale: 1,
          };
          return { ...l, backgrounds: [...layers, next] };
        }),
      };
    }));
  }, [updateScreens]);

  const updateBackgroundLayer = useCallback((worldId, levelId, layerId, patch) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l => {
          if (l.id !== levelId) return l;
          return {
            ...l,
            backgrounds: (l.backgrounds || []).map(b => b.id === layerId ? { ...b, ...patch } : b),
          };
        }),
      };
    }));
  }, [updateScreens]);

  const removeBackgroundLayer = useCallback((worldId, levelId, layerId) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l => {
          if (l.id !== levelId) return l;
          return { ...l, backgrounds: (l.backgrounds || []).filter(b => b.id !== layerId) };
        }),
      };
    }));
  }, [updateScreens]);

  const moveBackgroundLayer = useCallback((worldId, levelId, layerId, direction) => {
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l => {
          if (l.id !== levelId) return l;
          const layers = [...(l.backgrounds || [])];
          const i = layers.findIndex(b => b.id === layerId);
          if (i < 0) return l;
          const j = direction === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= layers.length) return l;
          [layers[i], layers[j]] = [layers[j], layers[i]];
          return { ...l, backgrounds: layers };
        }),
      };
    }));
  }, [updateScreens]);

  const deleteEntities = useCallback((worldId, levelId, entityIds) => {
    const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
    updateScreens(prev => prev.map(s => {
      if (s.id !== worldId || s.kind !== 'world') return s;
      return {
        ...s,
        levels: (s.levels || []).map(l => {
          if (l.id !== levelId) return l;
          return { ...l, entities: (l.entities || []).filter(e => !ids.includes(e.id)) };
        }),
      };
    }));
    setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
  }, [updateScreens]);

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
    Window: { title: 'Window1', width: 400, height: '', bgColor: '', textColor: '', borderColor: '', bgImage: '', bgImageFit: 'cover', layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fixed', heightMode: 'hug' }, staggered: false },
    Frame: { title: 'Frame1', width: 300, height: '', borderStyle: 'single', bgColor: '', textColor: '', borderColor: '', fontSize: 12, alignment: 'left', layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Row: { layout: { ...DEFAULT_LAYOUT }, sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Button: { text: 'Button1', bgColor: '', textColor: '', borderColor: '', width: 80, disabled: false, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    Text: { text: 'Text', textColor: '', fontSize: 12, alignment: 'left', linkUrl: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    Input: { label: '', placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '', borderColor: '', bgColor: '', inputType: 'text', isOTP: false, digits: 4, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    TextBox: { label: '', placeholder: 'Enter text...', width: 150, maxLength: 0, readOnly: false, disabled: false, textColor: '', borderColor: '', bgColor: '', inputType: 'text', isOTP: false, digits: 4, sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    CheckBox: { text: 'CheckBox1', checked: false, textColor: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    RadioButton: { text: 'Option1', checked: false, group: 'group1', textColor: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    ComboBox: { items: ['Option 1', 'Option 2', 'Option 3'], width: 150, selectedIndex: 0, textColor: '', borderColor: '', bgColor: '', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    ListBox: { items: ['Item 1', 'Item 2', 'Item 3'], width: 150, height: 100, multiSelect: false, textColor: '', borderColor: '', bgColor: '', sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    HScrollBar: { value: 50, min: 0, max: 100, width: 150, bgColor: '', thumbColor: '', sizing: { widthMode: 'fixed', heightMode: 'hug' } },
    VScrollBar: { value: 50, min: 0, max: 100, height: 100, bgColor: '', thumbColor: '', sizing: { widthMode: 'hug', heightMode: 'fixed' } },
    Timer: { interval: 1000, enabled: false, sizing: { widthMode: 'hug', heightMode: 'hug' } },
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
    Data: { tableName: '', dataSource: 'sqlite', query: '', sizing: { widthMode: 'hug', heightMode: 'hug' } },
    Loader: { loaderType: 'spinner', color: '', size: 40, speed: 1, thickness: 4, sizing: { widthMode: 'hug', heightMode: 'hug' } },
    Tabs: { tabs: [{ id: 'tab1', label: 'Tab 1' }, { id: 'tab2', label: 'Tab 2' }], activeTabIndex: 0, sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Overlay: { title: 'Modal Overlay', isOpen: false, bgColor: '#000000', modalBg: '', borderColor: '', layout: { direction: 'column', gap: 8, align: 'stretch', justify: 'flex-start' }, sizing: { widthMode: 'fixed', heightMode: 'fixed' } },
    DataRepeater: { tableName: '', layout: { direction: 'column', gap: 8, align: 'stretch', justify: 'flex-start' }, sizing: { widthMode: 'fill', heightMode: 'hug' } },
    Form: { targetTable: '', sourceTable: '', filterValue: '', padding: 10, layout: { direction: 'column', gap: 8, align: 'stretch', justify: 'flex-start' }, sizing: { widthMode: 'fill', heightMode: 'hug' } }
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

  const insertIntoComps = (comps, targetId, movedComp, index, parentId = null) => {
    const finalTarget = parentId || targetId;
    for (let i = 0; i < comps.length; i += 1) {
      const comp = comps[i];
      if (comp.id === finalTarget) {
        const nextChildren = [...(comp.children || [])];
        const insertAt = Math.min(Math.max(index, 0), nextChildren.length);
        nextChildren.splice(insertAt, 0, movedComp);
        const nextComps = [...comps];
        nextComps[i] = { ...comp, children: nextChildren };
        return { comps: nextComps, inserted: true };
      }

      if (comp.children?.length) {
        const nested = insertIntoComps(comp.children, targetId, movedComp, index, parentId);
        if (nested.inserted) {
          const nextComps = [...comps];
          nextComps[i] = { ...comp, children: nested.comps };
          return { comps: nextComps, inserted: true };
        }
      }
    }
    return { comps, inserted: false };
  };

  const insertIntoRows = (rowsArr, targetId, movedComp, index, parentId = null) => {
    const finalTarget = parentId || targetId;
    for (let i = 0; i < rowsArr.length; i += 1) {
      const row = rowsArr[i];
      if (row.id === finalTarget) {
        const nextChildren = [...row.children];
        const insertAt = Math.min(Math.max(index, 0), nextChildren.length);
        nextChildren.splice(insertAt, 0, movedComp);
        const nextRows = [...rowsArr];
        nextRows[i] = { ...row, children: nextChildren };
        return { rows: nextRows, inserted: true };
      }

      const nested = insertIntoComps(row.children, targetId, movedComp, index, parentId);
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
  const addToRow = useCallback((type, rowId, index, parentContainerId = null, extraProps = {}) => {
    console.log(`🚀 [DEBUG] addToRow: screen=${currentScreenId}, row=${rowId}, parent=${parentContainerId}, type=${type}, extra=`, extraProps);
    const newComp = mkComp(type);
    if (extraProps && Object.keys(extraProps).length > 0) {
      newComp.props = { ...newComp.props, ...extraProps };
    }
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      if (parentContainerId) {
        return { ...row, children: addToCompChildren(row.children, parentContainerId, newComp, index) };
      }
      const newChildren = [...row.children];
      newChildren.splice(index, 0, newComp);
      return { ...row, children: newChildren };
    }));
    setSelectedIds([newComp.id]);
  }, [setRows, currentScreenId]);

  // ── Create new row ────────────────────────────────────────────────────────
  const addNewRow = useCallback((type, existingItem = null, afterIndex = null, targetScreenId = currentScreenId) => {
    const newRow = { id: mkId(), layout: { ...DEFAULT_LAYOUT }, children: [] };
    if (type) {
      newRow.children = [mkComp(type)];
    }
    if (targetScreenId === currentScreenId) {
      // Goes through setRows which routes to Screen.rows or Level.rows correctly.
      setRows(prev => {
        if (afterIndex !== null) {
          const next = [...prev];
          next.splice(afterIndex, 0, newRow);
          return next;
        }
        return [...prev, newRow];
      });
    } else {
      // Cross-screen targeting (e.g. paste into another screen) — direct mutation.
      // Levels never receive cross-screen drops today, so this stays at screen.rows.
      setScreens(prevScreens => prevScreens.map(s => {
        if (s.id !== targetScreenId) return s;
        const currentRows = s.rows || [];
        if (afterIndex !== null) {
          const next = [...currentRows];
          next.splice(afterIndex, 0, newRow);
          return { ...s, rows: next };
        }
        return { ...s, rows: [...currentRows, newRow] };
      }));
    }
    if (newRow.children.length > 0) setSelectedIds([newRow.children[0].id]);
    else setSelectedIds([newRow.id]);
  }, [currentScreenId, setRows]);

  // ── Move existing component ───────────────────────────────────────────────
  const moveComponent = useCallback((item, toRowId, toIndex, newRowAfter = null, parentId = null) => {
    console.log(`🚀 [DEBUG] moveComponent: id=${item.id}, toRow=${toRowId}, toIndex=${toIndex}, newRowAfter=${newRowAfter}, parentId=${parentId}`);
    setRows(prev => {
      const source = findInRows(prev, item.id);
      if (!source || !source.type) return prev;

      if (item.id === toRowId || subtreeContainsId(source, toRowId)) {
        return prev;
      }

      const removed = removeCompFromRows(prev, item.id);
      if (!removed.moved) {
        console.warn(`⚠️ [DEBUG] moveComponent: Component ${item.id} not found in any row.`);
        return prev;
      }

      // Apply extra props if moving into a special container (like Tabs)
      if (item.extraProps) {
        removed.moved.props = { ...removed.moved.props, ...item.extraProps };
      }

      if (toRowId === '__newrow__') {
        const newRow = { id: mkId(), layout: { ...DEFAULT_LAYOUT }, children: [removed.moved] };
        const result = [...removed.rows];
        result.splice(newRowAfter ?? result.length, 0, newRow);
        console.log(`🚀 [DEBUG] moveComponent: Created new row with component ${item.id}`);
        return result;
      }

      if (!parentId && removed.parentId === toRowId && (toIndex === removed.fromIndex || toIndex === removed.fromIndex + 1)) {
         if (!item.extraProps) return prev; 
      }

      const adjustedIndex = (!parentId && removed.parentId === toRowId && toIndex > removed.fromIndex) ? toIndex - 1 : toIndex;
      const inserted = insertIntoRows(removed.rows, toRowId, removed.moved, adjustedIndex, parentId);
      
      if (!inserted.inserted) {
        console.error(`❌ [DEBUG] moveComponent: Failed to insert component ${item.id} into target ${parentId || toRowId}`);
        return prev; // Fallback to original state if insertion fails
      }

      console.log(`✅ [DEBUG] moveComponent: Successfully moved ${item.id} to ${parentId || toRowId} at index ${adjustedIndex}`);
      return inserted.rows;
    });
  }, [findInRows, setRows]);

  // ── Update component props ────────────────────────────────────────────────
  const updateComponent = useCallback((id, newProps) => {
    setRows(prev => prev.map(row => {
      if (row.id === id) {
        return { ...row, layout: { ...(row.layout || DEFAULT_LAYOUT), ...newProps } };
      }
      return { ...row, children: updateCompRecursive(row.children, id, newProps) };
    }));
  }, [setRows]);

  // ── Delete component ───────────────────────────────────────────────────────
  const deleteComponent = useCallback((idOrIds) => {
    const idsToDelete = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    setRows(prev => {
      let next = [...prev];
      idsToDelete.forEach(id => {
        const isRow = next.some(r => r.id === id);
        if (isRow) next = next.filter(r => r.id !== id);
        else next = next.map(row => ({ ...row, children: deleteCompRecursive(row.children, id) }));
      });
      return next;
    });
    setSelectedIds(prev => prev.filter(id => !idsToDelete.includes(id)));
  }, [setRows]);

  // ── Duplicate component ────────────────────────────────────────────────────
  const duplicateComponent = useCallback((idOrIds) => {
    const idsToDup = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    let newIds = [];

    const cloneTree = (node) => {
      const nid = mkId();
      newIds.push(nid);
      return {
        ...node,
        id: nid,
        children: (node.children || []).map(cloneTree)
      };
    };

    // Routes through setRows so duplication respects the active level (if any).
    setRows(prev => {
      let nextRows = [...prev];
      idsToDup.forEach(id => {
        const isRow = nextRows.some(r => r.id === id);
        if (isRow) {
          nextRows = nextRows.flatMap(row => {
            if (row.id === id) {
              const duplicate = { ...row, id: mkId(), children: (row.children || []).map(cloneTree) };
              return [row, duplicate];
            }
            return [row];
          });
        } else {
           const duplicateTree = (comps) => comps.flatMap(comp => {
            if (comp.id === id) {
              const duplicate = cloneTree(comp);
              return [comp, duplicate];
            }
            if (comp.children?.length) {
              return [{ ...comp, children: duplicateTree(comp.children) }];
            }
            return [comp];
          });
          nextRows = nextRows.map(row => ({ ...row, children: duplicateTree(row.children) }));
        }
      });
      return nextRows;
    });

    if (newIds.length > 0) setSelectedIds(newIds);
  }, [setRows]);

  // ── Clipboard Management ──────────────────────────────────────────────────
  // ── Seleccionar fila ──────────────────────────────────────────────────────
  const selectRow = useCallback((rowId, multi = false) => {
    setSelectedIds(prev => {
      if (multi) {
        if (prev.includes(rowId)) return prev.filter(id => id !== rowId);
        return [...prev, rowId];
      }
      return [rowId];
    });
    setLastSelectedId(rowId);
    setSelectedLevelId(null);
  }, []);

  // ── Find selected element ──────────────────────────────────────────────────
  const findSelected = useCallback(() => {
    if (selectedIds.length === 0) return null;
    return findInRows(rows, selectedIds[selectedIds.length - 1]);
  }, [rows, selectedIds]);

  const copyComponent = useCallback((id) => {
    const comp = findInRows(rows, id);
    if (comp) {
      setClipboard(JSON.parse(JSON.stringify(comp)));
      console.log(`📋 [DEBUG] Copied component ${id} to clipboard`);
    }
  }, [rows]);

  const pasteComponent = useCallback(() => {
    if (!clipboard) return;

    const cloneTree = (node) => ({
      ...node,
      id: mkId(),
      children: (node.children || []).map(cloneTree)
    });

    const pasted = cloneTree(clipboard);
    
    // Insert into current selected container or active screen's last row
    const target = findSelected();
    if (target && CONTAINER_TYPES.includes(target.type)) {
      addToRow(pasted.type, rows[0]?.id, 0, target.id, pasted.props);
    } else {
      // Add to last row
      const lastRowId = rows[rows.length - 1]?.id;
      if (lastRowId) {
        addToRow(pasted.type, lastRowId, (rows[rows.length-1].children || []).length, null, pasted.props);
      } else {
        addNewRow(pasted.type, null, null);
      }
    }
    console.log(`📋 [DEBUG] Pasted component from clipboard`);
  }, [clipboard, rows, findSelected, addToRow, addNewRow]);

  useEffect(() => {
    const handleShortcuts = (e) => {
      if (selectedIds.length === 0) return;
      const tagName = e.target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tagName = e.target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || e.target?.isContentEditable || e.target?.closest('[contenteditable="true"]')) return;

        e.preventDefault();
        // Route entity deletes to deleteEntities; component deletes to deleteComponent.
        const entityIds = selectedIds.filter(id =>
          (activeLevel?.entities || []).some(en => en.id === id)
        );
        if (entityIds.length > 0 && activeLevel && activeScreen) {
          deleteEntities(activeScreen.id, activeLevel.id, entityIds);
          const compIds = selectedIds.filter(id => !entityIds.includes(id));
          if (compIds.length > 0) deleteComponent(compIds);
        } else {
          deleteComponent(selectedIds);
        }
      }
      if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateComponent(selectedIds);
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
      }
      if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
        const tagName = e.target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
        e.preventDefault();
        copyComponent(selectedIds[selectedIds.length-1]);
      }
      if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
        const tagName = e.target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
        e.preventDefault();
        pasteComponent();
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [selectedIds, deleteComponent, duplicateComponent, copyComponent, pasteComponent, undo, redo, activeLevel, activeScreen, deleteEntities]);



  useEffect(() => { localStorage.setItem('nanostudio_theme', theme); }, [theme]);
  useEffect(() => { 
    localStorage.setItem('nanostudio_builder_name', builderName); 
    document.title = builderName;
  }, [builderName]);

  useEffect(() => { localStorage.setItem('nanostudio_api_key', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('nanostudio_api_url', apiUrl); }, [apiUrl]);

  // Load global settings from server
  useEffect(() => {
    apiFetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.builderName) setBuilderName(data.builderName);
        if (data.apiKey) setApiKey(data.apiKey);
        if (data.apiUrl) setApiUrl(data.apiUrl);
      })
      .catch(err => console.error('Error loading settings:', err));
  }, []);

  // Save global settings to server when changed
  useEffect(() => {
    if (isInitialLoading.current) return;
    const settings = { builderName, apiKey, apiUrl };
    apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(err => console.error('Error saving settings:', err));
  }, [builderName, apiKey, apiUrl]);

  useEffect(() => {
    if (!currentProject.id || currentProject.id === 'default') {
      isInitialLoading.current = false;
      return;
    }
    
    isInitialLoading.current = true;
    Promise.all([
      apiFetch(`/api/projects/${currentProject.id}`).then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      }),
      apiFetch(`/api/projects/${currentProject.id}/assets`).then(r => r.ok ? r.json() : { sprites: [], tilesets: [], sounds: [], backgrounds: [] }),
    ])
      .then(([data, sidecar]) => {
        if (data.screens && data.screens.length > 0) {
          setScreens(data.screens);
          setCurrentScreenId(data.currentScreenId || data.screens[0].id);
        }
        if (data.theme) setTheme(data.theme);
        if (data.viewMode) setViewMode(data.viewMode);
        if (data.database) setDatabase(data.database);
        if (data.activeWindow) setActiveWindow(data.activeWindow);
        setGameMode(data.gameMode === true);
        // Sidecar is the source of truth; if missing, fall back to inline assets
        // for projects authored before the sidecar split (cheap migration).
        const sidecarHasAny = (sidecar?.sprites?.length || sidecar?.tilesets?.length || sidecar?.sounds?.length);
        const fallback = data.assets || { sprites: [], tilesets: [], sounds: [], backgrounds: [] };
        setAssetsState(sidecarHasAny ? sidecar : fallback);
        assetsDirty.current = false;

        setSaveStatus('');
        // Allow saving after a short delay to ensure React has finished updating state
        setTimeout(() => { isInitialLoading.current = false; }, 500);
      })
      .catch((err) => {
        console.error('Error loading project from API:', err);
        isInitialLoading.current = false;
      });
  }, [currentProject.id]);

  useEffect(() => { 
    if (isInitialLoading.current) return;
    
    // Don't auto-save the default "Untitled" project if it's completely empty
    if (currentProject.id === 'default') {
      const isEmpty = screens.every(s => (s.rows || []).length === 0) && (database.tables || []).length === 0;
      if (isEmpty) return;
    }

    triggerSave(); 
  }, [screens, currentScreenId, database, currentProject, theme, viewMode, activeWindow, triggerSave]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const countAll = (rowsArr) => rowsArr.reduce((acc, row) => acc + countComps(row.children), 0);
  const countComps = (comps) => comps.reduce((acc, c) => acc + 1 + (c.children ? countComps(c.children) : 0), 0);
  const collectByType = (comps, type) => comps.flatMap(comp => [
    ...(comp.type === type ? [comp] : []),
    ...collectByType(comp.children || [], type)
  ]);
  const getWindows = () => rows.flatMap(r => collectByType(r.children, 'Window'));
  const getOverlays = () => rows.flatMap(r => collectByType(r.children, 'Overlay'));

  const handleNavigate = useCallback((comp) => {
    const p = comp.props || {};
    if (p.action === 'screen' && p.targetScreenId) {
      const targetScreen = screens.find(s => s.id === p.targetScreenId);
      if (targetScreen) {
        // Switch editor mode so the target is visible in visibleScreens.
        const targetIsWorld = targetScreen.kind === 'world';
        if (targetIsWorld && !gameMode) setGameMode(true);
        else if (!targetIsWorld && gameMode) setGameMode(false);
      }
      setCurrentScreenId(p.targetScreenId);
      setSelectedIds([]);
    } else if (p.action === 'overlay' && p.targetOverlayId) {
      const target = findInRows(rows, p.targetOverlayId);
      const isCurrentlyOpen = target?.props?.isOpen;
      updateComponent(p.targetOverlayId, { isOpen: !isCurrentlyOpen });
      if (!isCurrentlyOpen) setSelectedIds([p.targetOverlayId]);
    } else if (p.action === 'level' && p.targetLevelId) {
      // Switch to the specified level within whichever world contains it.
      updateScreens(prev => prev.map(s => {
        if (s.kind !== 'world') return s;
        if (!(s.levels || []).some(l => l.id === p.targetLevelId)) return s;
        return { ...s, currentLevelId: p.targetLevelId };
      }));
      setSelectedIds([]);
    } else if (p.action === 'external' && p.href) {
      window.open(p.href, '_blank');
    } else if (p.action === 'email' && p.mailto) {
      window.location.href = `mailto:${p.mailto}`;
    }
  }, [setCurrentScreenId, setSelectedIds, updateComponent, updateScreens, rows, screens, gameMode, setGameMode]);

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

  const renderComponentExport = (comp, parentDirection = 'row') => {
    const p = comp.props || {};
    const isWidthFill = p.sizing?.widthMode === 'fill';
    const isHeightFill = p.sizing?.heightMode === 'fill';
    const isWidthHug = p.sizing?.widthMode === 'hug';
    const isHeightHug = p.sizing?.heightMode === 'hug';

    // Match Canvas sizing logic (Canvas.jsx lines 197-214)
    const shouldStretch = isHeightFill || (isWidthFill && parentDirection === 'column');

    const renderChildren = (childDirection) => {
      const dir = childDirection || 'row';
      return (comp.children || []).map(c => renderComponentExport(c, dir)).join('');
    };

    const wrapperStyle = {
      display: (isWidthFill || isHeightFill) ? 'flex' : 'inline-flex',
      flex: isWidthFill ? '1 1 0%' : (isHeightFill ? '1 1 auto' : '0 0 auto'),
      alignSelf: shouldStretch ? 'stretch' : 'auto',
      minWidth: 0,
      minHeight: isHeightFill ? 0 : undefined,
      boxSizing: 'border-box',
      maxWidth: '100%',
    };

    const wrapComponent = (innerHtml) => {
      return `<div id="${comp.id}" class="export-wrapper" style="${styleObjToString(wrapperStyle)}">${innerHtml}</div>`;
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
          if (p.closeNextScreenId === '__close_window__') {
            closeBtnHtml = `<button class="retro-window-close" onclick="closeScreen(this)">X</button>`;
          } else {
            closeBtnHtml = `<button class="retro-window-close" onclick="goToScreen('${p.closeNextScreenId}')">X</button>`;
          }
        }

        const html = `<div id="${comp.id}" class="retro-window" style="${styleObjToString({
          ...wrapperStyle,
          display: isWidthFill ? 'flex' : 'inline-flex',
          flexDirection: 'column',
          width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width ? `${p.width}px` : '100%')),
          minHeight: isHeightFill ? '100%' : (isHeightHug ? 'auto' : (p.height ? `${p.height}px` : '')),
          height: isHeightFill ? '100%' : (isHeightHug ? 'auto' : 'auto'),
          background: getThemeColor(p.bgColor, '--bg'),
          borderColor: getThemeColor(p.borderColor, '--border'),
        })}"><div class="retro-window-titlebar"><span class="retro-window-title" style="color:${getThemeColor(p.textColor, '--accent')}">${escapeHtml(p.title)}</span>${closeBtnHtml}</div><div class="retro-window-content" style="${styleObjToString(paddedStyles)}">${renderChildren(p.layout?.direction || 'row')}</div></div>`;
        return html;
      }
      case 'Frame': {
        const borderValue = p.borderStyle === 'double' ? '3px double' : p.borderStyle === 'dashed' ? '1px dashed' : '1px solid';
        const html = `<div id="${comp.id}" class="retro-frame-wrapper" style="${styleObjToString({ 
          ...wrapperStyle,
          display: isWidthFill ? 'flex' : 'inline-flex',
          flexDirection: 'column',
          width: isWidthFill ? '100%' : (p.width ? `${p.width}px` : '100%'),
          height: isHeightFill ? '100%' : 'auto',
        })}"><fieldset class="retro-frame" style="${styleObjToString({
          border: `${borderValue} ${getThemeColor(p.borderColor, '--border')}`,
          background: p.bgColor || 'transparent',
          minHeight: isHeightFill ? '100%' : (p.height ? `${p.height}px` : 'auto'),
          height: isHeightFill ? '100%' : 'auto',
        })}"><legend style="color:${getThemeColor(p.textColor, '--accent')};font-size:${p.fontSize||12}px;text-align:${p.alignment||'left'};">${escapeHtml(p.title)}</legend><div class="retro-frame-content" style="${styleObjToString(layoutToStyles(p.layout))}">${renderChildren(p.layout?.direction || 'row')}</div></fieldset></div>`;
        return html;
      }
      case 'Row': {
        const rowDirection = p.layout?.direction || 'row';
        const html = `<div id="${comp.id}" class="retro-row" style="${styleObjToString({
          ...wrapperStyle,
          ...layoutToStyles(p.layout),
          width: isWidthFill ? '100%' : (p.width ? (typeof p.width === 'string' ? p.width : `${p.width}px`) : '100%'),
          minHeight: isHeightFill ? '100%' : (p.height ? (typeof p.height === 'string' ? p.height : `${p.height}px`) : '32px'),
          height: isHeightFill ? '100%' : 'auto',
        })}">${renderChildren(rowDirection)}</div>`;
        return html;
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
          onClickAttr = p.staggered 
            ? `onclick="goToScreen('${p.targetScreenId}', true)"` 
            : `onclick="goToScreen('${p.targetScreenId}')"`;
        } else if (p.action === 'overlay' && p.targetOverlayId) {
          onClickAttr = `onclick="toggleOverlay('${p.targetOverlayId}', true)"`;
        } else if (p.action === 'external' && p.href) {
          onClickAttr = `onclick="window.open('${escapeHtml(p.href)}','_blank')"`;
        } else if (p.action === 'email' && p.mailto) {
          onClickAttr = `onclick="location.href='mailto:${escapeHtml(p.mailto)}'"`;
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
        
        // Action-based rendering
        let onClickAttr = '';
        let linkStyle = '';
        if (p.action === 'screen' && p.targetScreenId) {
          onClickAttr = p.staggered 
            ? `onclick="goToScreen('${p.targetScreenId}', true)"` 
            : `onclick="goToScreen('${p.targetScreenId}')"`;
          linkStyle = 'text-decoration:underline;cursor:pointer;';
        } else if (p.action === 'overlay' && p.targetOverlayId) {
          onClickAttr = `onclick="toggleOverlay('${p.targetOverlayId}', true)"`;
          linkStyle = 'text-decoration:underline;cursor:pointer;';
        } else if (p.action === 'external' && p.href) {
          const html = `<a href="${escapeHtml(p.href)}" target="_blank" style="text-decoration:underline;color:inherit;display:inline-block;width:${isWidthFill?'100%':'auto'};"><span style="${style}">${innerContent}</span></a>`;
          return wrapComponent(html);
        } else if (p.action === 'email' && p.mailto) {
          onClickAttr = `onclick="location.href='mailto:${escapeHtml(p.mailto)}'"`;  
          linkStyle = 'text-decoration:underline;cursor:pointer;';
        }
        
        const html = onClickAttr
          ? wrapComponent(`<span style="${style};${linkStyle}" ${onClickAttr}>${innerContent}</span>`)
          : wrapComponent(`<span style="${style}">${innerContent}</span>`);
          
        return html;
      }
      case 'Input':
      case 'TextBox': {
        let inputContent = '';
        if (p.isOTP) {
          const digitCount = parseInt(p.digits) || 4;
          let inputs = '';
          for (let i = 0; i < digitCount; i++) {
            inputs += `<input class="retro-textbox" type="text" maxlength="1" style="width:36px;height:42px;text-align:center;font-size:18px;margin-right:8px;border-color:${getThemeColor(p.borderColor, '--text')};color:${getThemeColor(p.textColor, '--text')};background:${getThemeColor(p.bgColor, '--input-bg')};" ${p.readOnly ? 'readonly' : ''} ${p.disabled ? 'disabled' : ''} />`;
            if (digitCount === 6 && i === 2) inputs += `<span style="color:var(--border);margin-right:8px;align-self:center;">-</span>`;
          }
          inputContent = `<div style="display:flex;align-items:center;">${inputs}</div>`;
        } else {
          inputContent = `<input class="retro-textbox" type="${p.inputType || 'text'}" placeholder="${escapeHtml(p.placeholder)}" style="${styleObjToString({
            width: '100%',
            borderColor: getThemeColor(p.borderColor, '--text'),
            color: getThemeColor(p.textColor, '--text'),
            background: getThemeColor(p.bgColor, '--input-bg'),
          })}" ${p.readOnly ? 'readonly' : ''} ${p.disabled ? 'disabled' : ''} />`;
        }

        const finalHtml = p.label 
          ? `<div class="property-group" style="width: ${isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width ? `${p.width}px` : '150px'))};">
               <label>${escapeHtml(p.label)}</label>
               ${inputContent}
             </div>`
          : inputContent;

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
          width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width > 0 ? `${p.width}px` : '80px')),
          height: isHeightFill ? '100%' : (isHeightHug ? 'auto' : (p.height > 0 ? `${p.height}px` : '80px')),
          border: bStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'transparent'
        };

        // Si hay iconSrc (de la librería interna), lo priorizamos
        if (p.iconSrc) {
          const svgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(p.iconSrc)}`;
          const iconHtml = `<div style="width:100%;height:100%;background-color:${finalIconColor};mask-image:url('${svgDataUri}');mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:url('${svgDataUri}');-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;"></div>`;
          return wrapComponent(`<div class="image-icon-render" style="${styleObjToString(containerStyle)}">${iconHtml}</div>`);
        }

        if (isSvg && p.iconColor) {
          return wrapComponent(`<div style="${styleObjToString(containerStyle)}"><div style="width:100%;height:100%;background-color:${finalIconColor};mask-image:url('${p.src}');mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:url('${p.src}');-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;"></div></div>`);
        }

        if (p.src) {
          const imgStyle = isWidthHug || isHeightHug 
            ? `max-width:100%; height:auto; object-fit:contain;`
            : `width:100%; height:100%; object-fit:contain;`;
          return wrapComponent(`<div style="${styleObjToString(containerStyle)}"><img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.alt || '')}" style="${imgStyle}"></div>`);
        }
        return wrapComponent(`<div style="${styleObjToString(containerStyle)}"><span style="font-size:10px;color:var(--text-dim);">[IMG ${p.width || 80}x${p.height || 80}]</span></div>`);
      }
      case 'Form': {
        const layoutStyles = layoutToStyles(p.layout);
        const padding = p.padding || 10;
        const formInner = (comp.children || []).map(c => renderComponentExport(c, p.layout?.direction || 'row')).join('');
        const formStyles = {
          ...layoutStyles,
          width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width ? `${p.width}px` : '100%')),
          height: isHeightFill ? '100%' : (isHeightHug ? 'auto' : 'auto'),
          padding: `${padding}px`,
          boxSizing: 'border-box'
        };
        return wrapComponent(`<form class="retro-form" style="${styleObjToString(formStyles)}">${formInner}</form>`);
      }
      case 'DataRepeater': {
        const layoutStyles = layoutToStyles(p.layout);
        const repeaterInner = (comp.children || []).map(c => renderComponentExport(c, p.layout?.direction || 'row')).join('');
        const repeaterStyles = {
          ...layoutStyles,
          width: isWidthFill ? '100%' : (isWidthHug ? 'auto' : (p.width ? `${p.width}px` : '100%')),
          height: isHeightFill ? '100%' : (isHeightHug ? 'auto' : 'auto'),
          padding: '0',
          border: 'none',
          boxSizing: 'border-box'
        };
        // Export just one instance as a template placeholder
        return wrapComponent(`<div class="retro-data-repeater" style="${styleObjToString(repeaterStyles)}" data-table="${p.tableName || ''}">
          <!-- REPEATER TEMPLATE -->
          ${repeaterInner}
        </div>`);
      }
      case 'Loader': {
        const dur = (2 / (p.speed || 1)).toFixed(2);
        const color = getThemeColor(p.color, '--accent');
        const loaderWidth = isWidthFill ? '100%' : (p.width ? `${p.width}px` : 'auto');
        const loaderHeight = isHeightFill ? '100%' : (p.height ? `${p.height}px` : 'auto');
        
        let loaderInner = '';
        if (p.loaderType === 'dots') {
          loaderInner = `<div class="retro-loader-dots">
            <div style="width:${p.size/4}px;height:${p.size/4}px;background-color:${color};animation:retro-dots ${dur}s ease-in-out infinite;"></div>
            <div style="width:${p.size/4}px;height:${p.size/4}px;background-color:${color};animation:retro-dots ${dur}s ease-in-out infinite 0.2s;"></div>
            <div style="width:${p.size/4}px;height:${p.size/4}px;background-color:${color};animation:retro-dots ${dur}s ease-in-out infinite 0.4s;"></div>
          </div>`;
        } else if (p.loaderType === 'bar') {
          loaderInner = `<div class="retro-loader-bar" style="width:100%;height:${p.thickness||4}px;border:1px solid ${color};"><div style="background-color:${color};animation:retro-bar ${dur}s linear infinite;"></div></div>`;
        } else if (p.loaderType === 'bounce') {
          loaderInner = `<div class="retro-loader-bounce" style="width:${p.size}px;height:${p.size/2}px;"><div style="width:${p.size/3}px;height:${p.size/3}px;background-color:${color};animation:retro-bounce ${dur}s cubic-bezier(0.455,0.03,0.515,0.955) infinite alternate;"></div></div>`;
        } else {
          loaderInner = `<div class="retro-loader-spinner" style="width:${p.size}px;height:${p.size}px;border:${p.thickness||4}px solid rgba(255,255,255,0.1);border-top-color:${color};animation:retro-spin ${dur}s linear infinite;"></div>`;
        }
        return wrapComponent(`<div style="display:flex;align-items:center;justify-content:center;padding:10px;width:${loaderWidth};height:${loaderHeight};box-sizing:border-box;">${loaderInner}</div>`);
      }
      case 'Tabs': {
        const tabsArr = p.tabs || [];
        const activeIdx = p.activeTabIndex || 0;
        const containerId = `tabs-${comp.id}`;
        let headers = '';
        tabsArr.forEach((t, i) => {
          const isActive = i === activeIdx;
          headers += `<div class="retro-tab ${isActive?'active':''}" 
            id="${containerId}-header-${i}"
            onclick="switchTab('${containerId}', ${i})"
            style="padding:6px 12px;cursor:pointer;font-size:11px;font-family:monospace;border:1px solid var(--border);border-bottom:${isActive?'1px solid var(--bg)':'1px solid var(--border)'};background:${isActive?'var(--bg)':'rgba(0,0,0,0.2)'};color:${isActive?'var(--accent)':'var(--text-dim)'};margin-bottom:-1px;margin-right:2px;font-weight:${isActive?'bold':'normal'};white-space:nowrap;">${escapeHtml(t.label)}</div>`;
        });

        let contents = '';
        tabsArr.forEach((t, i) => {
          const isActive = i === activeIdx;
          const tabChildren = (comp.children || []).filter(c => (c.props?.tabIndex || 0) === i);
          const renderedTabChildren = tabChildren.map(renderComponentExport).join('');
          contents += `<div id="${containerId}-content-${i}" class="retro-tab-content" style="display:${isActive?'block':'none'};">
            <div style="${styleObjToString(layoutToStyles(p.layout))}">${renderedTabChildren}</div>
          </div>`;
        });

        return wrapComponent(`<div class="retro-tabs-container" id="${containerId}" style="width:100%;display:flex;flex-direction:column;"><div class="retro-tabs-header" style="display:flex;border-bottom:1px solid var(--border);">${headers}</div><div class="retro-tabs-content" style="border:1px solid var(--border);border-top:none;padding:12px;min-height:100px;background:var(--bg);position:relative;">${contents}</div></div>`);
      }
      case 'Overlay': {
        return `<div class="retro-overlay-mask" id="overlay-${comp.id}" style="position:fixed;top:0;left:0;right:0;bottom:0;background:${p.bgColor||'rgba(0,0,0,0.7)'};z-index:1000;display:none;align-items:center;justify-content:center;pointer-events:all;" onclick="this.style.display='none'">
          <div class="retro-window" style="width:400px;min-height:200px;background:${p.modalBg||'var(--panel-bg)'};border-color:${p.borderColor||'var(--border)'};position:relative;box-shadow:0 0 30px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
            <div class="retro-window-titlebar"><span class="retro-window-title">${escapeHtml(p.title)}</span><button class="retro-window-close" onclick="document.getElementById('overlay-${comp.id}').style.display='none'">X</button></div>
            <div class="retro-window-content" style="padding:20px;">${renderChildren()}</div>
          </div>
        </div>`;
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
      let blob;
      if (content instanceof Blob) {
        blob = content;
      } else if (typeof content === 'string' && content.startsWith('data:')) {
        // Direct data URI support
        const a = document.createElement('a');
        a.href = content;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      } else {
        // Convert raw string to Blob
        blob = new Blob([content], { type });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 10000);
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
    
    const screensHtml = screens.filter(s => s.kind !== 'world').map((screen, sIdx) => {
      const rows = screen.rows || [];
      const isSingleWindow = rows.length === 1 && rows[0].children?.length === 1 && rows[0].children[0].type === 'Window';
      
      const rowsHtml = rows.map(row => `<div class="layout-row" style="${styleObjToString({
        ...layoutToStyles(row.layout),
        width: '100%',
        margin: isSingleWindow ? '0' : '12px 0',
      })}">${(row.children || []).map(c => renderComponentExport(c, row.layout?.direction || 'row')).join('')}</div>`).join('');

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
.screen-container.staggered { background: transparent !important; }
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
  height: auto !important;
  background: transparent !important;
}
.retro-window-content {
  flex: 1 1 auto !important;
  min-height: 40px !important;
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

    // Get webTitle from screen 1 settings, fallback to project name
    const screen1 = screens.find(s => s.id === 'screen-1') || screens[0];
    const webTitle = screen1?.settings?.webTitle || currentProject.name || 'Prototype';
    const metaTags = screen1?.settings?.metaTags || '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(webTitle)}</title>
${metaTags}
<style>
${css}
</style>
</head>
<body class="${theme}">
  ${screensHtml}

  <script>
    let timer = null;

    function toggleOverlay(id, state) {
      const ov = document.getElementById(id);
      if (!ov) return;
      if (state === undefined) {
        ov.style.display = ov.style.display === 'none' ? 'flex' : 'none';
      } else {
        ov.style.display = state ? 'flex' : 'none';
      }
    }

    function switchTab(containerId, index) {
      const container = document.getElementById(containerId);
      if (!container) return;
      
      // Update headers
      container.querySelectorAll('.retro-tab').forEach((h, i) => {
        const isActive = i === index;
        h.style.background = isActive ? 'var(--bg)' : 'rgba(0,0,0,0.2)';
        h.style.color = isActive ? 'var(--accent)' : 'var(--text-dim)';
        h.style.borderBottom = isActive ? '1px solid var(--bg)' : '1px solid var(--border)';
        h.style.fontWeight = isActive ? 'bold' : 'normal';
      });
      
      // Update contents
      container.querySelectorAll('.retro-tab-content').forEach((c, i) => {
        c.style.display = i === index ? 'block' : 'none';
      });
    }

    function closeScreen(btn) {
      const screen = btn.closest('.screen-container');
      if (screen) {
        screen.style.display = 'none';
        screen.style.position = '';
        screen.style.zIndex = '';
      }
    }

    function goToScreen(screenId, staggered) {
      if (timer) clearTimeout(timer);
      
      if (staggered) {
        // Staggered mode: overlay the new screen on top
        const target = document.getElementById(screenId);
        if (target) {
          target.style.display = 'block';
          target.style.position = 'fixed';
          target.style.top = Math.floor(Math.random() * 60 + 20) + 'px';
          target.style.left = Math.floor(Math.random() * 60 + 20) + 'px';
          target.style.width = 'auto';
          target.style.height = 'auto';
          target.style.maxWidth = '80vw';
          target.style.maxHeight = '80vh';
          target.style.overflow = 'auto';
          target.style.zIndex = '1000';
          target.style.boxShadow = '8px 8px 0px rgba(0,0,0,0.5)';
          target.style.border = 'none';
          target.style.background = 'transparent';
          target.classList.add('staggered');
          
          // Remove padding from preview area to keep shadow tight
          const preview = target.querySelector('.preview-area');
          if (preview) preview.style.padding = '0';
        }
      } else {
        // Normal mode: hide all, show target
        document.querySelectorAll('.screen-container').forEach(s => {
          s.style.display = 'none';
          s.style.position = '';
          s.style.zIndex = '';
        });
        
        const target = document.getElementById(screenId);
        if (target) {
          target.style.display = 'block';
          window.scrollTo(0, 0);
        }
      }
      
      // Handle auto-jump timer
      const target = document.getElementById(screenId);
      if (target) {
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
    setNewProjectName('');
    setShowNewProjectModal(true);
  };

  const handleConfirmNewProject = () => {
    if (!newProjectName.trim()) return;
    const name = newProjectName.trim();
    const id = mkId();
    setCurrentProject({ id, name });
    const initialScreens = [{ id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }];
    setScreens(initialScreens);
    setCurrentScreenId('screen-1');
    setSelectedIds([]);
    setActiveWindow(null);
    setDatabase({ tables: [], data: {} });
    setGameMode(false);
    setAssetsState({ sprites: [], tilesets: [], sounds: [], backgrounds: [] });
    assetsDirty.current = false;
    setShowProjects(false);
    setShowNewProjectModal(false);
  };

  useEffect(() => {
    window.openDatabasePanel = () => setViewMode('database');
    return () => { delete window.openDatabasePanel; };
  }, []);

  const loadProject = async (id) => {
    try {
      const res = await apiFetch(`/api/projects/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentProject({ id: data.id, name: data.name });
      setShowProjects(false);
    } catch (err) {
      console.error('Load error:', err);
    }
  };

  const deleteProject = async (id) => {
    if (!confirm('Delete project?')) return;
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (currentProject.id === id) {
        isInitialLoading.current = true;
        setCurrentProject({ id: 'default', name: 'Untitled' });
        setScreens([{ id: 'screen-1', name: 'Screen 1', rows: [], settings: { timeout: 0, nextScreenId: null } }]);
        setCurrentScreenId('screen-1');
        setSelectedIds([]);
        setActiveWindow(null);
        setDatabase({ tables: [], data: {} });
        setGameMode(false);
        setAssetsState({ sprites: [], tilesets: [], sounds: [], backgrounds: [] });
        assetsDirty.current = false;
        
        setTimeout(() => {
          isInitialLoading.current = false;
        }, 500);
      }
      fetchProjects();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const renameProject = async (id, name) => {
    try {
      const res = await apiFetch(`/api/projects/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const updated = { ...data, name };
      await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (currentProject.id === id) setCurrentProject(p => ({ ...p, name }));
      setEditingProjectId(null);
      fetchProjects();
    } catch (err) {
      console.error('Rename error:', err);
    }
  };

  const selectedElement = findSelected();
  const isRowSelected = selectedElement && (activeScreen?.rows || []).some(r => selectedIds.includes(r.id));
  // Find the first selected ID that maps to an entity in the active level.
  // Entities live outside the rows tree so findSelected() can't see them.
  const selectedEntity = (activeLevel && selectedIds.length > 0)
    ? (activeLevel.entities || []).find(e => selectedIds.includes(e.id)) || null
    : null;

  return (
    <DndProvider backend={HTML5Backend}>
      {/* Game Mode visual cues — pulsing accent on the toggle, plus
          marching-ant stripes around all four sides of the viewport so
          the user has a constant peripheral reminder they're authoring a
          game project rather than a regular app. */}
      <style>{`
        @keyframes gm-pulse {
          0%, 100% { box-shadow: 0 0 4px var(--accent), inset 0 0 4px var(--accent); }
          50%      { box-shadow: 0 0 14px var(--accent), inset 0 0 8px var(--accent); }
        }
        .toolbar-btn.gm-active {
          background: var(--accent);
          color: var(--bg);
          font-weight: bold;
          letter-spacing: 0.5px;
          animation: gm-pulse 1.8s ease-in-out infinite;
          position: relative;
        }
        .toolbar-btn.gm-active::before {
          content: '◆';
          margin-right: 6px;
          opacity: 0.85;
        }
        /* Marching-ant border around the .main-layout area (toolbox +
           canvas + inspector). Excludes top toolbar and bottom status bar
           by design. The stripe pattern is 24px; animation translates 24px
           so motion is continuously visible. */
        @keyframes gm-stripe-h { from { background-position: 0 0; } to { background-position: 10px 0; } }
        @keyframes gm-stripe-v { from { background-position: 0 0; } to { background-position: 0 10px; } }
        .gm-frame {
          position: absolute;
          z-index: 1000;
          pointer-events: none;
        }
        .gm-frame-top, .gm-frame-bottom {
          left: 0; right: 0; height: 1px;
          background-image: repeating-linear-gradient(
            90deg,
            var(--accent) 0, var(--accent) 6px,
            transparent 6px, transparent 10px
          );
          background-size: 10px 1px;
        }
        .gm-frame-left, .gm-frame-right {
          top: 0; bottom: 0; width: 1px;
          background-image: repeating-linear-gradient(
            0deg,
            var(--accent) 0, var(--accent) 6px,
            transparent 6px, transparent 10px
          );
          background-size: 1px 10px;
        }
        .gm-frame-top    { top: 0;    animation: gm-stripe-h 1.2s linear infinite; }
        .gm-frame-bottom { bottom: 0; animation: gm-stripe-h 1.2s linear infinite reverse; }
        .gm-frame-left   { left: 0;   animation: gm-stripe-v 1.2s linear infinite; }
        .gm-frame-right  { right: 0;  animation: gm-stripe-v 1.2s linear infinite reverse; }
        .app.gm-on .toolbox h3 { color: var(--accent); }
      `}</style>
      <div className={`app ${theme}${gameMode ? ' gm-on' : ''}`}>
        <div className="toolbar">
          {Object.entries(THEMES).map(([key, t]) => (
            <button key={key} className={`toolbar-btn ${theme === key ? 'active' : ''}`} onClick={() => setTheme(key)}>{t.name}</button>
          ))}
          <span className="toolbar-sep">|</span>
          <button
            className={`toolbar-btn ${gameMode ? 'gm-active' : ''}`}
            onClick={() => setGameMode(g => !g)}
            title="Toggle Game Mode"
          >
            Game Mode
          </button>
          {gameMode && (
            <button
              className={`toolbar-btn ${showSpriteSheetManager ? 'active' : ''}`}
              onClick={() => setShowSpriteSheetManager(s => !s)}
              title="Sprite Sheet Manager"
            >
              Sprites
            </button>
          )}
          <span className="toolbar-sep">|</span>
          <button className={`toolbar-btn ${viewMode === 'desktop' ? 'active' : ''}`} onClick={() => setViewMode('desktop')}>Desktop</button>
          <button className={`toolbar-btn ${viewMode === 'mobile' ? 'active' : ''}`} onClick={() => setViewMode('mobile')}>Mobile</button>
          <span className="toolbar-sep">|</span>
          <button className="toolbar-btn" onClick={exportHTML}>Export</button>
          <button className="toolbar-btn" onClick={() => setShowDatabase(!showDatabase)}>Database</button>
          <button className="toolbar-btn" onClick={() => setShowProjects(!showProjects)}>Projects</button>
          <button className="toolbar-btn" onClick={() => selectedIds.length > 0 && duplicateComponent(selectedIds)} disabled={selectedIds.length === 0}>Duplicate</button>
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
          {currentUser && (
            <button
              className="toolbar-btn"
              onClick={handleLogout}
              title={`Signed in as ${currentUser.email}`}
              style={{ fontSize: 11, opacity: 0.7 }}
            >
              {currentUser.email.split('@')[0]} ✕
            </button>
          )}
        </div>

        <div className="main-layout" style={{ position: 'relative' }}>
          {gameMode && (
            <>
              <div className="gm-frame gm-frame-top" />
              <div className="gm-frame gm-frame-bottom" />
              <div className="gm-frame gm-frame-left" />
              <div className="gm-frame gm-frame-right" />
            </>
          )}
          <Toolbox gameMode={gameMode} />
          <div ref={canvasContainerRef} className="canvas-container" style={{ position: 'relative', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {gameMode && activeScreen?.kind === 'world' && (
              <LevelTabs
                world={activeScreen}
                onSelectLevel={selectLevel}
                onAddLevel={addLevel}
                onMoveLevel={moveLevel}
                onDeleteLevel={deleteLevel}
                onDuplicateLevel={duplicateLevel}
                layer={levelLayer}
                onLayerChange={(k) => {
                  setLevelLayer(k);
                  setIsPlaying(false);
                  if (activeScreen?.id && activeLevel?.id) {
                    updateLevel(activeScreen.id, activeLevel.id, { editorLayer: k });
                  }
                }}
                canPlay={!!activeLevel}
                isPlaying={isPlaying}
                onTogglePlay={() => { setPaintBrush(null); setIsPlaying(p => !p); }}
                onUpdateLevelType={(levelId, lt) => activeScreen?.id && updateLevel(activeScreen.id, levelId, { levelType: lt })}
              />
            )}
            {!activeScreen && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: 24, zIndex: 5,
                background: 'var(--bg)',
              }}>
                <div>
                  [ No {gameMode ? 'world' : 'screen'} selected ]<br />
                  <span style={{ opacity: 0.6, fontSize: 10 }}>
                    Open the {gameMode ? 'Worlds' : 'Journey'} panel and add {gameMode ? 'a World' : 'a Screen'} to start.
                  </span>
                </div>
              </div>
            )}
            {activeLevel && isPlaying ? (
              <RuntimeView
                world={activeScreen}
                assets={assets}
                onStop={() => setIsPlaying(false)}
                viewMode={viewMode}
                activeLevelId={activeLevel?.id}
              />
            ) : activeLevel && levelLayer === 'game' ? (
              <LevelCanvas
                level={activeLevel}
                worldId={activeScreen.id}
                assets={assets}
                selectedIds={selectedIds}
                onSelectEntity={(id, shift) => { selectRow(id, shift); setPaintBrush(null); }}
                onDeselect={() => setSelectedIds([])}
                onAddEntity={(type, position) => addEntity(activeScreen.id, activeLevel.id, type, position)}
                onMoveEntity={(id, position) => updateEntity(activeScreen.id, activeLevel.id, id, { position })}
                onDeleteEntities={(ids) => deleteEntities(activeScreen.id, activeLevel.id, ids)}
                paintBrush={paintBrush}
                onUpdateLevel={(patch) => updateLevel(activeScreen.id, activeLevel.id, patch)}
              />
            ) : (
            <Canvas
              rows={rows}
              selectedIds={selectedIds}
              onSelect={(id, multi) => selectRow(id, multi)}
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
              onUpdateComponent={updateComponent}
              onSaveRecord={(tableName, record) => {
                setDatabase(prev => ({
                  ...prev,
                  data: {
                    ...prev.data,
                    [tableName]: [...(prev.data[tableName] || []), { ...record, id: Date.now() }]
                  }
                }));
              }}
              onLogin={(tableName, credentials) => {
                const table = database.data[tableName] || [];
                const user = table.find(u => 
                  String(u.email || u.username) === String(credentials.email || credentials.username) && 
                  String(u.password) === String(credentials.password)
                );
                if (user) {
                  setCurrentUser(user);
                  alert(`Welcome back, ${user.name || user.email}!`);
                  return true;
                } else {
                  alert('Invalid credentials.');
                  return false;
                }
              }}
              currentUser={currentUser}
            />
            )}

            {showUserJourney && (
              <UserJourneyPanel
                screens={visibleScreens}
                currentScreenId={currentScreenId}
                onSelect={setCurrentScreenId}
                onAdd={addScreen}
                onDelete={deleteScreen}
                onMove={moveScreen}
                onClose={() => setShowUserJourney(false)}
                setConfirmModal={setConfirmModal}
                gameMode={gameMode}
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
              borderRadius: '0',
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
            key={selectedIds.join(',') || (selectedLevelId ? `level:${selectedLevelId}` : 'none')}
            component={selectedElement}
            onUpdate={updateComponent}
            onDelete={() => selectedIds.length > 0 && (selectedEntity ? deleteEntities(activeScreen.id, activeLevel.id, selectedIds) : deleteComponent(selectedIds))}
            onDuplicate={() => selectedIds.length > 0 && duplicateComponent(selectedIds)}
            isRow={isRowSelected}
            database={database}
            screens={screens}
            activeScreen={activeScreen}
            onUpdateScreen={updateScreen}
            windows={getWindows()}
            overlays={getOverlays()}
            canvasPadding={canvasPadding}
            onCanvasPaddingChange={setCanvasPadding}
            selectedIds={selectedIds}
            themeColors={THEMES[theme]}
            gameMode={gameMode}
            assets={assets}
            selectedLevel={(levelLayer === 'game' && activeLevel) ? activeLevel : null}
            onUpdateLevel={(levelId, patch) => activeScreen?.id && updateLevel(activeScreen.id, levelId, patch)}
            selectedEntity={selectedEntity}
            onUpdateEntity={(entityId, patch) => activeLevel && updateEntity(activeScreen.id, activeLevel.id, entityId, patch)}
            paintBrush={paintBrush}
            onSetPaintBrush={setPaintBrush}
            onAddBackgroundLayer={(assetId) => activeLevel && addBackgroundLayer(activeScreen.id, activeLevel.id, assetId)}
            onUpdateBackgroundLayer={(layerId, patch) => activeLevel && updateBackgroundLayer(activeScreen.id, activeLevel.id, layerId, patch)}
            onRemoveBackgroundLayer={(layerId) => activeLevel && removeBackgroundLayer(activeScreen.id, activeLevel.id, layerId)}
            onMoveBackgroundLayer={(layerId, direction) => activeLevel && moveBackgroundLayer(activeScreen.id, activeLevel.id, layerId, direction)}
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
            <div className="projects-modal" 
                 onClick={e => e.stopPropagation()}
                 onKeyDown={e => e.key === 'Escape' && setShowProjects(false)}
                 tabIndex={-1}
            >
              <div className="modal-titlebar">
                <span className="modal-title">[ Project Manager ]</span>
                <button className="modal-close" onClick={() => setShowProjects(false)}>X</button>
              </div>
              <div className="modal-body">
                <button className="modal-action-btn" onClick={newProject}>+ New Project</button>
                <div className="modal-divider" />
                {projectList.map(proj => (
                  <div key={proj.id} className="project-item">
                    <div className="project-name-cell">
                      {editingProjectId === proj.id ? (
                        <input 
                          autoFocus
                          type="text"
                          value={editingProjectName}
                          onChange={e => setEditingProjectName(e.target.value)}
                          onBlur={() => renameProject(proj.id, editingProjectName)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameProject(proj.id, editingProjectName);
                            if (e.key === 'Escape') setEditingProjectId(null);
                          }}
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '2px 4px', width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                        />
                      ) : (
                        <div style={{ color: 'var(--text)', fontWeight: 'bold', cursor: 'pointer' }}
                             onClick={() => { setEditingProjectId(proj.id); setEditingProjectName(proj.name); }}>{proj.name}</div>
                      )}
                      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{proj.lastSaved}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="small-btn" onClick={() => loadProject(proj.id)}>Load</button>
                      <button className="small-btn danger" onClick={() => deleteProject(proj.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0 }}>
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showNewProjectModal && (
          <div className="projects-overlay" onClick={() => setShowNewProjectModal(false)}>
            <div className="projects-modal" 
                 onClick={e => e.stopPropagation()} 
                 style={{ maxWidth: '300px' }}
                 onKeyDown={e => {
                   if (e.key === 'Escape') setShowNewProjectModal(false);
                 }}
                 tabIndex={-1}
            >
              <div className="modal-titlebar">
                <span className="modal-title">[ Create Project ]</span>
                <button className="modal-close" onClick={() => setShowNewProjectModal(false)}>X</button>
              </div>
              <div className="modal-body">
                <div className="property-group">
                  <label>PROJECT NAME</label>
                  <input 
                    type="text" 
                    value={newProjectName} 
                    onChange={e => setNewProjectName(e.target.value)} 
                    autoFocus
                    placeholder="Type new project name..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmNewProject();
                      if (e.key === 'Escape') setShowNewProjectModal(false);
                    }}
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px', width: '100%', fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="modal-action-btn" onClick={handleConfirmNewProject} style={{ padding: '8px 24px' }}>Create</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="projects-overlay" onClick={() => setShowSettings(false)}>
            <div className="projects-modal" 
                 onClick={e => e.stopPropagation()} 
                 style={{ maxWidth: '400px' }}
                 onKeyDown={e => e.key === 'Escape' && setShowSettings(false)}
                 tabIndex={-1}
            >
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
                </div>
              </div>
            </div>
          </div>
        )}

        {showDatabase && (
          <DatabasePanel database={database} setDatabase={setDatabase} onClose={() => setShowDatabase(false)} />
        )}

        {showSpriteSheetManager && (
          <SpriteSheetManager
            assets={assets}
            setAssets={setAssets}
            onClose={() => setShowSpriteSheetManager(false)}
            setConfirmModal={setConfirmModal}
          />
        )}

        {/* Auth Modal — login / register / OAuth */}
        {showLogin && (
          <div className="projects-overlay" style={{ zIndex: 99999 }}>
            <div className="projects-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
              <div className="modal-titlebar">
                <span className="modal-title">[ TUIFY ]</span>
              </div>
              <div className="modal-body">
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
                  {['login', 'register'].map(mode => (
                    <button key={mode} onClick={() => { setLoginMode(mode); setLoginError(''); }}
                      style={{ flex: 1, padding: '6px 0', fontFamily: 'monospace', fontSize: 11, background: loginMode === mode ? 'var(--selected)' : 'transparent', color: loginMode === mode ? 'var(--text)' : 'var(--text-dim)', border: 'none', borderBottom: loginMode === mode ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {mode === 'login' ? 'Sign In' : 'Register'}
                    </button>
                  ))}
                </div>

                {/* Login form */}
                {loginMode === 'login' && (
                  <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-dim)' }}>EMAIL</label>
                      <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@example.com" autoFocus required
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-dim)' }}>PASSWORD</label>
                      <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="••••••••" required
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    {loginError && <div style={{ color: '#ff4444', fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }}>{loginError}</div>}
                    <div className="modal-divider" />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href="/api/auth/x" style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', fontFamily: 'monospace' }}>𝕏</a>
                        <a href="/api/auth/google" style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', fontFamily: 'monospace' }}>G</a>
                      </div>
                      <button type="submit" className="modal-action-btn" disabled={loginLoading}
                        style={{ background: 'var(--accent)', color: 'var(--bg)', minWidth: 80 }}>
                        {loginLoading ? 'Signing in...' : 'Sign In'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Register form */}
                {loginMode === 'register' && (
                  <form onSubmit={handleRegister}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-dim)' }}>DISPLAY NAME</label>
                      <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Your name" autoFocus
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-dim)' }}>EMAIL</label>
                      <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" required
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-dim)' }}>PASSWORD</label>
                      <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Min. 8 characters" required
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-dim)' }}>CONFIRM PASSWORD</label>
                      <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="••••••••" required
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    {loginError && <div style={{ color: '#ff4444', fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }}>{loginError}</div>}
                    <div className="modal-divider" />
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button type="submit" className="modal-action-btn" disabled={loginLoading}
                        style={{ background: 'var(--accent)', color: 'var(--bg)', minWidth: 80 }}>
                        {loginLoading ? 'Creating account...' : 'Create Account'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Confirm Modal — inside app div so theme CSS variables work */}
        {confirmModal && (
          <div className="projects-overlay" style={{ zIndex: 10000 }} onClick={() => setConfirmModal(null)}>
            <div className="projects-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <div className="modal-titlebar">
                <span className="modal-title">[ {confirmModal.title} ]</span>
                <button className="modal-close" onClick={() => setConfirmModal(null)}>X</button>
              </div>
              <div className="modal-body">
                <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                  {confirmModal.message}
                </div>
                <div className="modal-divider" />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button className="modal-action-btn" onClick={() => setConfirmModal(null)}>
                    Cancel
                  </button>
                  <button 
                    className="modal-action-btn" 
                    onClick={confirmModal.onConfirm}
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                  >
                    {confirmModal.confirmText || 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
}

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M14 10V17M10 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── User Journey Auxiliary Components ──────────────────────────────────────


function DraggableScreenCard({ screen, index, currentScreenId, onSelect, onDelete, onMove, setConfirmModal, gameMode = false, canDelete = false }) {
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
        {screen.kind === 'world' ? (
          <div style={{ fontSize: 9, opacity: 0.6, color: 'var(--accent)' }}>
            [ World · {(screen.levels || []).length} level{(screen.levels || []).length === 1 ? '' : 's'} ]
          </div>
        ) : screen.rows.length > 0 ? (
          <div style={{ fontSize: 9, opacity: 0.5 }}>[ {gameMode ? 'Screen' : 'Screen'} {index + 1} ]</div>
        ) : (
          <div style={{ fontSize: 9, opacity: 0.3 }}>[ Empty ]</div>
        )}
      </div>
      <div className="uj-screen-info">
        <span className="uj-screen-name">{screen.name}</span>
        {canDelete && (
          <button
            className="uj-screen-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(screen.id);
            }}
          >
            delete
          </button>
        )}
      </div>
    </div>
  );
}

function UserJourneyPanel({ screens, currentScreenId, onSelect, onAdd, onDelete, onMove, onClose, setConfirmModal, gameMode = false }) {
  // Worlds can always be deleted; regular screens cannot delete the last one.
  const cardCanDelete = (screen) => gameMode ? true : screens.length > 1;
  return (
    <div className="user-journey-panel">
      <div className="uj-header">
        <span>[ {gameMode ? 'WORLDS' : 'USER JOURNEY'} ]</span>
        <button className="uj-close" onClick={onClose}>X</button>
      </div>
      <div className="uj-content">
        <div className="uj-screens-list">
          {screens.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 12, textAlign: 'center' }}>
              [ No {gameMode ? 'worlds' : 'screens'} yet ]
            </div>
          )}
          {screens.map((screen, idx) => (
            <DraggableScreenCard
              key={screen.id}
              screen={screen}
              index={idx}
              currentScreenId={currentScreenId}
              onSelect={onSelect}
              onDelete={onDelete}
              onMove={onMove}
              setConfirmModal={setConfirmModal}
              gameMode={gameMode}
              canDelete={cardCanDelete(screen)}
            />
          ))}
          <button className="uj-add-screen" onClick={onAdd}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>+</div>
            <span>{gameMode ? 'Add World' : 'Add Screen'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
