// Standalone game player entry point.
// Bundled as an IIFE via vite.runtime.config.js → public/runtime/tuify-game.js
//
// Expected page shape:
//   window.__TUIFY_WORLD__  = { id, name, levels: [...], ... }
//   window.__TUIFY_ASSETS__ = { sprites, tilesets, sounds, backgrounds }

import { GameRuntime } from './gameRuntime.js';

const KEY_MAP = {
  ArrowLeft: 'left',  a: 'left',  A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up',    w: 'up',    W: 'up',
  ArrowDown: 'down', s: 'down',  S: 'down',
  ' ': 'jump',
  z: 'attack', Z: 'attack',
  e: 'interact', E: 'interact',
  Shift: 'dash',
};

// ─── Lightweight DOM HUD renderer ────────────────────────────────────────────
// Mirrors the component tree structure used by GameHUD.jsx but produces plain
// DOM nodes so it works in the published standalone page (no React).

function layoutToObj(layout = {}) {
  return {
    display:        'flex',
    flexDirection:  layout.direction  || 'row',
    gap:            (layout.gap != null ? layout.gap : 8) + 'px',
    alignItems:     layout.align      || 'flex-start',
    justifyContent: layout.justify    || 'flex-start',
    flexWrap:       layout.wrap ? 'wrap' : 'nowrap',
    paddingTop:    (layout.paddingTop    || 0) + 'px',
    paddingRight:  (layout.paddingRight  || 0) + 'px',
    paddingBottom: (layout.paddingBottom || 0) + 'px',
    paddingLeft:   (layout.paddingLeft   || 0) + 'px',
  };
}

function applyStyles(el, styles) {
  Object.assign(el.style, styles);
}

function hudWrapperStyle(p = {}) {
  const sizing = p.sizing || {};
  const wFill  = sizing.widthMode  === 'fill';
  const hFill  = sizing.heightMode === 'fill';
  return {
    display:   (wFill || hFill) ? 'flex' : 'inline-flex',
    flex:      wFill ? '1 1 0' : (hFill ? '1 1 auto' : '0 0 auto'),
    alignSelf: (hFill || (wFill && (p.layout?.direction || 'row') === 'column')) ? 'stretch' : 'auto',
    minWidth:  '0',
    boxSizing: 'border-box',
    maxWidth:  '100%',
  };
}

function renderHudNode(comp, onNavigate) {
  const { type = '', props = {}, children = [] } = comp || {};
  const p = props;
  const layout = p.layout || {};
  const sizing = p.sizing || {};

  const wrap = document.createElement('div');
  applyStyles(wrap, hudWrapperStyle(p));

  const handleClick = () => {
    if (p.action === 'level'    && p.targetLevelId)  onNavigate(p.targetLevelId);
    else if (p.action === 'screen'   && p.targetScreenId) onNavigate(p.targetScreenId);
    else if (p.action === 'external' && p.href)           window.open(p.href, '_blank');
  };

  // ── Row ──────────────────────────────────────────────────────────────────
  if (type === 'Row') {
    applyStyles(wrap, { ...layoutToObj(p.layout), width: '100%', minHeight: '0' });
    (children || []).forEach(c => wrap.appendChild(renderHudNode(c, onNavigate)));
    return wrap;
  }

  // ── Window ───────────────────────────────────────────────────────────────
  if (type === 'Window') {
    const win = document.createElement('div');
    const w = p.width  ? (typeof p.width  === 'number' ? p.width  + 'px' : p.width)  : 'auto';
    const h = p.height ? (typeof p.height === 'number' ? p.height + 'px' : p.height) : 'auto';
    applyStyles(win, {
      border: '1px solid #33ff33',
      background: p.bgColor || '#0a0a0a',
      color: p.textColor || '#33ff33',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      width: sizing.widthMode  === 'hug' ? 'auto' : (sizing.widthMode  === 'fill' ? '100%' : w),
      height: sizing.heightMode === 'hug' ? 'auto' : (sizing.heightMode === 'fill' ? '100%' : h),
      overflow: 'hidden',
    });
    if (p.title) {
      const tb = document.createElement('div');
      applyStyles(tb, { background: '#33ff33', color: '#0a0a0a', padding: '2px 6px', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', flexShrink: '0', userSelect: 'none' });
      tb.textContent = p.title;
      win.appendChild(tb);
    }
    const body = document.createElement('div');
    applyStyles(body, { ...layoutToObj(layout), flex: '1', overflow: 'auto' });
    (children || []).forEach(c => body.appendChild(renderHudNode(c, onNavigate)));
    win.appendChild(body);
    wrap.appendChild(win);
    return wrap;
  }

  // ── Frame ─────────────────────────────────────────────────────────────────
  if (type === 'Frame') {
    const frm = document.createElement('div');
    const w = p.width  ? (typeof p.width  === 'number' ? p.width  + 'px' : p.width)  : 'auto';
    const h = p.height ? (typeof p.height === 'number' ? p.height + 'px' : p.height) : 'auto';
    applyStyles(frm, {
      ...layoutToObj(layout),
      border: p.borderColor ? `1px solid ${p.borderColor}` : '1px solid transparent',
      background: p.bgColor || 'transparent',
      color: '#33ff33',
      width: sizing.widthMode  === 'hug' ? 'auto' : (sizing.widthMode  === 'fill' ? '100%' : w),
      height: sizing.heightMode === 'hug' ? 'auto' : (sizing.heightMode === 'fill' ? '100%' : h),
    });
    (children || []).forEach(c => frm.appendChild(renderHudNode(c, onNavigate)));
    wrap.appendChild(frm);
    return wrap;
  }

  // ── Button ────────────────────────────────────────────────────────────────
  if (type === 'Button') {
    const btn = document.createElement('button');
    applyStyles(btn, {
      background: 'transparent',
      border: '1px solid #33ff33',
      color: '#33ff33',
      fontFamily: 'monospace',
      fontSize: '11px',
      padding: '4px 10px',
      cursor: 'pointer',
      letterSpacing: '1px',
      outline: 'none',
      width: sizing.widthMode === 'fill' ? '100%' : (p.width ? (typeof p.width === 'number' ? p.width + 'px' : p.width) : 'auto'),
    });
    btn.textContent = p.label || '';
    btn.addEventListener('click', handleClick);
    btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(51,255,51,0.12)'; });
    btn.addEventListener('mouseout',  () => { btn.style.background = 'transparent'; });
    wrap.appendChild(btn);
    return wrap;
  }

  // ── Text / Label ──────────────────────────────────────────────────────────
  if (type === 'Text' || type === 'Label') {
    const span = document.createElement('span');
    applyStyles(span, {
      color: p.textColor || '#33ff33',
      fontFamily: 'monospace',
      fontSize: (p.size || 12) + 'px',
      whiteSpace: 'pre-wrap',
    });
    span.textContent = p.text || p.label || '';
    wrap.appendChild(span);
    return wrap;
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  if (type === 'Image') {
    const img = document.createElement('img');
    img.src = p.src || '';
    img.alt = p.alt || '';
    const w = sizing.widthMode  === 'fill' ? '100%' : (p.width  ? (typeof p.width  === 'number' ? p.width  + 'px' : p.width)  : 'auto');
    const h = sizing.heightMode === 'fill' ? '100%' : (p.height ? (typeof p.height === 'number' ? p.height + 'px' : p.height) : 'auto');
    applyStyles(img, { display: 'block', width: w, height: h, maxWidth: '100%', objectFit: p.bgImageFit || 'contain' });
    wrap.appendChild(img);
    return wrap;
  }

  // ── Shape ─────────────────────────────────────────────────────────────────
  if (type === 'Shape') {
    const s = document.createElement('div');
    const w = p.width  ? (typeof p.width  === 'number' ? p.width  + 'px' : p.width)  : '100%';
    const h = p.height ? (typeof p.height === 'number' ? p.height + 'px' : p.height) : '4px';
    applyStyles(s, { width: w, height: h, background: p.color || '#33ff33', flexShrink: '0' });
    wrap.appendChild(s);
    return wrap;
  }

  // ── Unknown / container fallback ──────────────────────────────────────────
  (children || []).forEach(c => wrap.appendChild(renderHudNode(c, onNavigate)));
  return wrap;
}

function renderHudRows(rows, onNavigate) {
  const container = document.createElement('div');
  applyStyles(container, { width: '100%', display: 'flex', flexDirection: 'column' });

  const isSingleWindow =
    rows?.length === 1 &&
    rows[0]?.children?.length === 1 &&
    rows[0].children[0].type === 'Window';

  (rows || []).forEach(row => {
    const rowEl = document.createElement('div');
    applyStyles(rowEl, {
      ...layoutToObj(row.layout),
      width: '100%',
      margin: isSingleWindow ? '0' : '12px 0',
      ...(isSingleWindow ? { justifyContent: 'center', alignItems: 'center' } : {}),
    });
    (row.children || []).forEach(c => rowEl.appendChild(renderHudNode(c, onNavigate)));
    container.appendChild(rowEl);
  });

  return container;
}

// ─── Level-type-aware level switcher ─────────────────────────────────────────

let activeRuntime = null;
let onDown = null;
let onUp   = null;

function stopActiveGame() {
  if (activeRuntime) { activeRuntime.stop(); activeRuntime = null; }
  if (onDown) { window.removeEventListener('keydown', onDown, { capture: true }); onDown = null; }
  if (onUp)   { window.removeEventListener('keyup',   onUp,   { capture: true }); onUp   = null; }
}

function sizeViewportFrame(container, canvas, viewportW, viewportH) {
  // Match RuntimeView exactly: fixed pixel frame, no CSS transform.
  // canvas CSS = pixel buffer dims; container = same dims so HUD aligns.
  canvas.style.width  = viewportW + 'px';
  canvas.style.height = viewportH + 'px';
  container.style.width  = viewportW + 'px';
  container.style.height = viewportH + 'px';
}

// Show a level — handles hud-only, game+hud, and game.
// canvas:     <canvas> element for the game renderer
// hudEl:      <div> overlay for the HUD component tree
// navigate:   fn(levelId) — called when a HUD button navigates to another level
function showLevel(world, assets, canvas, hudEl, levelId, navigate) {
  stopActiveGame();

  const level = world.levels.find(l => l.id === levelId) || world.levels[0];
  if (!level) return;

  const levelType = level.levelType || 'game';
  const showGame  = levelType === 'game' || levelType === 'game+hud';
  const showHUD   = levelType === 'hud-only' || levelType === 'game+hud';
  const hasHudRows = (level.rows || []).length > 0;

  // Update breadcrumb
  const breadcrumb = document.getElementById('level-name');
  if (breadcrumb) breadcrumb.textContent = level.name || '';

  // ── HUD overlay ──────────────────────────────────────────────────────────
  if (hudEl) {
    hudEl.innerHTML = '';
    if (showHUD && hasHudRows) {
      hudEl.style.display = 'flex';
      hudEl.style.flexDirection = 'column';
      const isSingleWindow =
        level.rows?.length === 1 &&
        level.rows[0]?.children?.length === 1 &&
        level.rows[0].children[0].type === 'Window';
      if (isSingleWindow) {
        hudEl.style.alignItems = 'center';
        hudEl.style.justifyContent = 'center';
      } else {
        hudEl.style.alignItems = '';
        hudEl.style.justifyContent = '';
      }
      hudEl.appendChild(renderHudRows(level.rows, navigate));
    } else {
      hudEl.style.display = 'none';
    }
  }

  // ── Game canvas ──────────────────────────────────────────────────────────
  if (!showGame) {
    canvas.style.display = 'none';
    return;
  }

  canvas.style.display = 'block';

  const tileW = level.tileMap?.tileWidth  || 32;
  const tileH = level.tileMap?.tileHeight || 32;
  const viewportW = (level.viewportCols || 20) * tileW;
  const viewportH = (level.viewportRows || 14) * tileH;

  canvas.width  = viewportW;
  canvas.height = viewportH;

  const container = canvas.parentElement;
  if (container) sizeViewportFrame(container, canvas, viewportW, viewportH);

  const rt = new GameRuntime({ level, assets, canvas });
  activeRuntime = rt;

  onDown = (e) => { const a = KEY_MAP[e.key]; if (!a) return; e.preventDefault(); rt.setInput(a, true); };
  onUp   = (e) => { const a = KEY_MAP[e.key]; if (!a) return; rt.setInput(a, false); };
  window.addEventListener('keydown', onDown, { capture: true });
  window.addEventListener('keyup',   onUp,   { capture: true });

  // Start game directly once assets load; ignore load failures (match RuntimeView behaviour).
  rt.preloadPromise.catch(() => {}).then(() => {
    if (activeRuntime !== rt) return;
    rt.start();
    canvas.focus({ preventScroll: true });
  });
}

// ─── Embed scaling ────────────────────────────────────────────────────────────
// Mirrors EmbedRuntime.jsx exactly: set CSS width/height on the canvas
// (pixel buffer stays at native), flex-center wrapper handles alignment.
function applyEmbedScale(container, canvas, nativeW, nativeH, scaling, maintainAspect) {
  canvas.style.transform = '';
  const update = () => {
    const cw = container.clientWidth  || nativeW;
    const ch = container.clientHeight || nativeH;
    if (scaling === 'fixed') {
      canvas.style.width  = nativeW + 'px';
      canvas.style.height = nativeH + 'px';
      return;
    }
    let displayW, displayH;
    if (!maintainAspect) {
      displayW = cw;
      displayH = ch;
    } else if (scaling === 'fill') {
      const s = Math.max(cw / nativeW, ch / nativeH);
      displayW = Math.round(nativeW * s);
      displayH = Math.round(nativeH * s);
    } else {
      const s = Math.min(cw / nativeW, ch / nativeH);
      displayW = Math.round(nativeW * s);
      displayH = Math.round(nativeH * s);
    }
    canvas.style.width  = displayW + 'px';
    canvas.style.height = displayH + 'px';
  };
  update();
  new ResizeObserver(update).observe(container);
}

// ─── Multiple inline embeds (GameEmbed component in page export) ──────────────
function initEmbeds() {
  const embeds = window.__TUIFY_EMBEDS__;
  if (!Array.isArray(embeds) || !embeds.length) return;

  embeds.forEach(({ canvasId, hudElId, world, assets: embedAssets, scaling = 'fit', maintainAspect = true }) => {
    if (!world?.levels?.length) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const hudEl    = hudElId ? document.getElementById(hudElId) : null;
    const safeAssets = embedAssets || { sprites: [], tilesets: [], sounds: [], backgrounds: [] };
    let rt = null;
    let localDown = null;
    let localUp   = null;

    function stopEmbed() {
      if (rt) { rt.stop(); rt = null; }
      if (localDown) { canvas.removeEventListener('keydown', localDown, { capture: true }); localDown = null; }
      if (localUp)   { canvas.removeEventListener('keyup',   localUp,   { capture: true }); localUp   = null; }
    }

    function navigate(levelId) {
      const target = world.levels.find(l => l.id === levelId);
      if (!target) return;
      startEmbed(levelId);
    }

    function startEmbed(levelId) {
      stopEmbed();
      const level = world.levels.find(l => l.id === levelId) || world.levels[0];
      if (!level) return;

      const levelType  = level.levelType || 'game';
      const showGame   = levelType === 'game' || levelType === 'game+hud';
      const showHUD    = levelType === 'hud-only' || levelType === 'game+hud';
      const hasHudRows = (level.rows || []).length > 0;

      // ── HUD overlay ────────────────────────────────────────────────────────
      if (hudEl) {
        hudEl.innerHTML = '';
        if (showHUD && hasHudRows) {
          hudEl.style.display = 'flex';
          hudEl.style.flexDirection = 'column';
          const isSingleWindow =
            level.rows?.length === 1 &&
            level.rows[0]?.children?.length === 1 &&
            level.rows[0].children[0].type === 'Window';
          hudEl.style.alignItems    = isSingleWindow ? 'center' : '';
          hudEl.style.justifyContent = isSingleWindow ? 'center' : '';
          hudEl.appendChild(renderHudRows(level.rows, navigate));
        } else {
          hudEl.style.display = 'none';
        }
      }

      // ── Game canvas ────────────────────────────────────────────────────────
      if (!showGame) {
        canvas.style.display = 'none';
        return;
      }

      canvas.style.display = 'block';

      const tileW = level.tileMap?.tileWidth  || 32;
      const tileH = level.tileMap?.tileHeight || 32;
      const vW = (level.viewportCols || 20) * tileW;
      const vH = (level.viewportRows || 14) * tileH;

      // Set pixel buffer only — CSS display size is owned by applyEmbedScale
      canvas.width  = vW;
      canvas.height = vH;

      // canvas is inside a flex-center div; outer container has the defined dimensions
      const outerContainer = canvas.parentElement?.parentElement;
      if (outerContainer) applyEmbedScale(outerContainer, canvas, vW, vH, scaling, maintainAspect);

      const newRt = new GameRuntime({ level, assets: safeAssets, canvas });
      rt = newRt;

      localDown = (e) => { const a = KEY_MAP[e.key]; if (!a) return; e.preventDefault(); newRt.setInput(a, true); };
      localUp   = (e) => { const a = KEY_MAP[e.key]; if (!a) return; newRt.setInput(a, false); };
      canvas.addEventListener('keydown', localDown, { capture: true });
      canvas.addEventListener('keyup',   localUp,   { capture: true });

      newRt.preloadPromise.catch(() => {}).then(() => {
        if (rt !== newRt) return;
        newRt.start();
        canvas.focus({ preventScroll: true });
      });
    }

    canvas.addEventListener('click', () => canvas.focus({ preventScroll: true }));
    startEmbed(world.startLevelId || world.levels[0]?.id);
  });
}

// ─── Standalone init ──────────────────────────────────────────────────────────
function init() {
  if (window.__TUIFY_EMBEDS__) { initEmbeds(); return; }

  // Support __TUIFY_WORLDS__ (all worlds, new format) and
  // __TUIFY_WORLD__ (single world, legacy format — wrap in array).
  const worlds = window.__TUIFY_WORLDS__ ||
    (window.__TUIFY_WORLD__ ? [window.__TUIFY_WORLD__] : null);
  const assets = window.__TUIFY_ASSETS__ || { sprites: [], tilesets: [], sounds: [], backgrounds: [] };

  if (!worlds?.length) {
    document.body.innerHTML = '<p style="color:#f44;font-family:monospace;padding:20px">No world data.</p>';
    return;
  }

  const canvas = document.getElementById(window.__TUIFY_CANVAS_ID__ || 'game-canvas');
  const hudEl  = document.getElementById('hud-overlay');
  if (!canvas) return;

  canvas.addEventListener('click', () => canvas.focus({ preventScroll: true }));

  // Navigate to any level or world by ID — searches across ALL worlds.
  // Same principle as user journey: start at first world/level, navigate freely.
  function navigate(targetId) {
    // Search all worlds for a matching level
    for (const w of worlds) {
      if ((w.levels || []).some(l => l.id === targetId)) {
        showLevel(w, assets, canvas, hudEl, targetId, navigate);
        return;
      }
    }
    // Target is a world ID — start that world from its first level
    const targetWorld = worlds.find(w => w.id === targetId);
    if (targetWorld?.levels?.length) {
      const startId = targetWorld.startLevelId || targetWorld.levels[0]?.id;
      showLevel(targetWorld, assets, canvas, hudEl, startId, navigate);
    }
  }

  // Start at first world's first level — same rule as page export starting at screen 1.
  const firstWorld = worlds[0];
  const startId = firstWorld.startLevelId || firstWorld.levels?.[0]?.id;
  showLevel(firstWorld, assets, canvas, hudEl, startId, navigate);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
