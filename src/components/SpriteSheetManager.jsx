// SpriteSheetManager — modal for managing the project's game asset
// catalog: sprite sheets (with frame grids and named animations),
// tilesets (used by TileMap in Phase 3+), and sounds (positional audio
// in Phase 4+). Storage lives in App.assets which is persisted as a
// sidecar file (see vite.config.js /api/projects/:id/assets).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import GIF from 'gif.js';
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url';
import { loadMaskedImage, pickColorAt } from '../lib/imageMask';
import { NumericInput } from '../lib/inputs';

const mkId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// Resolve a gap value. Storage supports three shapes for full flexibility:
//   number              → uniform across all gaps and rows
//   number[]            → per-position 1D, replicated to every row
//   number[][]          → 2D, explicit per-row × per-position
// `axisIdx` is the row for gapX (the row this gap lives in) and the column
// for gapY (the column this gap lives in). `gapIdx` is which gap-position
// in that row/column (0..N-2).
function gapAt(gap, axisIdx, gapIdx) {
  if (Array.isArray(gap)) {
    if (Array.isArray(gap[0])) return Number(gap[axisIdx]?.[gapIdx]) || 0;
    return Number(gap[gapIdx]) || 0;
  }
  return Number(gap) || 0;
}

// Write a single gap value at (axisIdx, gapIdx). Promotes the storage shape
// only when needed: a number stays a number if you write the same value;
// a 1D array becomes 2D only when a row diverges from the rest.
function gapWrite(gap, axisIdx, gapIdx, value, axisCount, gapCount) {
  const v = Number(value) || 0;
  // From scalar
  if (typeof gap === 'number' || gap == null) {
    if (v === Number(gap || 0)) return gap; // no change
    // Promote to 2D explicit
    const next = [];
    for (let r = 0; r < axisCount; r++) {
      const row = new Array(gapCount).fill(Number(gap) || 0);
      next.push(row);
    }
    next[axisIdx][gapIdx] = v;
    return next;
  }
  // From 1D array (uniform across rows)
  if (Array.isArray(gap) && !Array.isArray(gap[0])) {
    const flat = gap;
    if ((Number(flat[gapIdx]) || 0) === v) return gap; // no change
    const next = [];
    for (let r = 0; r < axisCount; r++) {
      const row = new Array(gapCount).fill(0);
      for (let g = 0; g < gapCount; g++) row[g] = Number(flat[g]) || 0;
      next.push(row);
    }
    next[axisIdx][gapIdx] = v;
    return next;
  }
  // From 2D array
  const next = gap.map(row => Array.isArray(row) ? [...row] : []);
  while (next.length < axisCount) next.push(new Array(gapCount).fill(0));
  next[axisIdx] = (next[axisIdx] || []).slice(0, gapCount);
  while (next[axisIdx].length < gapCount) next[axisIdx].push(0);
  next[axisIdx][gapIdx] = v;
  return next;
}

// Resolve per-axis offset. Number = uniform across all rows/cols. Array =
// per-row (for offsetLeft) or per-col (for offsetTop). Reads back-compat
// names offsetX / offsetY too.
function offsetLeftAt(frame, row) {
  const v = frame?.offsetLeft ?? frame?.offsetX ?? 0;
  if (Array.isArray(v)) return Number(v[row]) || 0;
  return Number(v) || 0;
}
function offsetTopAt(frame, col) {
  const v = frame?.offsetTop ?? frame?.offsetY ?? 0;
  if (Array.isArray(v)) return Number(v[col]) || 0;
  return Number(v) || 0;
}

// Compute the source (sx, sy) of the cell at (col, row) given a frame config.
// gapX is indexed by the row this cell sits in (allowing per-row variation),
// gapY by the column (allowing per-column variation). Same idea for offsets.
function cellOrigin(frame, col, row) {
  let x = offsetLeftAt(frame, row);
  for (let i = 0; i < col; i++) x += frame.width + gapAt(frame.gapX, row, i);
  let y = offsetTopAt(frame, col);
  for (let i = 0; i < row; i++) y += frame.height + gapAt(frame.gapY, col, i);
  return { x, y };
}

// Render an animation to an animated GIF in the browser and trigger a
// download. Uses gif.js (Web Worker–based encoder). Frame delay is derived
// from the animation's FPS. Returns a Promise that resolves on download.
function exportAnimationGIF(sheet, animation) {
  return new Promise((resolve, reject) => {
    if (!sheet?.src || !animation?.frames?.length) {
      reject(new Error('Animation has no frames'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const f = sheet.frame;
      const cols = Math.max(1, f.cols || 1);
      const fw = f.width, fh = f.height;
      const fps = Math.max(1, animation.fps || 6);
      const delay = Math.round(1000 / fps);

      // GIF supports 1-bit transparency via a sentinel color. We paint the
      // sprite onto a magenta canvas first so any fully-transparent source
      // pixels stay magenta in the encoded GIF; gif.js then maps that
      // exact color to "transparent" in the output palette. Semi-transparent
      // pixels (typical edge antialiasing) will blend with magenta — fine
      // for pixel-art sprites with binary alpha.
      const TRANSPARENT_KEY = 0xff00ff;
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: fw,
        height: fh,
        workerScript: gifWorkerUrl,
        transparent: TRANSPARENT_KEY,
      });

      const canvas = document.createElement('canvas');
      canvas.width = fw;
      canvas.height = fh;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      for (const idx of animation.frames) {
        const cx = idx % cols;
        const cy = Math.floor(idx / cols);
        const { x: sx, y: sy } = cellOrigin(f, cx, cy);
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, fw, fh);
        ctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
        gif.addFrame(ctx, { copy: true, delay });
      }

      gif.on('finished', (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sheet.name || 'sprite'}-${animation.name || 'anim'}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      });
      gif.on('abort', () => reject(new Error('GIF rendering aborted')));
      gif.render();
    };
    img.onerror = () => reject(new Error('Failed to load source image'));
    img.src = sheet.src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Frames-list input. Same idea as NumericInput but for comma-separated
// integer arrays. Editing happens locally as a string so the user can type
// commas and intermediate values without the parser stripping them away.
function FramesInput({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(Array.isArray(value) ? value.join(',') : '');
  useEffect(() => { setDraft(Array.isArray(value) ? value.join(',') : ''); }, [value]);
  const commit = () => {
    const parsed = draft.split(',').map(s => s.trim()).filter(s => s !== '').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));
    setDraft(parsed.join(','));
    onCommit(parsed);
  };
  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur(); } }}
      {...rest}
    />
  );
}

// Number-or-comma-list input for gaps. Stores as either a single number or
// an array of N-1 numbers (one per gap between cells).
function GapInput({ value, onCommit, ...rest }) {
  const initial = Array.isArray(value) ? value.join(',') : (value == null ? '0' : String(value));
  const [draft, setDraft] = useState(initial);
  useEffect(() => {
    setDraft(Array.isArray(value) ? value.join(',') : (value == null ? '0' : String(value)));
  }, [value]);
  const commit = () => {
    const parts = draft.split(',').map(s => s.trim()).filter(s => s !== '').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));
    if (parts.length === 0) { setDraft('0'); onCommit(0); return; }
    if (parts.length === 1) { setDraft(String(parts[0])); onCommit(parts[0]); return; }
    setDraft(parts.join(','));
    onCommit(parts);
  };
  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur(); } }}
      {...rest}
    />
  );
}

// NumericInput moved to src/lib/inputs.jsx — imported above. Anywhere a
// committed numeric value is edited should use it instead of raw <input>.

// ─── Animation preview canvas ────────────────────────────────────────────
// Bounded to MAX_PREVIEW px on the longest side so high-resolution sprites
// don't blow up the modal. Render size at runtime is decided by the entity
// in the world, not by this preview.
const MAX_PREVIEW = 96;

function AnimationPreview({ sheet, animation }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);

  const animTransparent = sheet?.frame?.transparentColor || null;
  const animTolerance = sheet?.frame?.transparentTolerance ?? 0;
  useEffect(() => {
    if (!sheet?.src) return;
    let cancelled = false;
    loadMaskedImage(sheet.src, animTransparent, animTolerance).then(entry => {
      if (cancelled || !entry) return;
      imgRef.current = entry.img;
      setImgReady(true);
    });
    return () => { cancelled = true; imgRef.current = null; setImgReady(false); };
  }, [sheet?.src, animTransparent, animTolerance]);

  const frames = animation?.frames || [];
  const fps = Math.max(1, animation?.fps || 6);
  const loop = animation?.loop !== false;

  // Reset to frame 0 when the frame list or playing flag changes meaningfully.
  useEffect(() => { setFrame(0); }, [frames.length]);

  // Tick playback.
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const interval = setInterval(() => {
      setFrame(f => {
        const next = f + 1;
        if (next >= frames.length) return loop ? 0 : f;
        return next;
      });
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [playing, frames.length, fps, loop]);

  // Draw the current frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgReady || !sheet?.frame) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!frames.length) return;
    const frameIdx = frames[frame] ?? 0;
    const f = sheet.frame;
    const cols = Math.max(1, f.cols || 1);
    const cx = frameIdx % cols;
    const cy = Math.floor(frameIdx / cols);
    const { x: sx, y: sy } = cellOrigin(f, cx, cy);
    ctx.drawImage(imgRef.current, sx, sy, f.width, f.height, 0, 0, canvas.width, canvas.height);
  }, [frame, frames, imgReady, sheet?.frame?.width, sheet?.frame?.height, sheet?.frame?.cols,
      sheet?.frame?.offsetX, sheet?.frame?.offsetY, sheet?.frame?.offsetLeft, sheet?.frame?.offsetTop,
      JSON.stringify(sheet?.frame?.gapX), JSON.stringify(sheet?.frame?.gapY)]);

  const fw = sheet?.frame?.width || 32;
  const fh = sheet?.frame?.height || 32;
  const ratio = Math.min(1, MAX_PREVIEW / Math.max(fw, fh));
  const w = Math.max(16, Math.round(fw * ratio));
  const h = Math.max(16, Math.round(fh * ratio));

  const canPlay = frames.length > 1;
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      padding: 0, gap: 4, width: Math.max(w + 8, 110), flex: '0 0 auto',
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.4)', padding: 2,
        backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%), linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%)',
        backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px',
      }}>
        <canvas ref={canvasRef} width={w} height={h} style={{ display: 'block', imageRendering: 'pixelated' }} />
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', width: '100%' }}>
        <button
          type="button"
          className="small-btn"
          onClick={() => setPlaying(p => !p)}
          title={!canPlay ? 'Add more frames to enable playback' : (playing ? 'Pause' : 'Play')}
          disabled={!canPlay}
          style={{ padding: '0 6px', minWidth: 24, opacity: canPlay ? 1 : 0.4 }}
        >{playing && canPlay ? '❚❚' : '▶'}</button>
        <input
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={frame}
          disabled={!canPlay}
          onChange={e => { setPlaying(false); setFrame(parseInt(e.target.value, 10)); }}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
        {frames.length ? `${frame + 1}/${frames.length}  (frame #${frames[frame]})` : '— no frames —'}
      </div>
    </div>
  );
}

// ─── Inline gap badge: positioned absolutely over the canvas ────────────
// Shows the current gap value; click to edit inline. Commits on blur or
// Enter through onCommit(newValue).
function GapBadge({ value, x, y, axis, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => { if (/^-?\d*$/.test(e.target.value)) setDraft(e.target.value); }}
        onBlur={() => { setEditing(false); const n = parseInt(draft, 10); onCommit(Number.isNaN(n) ? value : n); }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
        style={{
          position: 'absolute', left: x, top: y,
          width: 36, padding: '1px 3px',
          fontSize: 10, fontFamily: 'monospace',
          background: 'var(--bg)', color: 'var(--accent)',
          border: '1px solid var(--accent)', borderRadius: 2,
          transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 4,
        }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title={`${axis}-gap: click to edit`}
      style={{
        position: 'absolute', left: x, top: y,
        transform: 'translate(-50%, -50%)',
        padding: '1px 5px', fontSize: 10, fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.85)', color: 'var(--accent)',
        border: '1px solid var(--accent)', borderRadius: 2,
        cursor: 'pointer', userSelect: 'none', zIndex: 3,
        whiteSpace: 'nowrap',
      }}
    >{value}</span>
  );
}

// ─── Sprite sheet thumbnail with grid overlay ────────────────────────────
// Renders the source PNG at reduced opacity so grid lines stay visible on
// any background, then draws a black halo behind each yellow line for
// extra contrast on light sprites. Inline gap badges are positioned over
// the canvas at the midpoints between cells.
function SheetGridPreview({ sheet, maxWidth = 240, dimImage = true, onSize, onUpdateFrame, isPicking = false, onPickColor = null }) {
  const canvasRef = useRef(null);
  const [renderInfo, setRenderInfo] = useState(null); // { ratio, cellW, cellH }
  const [badgesVisible, setBadgesVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
  const zoomIn  = () => setZoom(z => ZOOM_STEPS.find(s => s > z) || z);
  const zoomOut = () => setZoom(z => [...ZOOM_STEPS].reverse().find(s => s < z) || z);
  const zoomReset = () => setZoom(1);

  const transparentColor = sheet?.frame?.transparentColor || null;
  const transparentTolerance = sheet?.frame?.transparentTolerance ?? 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sheet?.src) return;
    let cancelled = false;
    loadMaskedImage(sheet.src, transparentColor, transparentTolerance).then(entry => {
      if (cancelled || !entry) return;
      const img = entry.img;
      onSize?.({ width: entry.width, height: entry.height });
      const ratio = Math.min(1, maxWidth / entry.width);
      canvas.width = entry.width * ratio;
      canvas.height = entry.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      // Subtle checker so transparent pixels are visible against the bg.
      if (transparentColor) {
        const sq = 8;
        for (let y = 0; y < canvas.height; y += sq) {
          for (let x = 0; x < canvas.width; x += sq) {
            ctx.fillStyle = ((x / sq + y / sq) & 1) ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
            ctx.fillRect(x, y, sq, sq);
          }
        }
      }
      ctx.globalAlpha = dimImage ? 0.55 : 1;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      const f = sheet.frame || {};
      if (f.width && f.height && f.cols && f.rows) {
        const cellW = f.width * ratio;
        const cellH = f.height * ratio;
        setRenderInfo({ ratio, cellW, cellH, canvasW: canvas.width, canvasH: canvas.height });
        const drawCellRect = (cx, cy) => {
          const origin = cellOrigin(f, cx, cy);
          const x = origin.x * ratio;
          const y = origin.y * ratio;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
          ctx.strokeStyle = 'rgba(255,230,0,1)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
        };
        for (let r = 0; r < f.rows; r++) {
          for (let c = 0; c < f.cols; c++) drawCellRect(c, r);
        }
        // Frame index labels share visibility with the gap badges so the
        // double-click toggle clears the whole overlay (helpful when the
        // image background is what the user wants to read, e.g. picking
        // the transparent color with the eyedropper).
        if (f.cols * f.rows > 1 && badgesVisible) {
          ctx.font = 'bold 10px monospace';
          ctx.textBaseline = 'top';
          for (let r = 0; r < f.rows; r++) {
            for (let c = 0; c < f.cols; c++) {
              const origin = cellOrigin(f, c, r);
              const x = origin.x * ratio + 3;
              const y = origin.y * ratio + 2;
              const label = String(r * f.cols + c);
              ctx.fillStyle = 'rgba(0,0,0,0.85)';
              ctx.fillText(label, x + 1, y + 1);
              ctx.fillStyle = 'rgba(255,230,0,1)';
              ctx.fillText(label, x, y);
            }
          }
        }
      }
    });
    return () => { cancelled = true; };
  }, [sheet?.src, transparentColor,
      sheet?.frame?.width, sheet?.frame?.height, sheet?.frame?.cols, sheet?.frame?.rows,
      sheet?.frame?.offsetX, sheet?.frame?.offsetY, sheet?.frame?.offsetLeft, sheet?.frame?.offsetTop,
      JSON.stringify(sheet?.frame?.gapX), JSON.stringify(sheet?.frame?.gapY),
      sheet?.frame?.transparentTolerance,
      badgesVisible, maxWidth, dimImage, onSize]);

  // Render gap badges on top of the canvas. Positioned at the midpoint of
  // each gap segment so they hover between cells. Visible only when there
  // are gaps to edit (cols >= 2 for X, rows >= 2 for Y) and an updater.
  const f = sheet?.frame || {};
  const cols = f.cols || 0;
  const rows = f.rows || 0;
  const canEdit = !!onUpdateFrame && renderInfo && badgesVisible;
  const xBadges = [];
  const yBadges = [];
  if (canEdit) {
    const { ratio, cellW, cellH } = renderInfo;
    if (cols >= 2 && rows >= 1) {
      for (let r = 0; r < rows; r++) {
        for (let g = 0; g < cols - 1; g++) {
          const value = gapAt(f.gapX, r, g);
          const cellEnd = cellOrigin(f, g, r);
          // Badge positions live in displayed pixels — multiply the canvas-
          // internal coordinates by the current zoom so badges align with
          // the visually scaled image.
          const x = (cellEnd.x * ratio + cellW + (value * ratio) / 2) * zoom;
          const y = (cellEnd.y * ratio + cellH / 2) * zoom;
          xBadges.push(
            <GapBadge
              key={`x-${r}-${g}`}
              value={value}
              x={x} y={y}
              axis="X"
              onCommit={n => onUpdateFrame({ gapX: gapWrite(f.gapX, r, g, n, rows, cols - 1) })}
            />
          );
        }
      }
    }
    if (rows >= 2 && cols >= 1) {
      for (let c = 0; c < cols; c++) {
        for (let g = 0; g < rows - 1; g++) {
          const value = gapAt(f.gapY, c, g);
          const cellEnd = cellOrigin(f, c, g);
          const x = (cellEnd.x * ratio + cellW / 2) * zoom;
          const y = (cellEnd.y * ratio + cellH + (value * ratio) / 2) * zoom;
          yBadges.push(
            <GapBadge
              key={`y-${c}-${g}`}
              value={value}
              x={x} y={y}
              axis="Y"
              onCommit={n => onUpdateFrame({ gapY: gapWrite(f.gapY, c, g, n, cols, rows - 1) })}
            />
          );
        }
      }
    }
  }

  const canvasW = renderInfo?.canvasW || 0;
  const canvasH = renderInfo?.canvasH || 0;
  const canvasStyle = zoom === 1
    ? { display: 'block', border: '1px solid var(--border)', imageRendering: 'pixelated', maxWidth: '100%' }
    : { display: 'block', border: '1px solid var(--border)', imageRendering: 'pixelated', width: canvasW * zoom, height: canvasH * zoom, maxWidth: 'none' };

  return (
    <div style={{ display: 'block', maxWidth: '100%' }}>
      {/* Zoom toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
        fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace',
      }}>
        <span style={{ marginRight: 4 }}>zoom</span>
        <button type="button" className="small-btn" onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]} title="Zoom out" style={{ minWidth: 24, padding: '0 6px' }}>−</button>
        <button type="button" className="small-btn" onClick={zoomReset} title="Reset zoom" style={{ minWidth: 44, padding: '0 6px' }}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="small-btn" onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} title="Zoom in" style={{ minWidth: 24, padding: '0 6px' }}>+</button>
        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
          {onUpdateFrame ? 'dbl-click image to toggle gap editor' : ''}
        </span>
      </div>
      <div
        // Scrollable wrapper so zoomed-in canvases stay inside the panel
        // instead of pushing the layout. Badges live INSIDE this wrapper so
        // they scroll together with the image.
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          maxHeight: 480,
          overflow: zoom === 1 ? 'visible' : 'auto',
          border: zoom !== 1 ? '1px dashed var(--border)' : 'none',
        }}
        onDoubleClick={() => onUpdateFrame && setBadgesVisible(v => !v)}
        title={onUpdateFrame ? 'Double-click to toggle gap editor visibility' : ''}
      >
        <div style={{ position: 'relative', width: zoom !== 1 ? canvasW * zoom : 'auto', display: 'inline-block' }}>
          <canvas
            ref={canvasRef}
            style={{ ...canvasStyle, cursor: isPicking ? 'crosshair' : (canvasStyle.cursor || 'default') }}
            onClick={(e) => {
              if (!isPicking || !onPickColor || !renderInfo) return;
              const rect = canvasRef.current.getBoundingClientRect();
              // Map click position back to source-image coordinates.
              const cx = (e.clientX - rect.left) / rect.width;
              const cy = (e.clientY - rect.top) / rect.height;
              const sx = Math.floor(cx * renderInfo.canvasW / renderInfo.ratio);
              const sy = Math.floor(cy * renderInfo.canvasH / renderInfo.ratio);
              pickColorAt(sheet.src, sx, sy).then(color => onPickColor(color));
            }}
          />
          {xBadges}
          {yBadges}
        </div>
        {onUpdateFrame && !badgesVisible && (
          <div style={{
            position: 'sticky', top: 4, marginLeft: 4, display: 'inline-block',
            padding: '2px 6px', fontSize: 9, fontFamily: 'monospace',
            background: 'rgba(0,0,0,0.85)', color: 'var(--accent)',
            border: '1px solid var(--accent)',
            pointerEvents: 'none',
          }}>
            gap editor hidden · dbl-click to show
          </div>
        )}
      </div>
    </div>
  );
}

// Color-key transparency controls — a color input + eyedropper button. The
// eyedropper toggles `picking` on the parent so the next click on the
// SheetGridPreview resolves a color from that pixel.
function TransparentColorControls({ value, onChange, tolerance = 0, onChangeTolerance, picking, onTogglePicker }) {
  const safe = value || '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="color"
          value={safe || '#000000'}
          onChange={e => onChange(e.target.value)}
          title="Color treated as transparent"
          style={{ width: 28, height: 22, padding: 0, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
        />
        <input
          type="text"
          value={safe}
          placeholder="#rrggbb"
          onChange={e => onChange(e.target.value)}
          style={{ width: 80, fontFamily: 'monospace', fontSize: 11 }}
        />
        <button
          type="button"
          className="small-btn"
          onClick={onTogglePicker}
          title="Pick the color directly from the image"
          style={{
            background: picking ? 'var(--accent)' : 'transparent',
            color: picking ? 'var(--bg)' : 'var(--accent)',
            borderColor: 'var(--accent)',
          }}
        >{picking ? '◉ click image' : '◎ eyedropper'}</button>
        {safe && (
          <button
            type="button"
            className="small-btn"
            onClick={() => onChange('')}
            title="Disable color-key transparency"
          >clear</button>
        )}
      </div>
      {safe && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-dim)' }}>
          <span style={{ minWidth: 60 }}>tolerance</span>
          <input
            type="range"
            min={0}
            max={64}
            value={tolerance}
            onChange={e => onChangeTolerance(parseInt(e.target.value, 10) || 0)}
            style={{ flex: 1 }}
            title="How close a pixel color has to be to count as the transparent color. Useful for anti-aliased edges."
          />
          <span style={{ minWidth: 24, textAlign: 'right', color: 'var(--accent)' }}>±{tolerance}</span>
        </div>
      )}
    </div>
  );
}

// ─── Sprite sheets tab ───────────────────────────────────────────────────
function SpriteSheetsTab({ sheets, onChange, confirmDelete }) {
  const [selectedId, setSelectedId] = useState(sheets[0]?.id || null);
  const [sourceSize, setSourceSize] = useState(null);
  const [picking, setPicking] = useState(false);
  const selected = sheets.find(s => s.id === selectedId) || null;

  const importSheet = async (file) => {
    const src = await readFileAsDataUrl(file);
    const id = mkId();
    const sheet = {
      id,
      kind: 'spriteSheet',
      name: file.name.replace(/\.[^.]+$/, ''),
      src,
      // offsetX/Y = pixels skipped from the top-left before the first cell.
      // gapX/Y    = pixels of empty space between cells. Both common in
      // packed sprite atlases.
      frame: { width: 32, height: 32, cols: 1, rows: 1, offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 },
      animations: [],
    };
    onChange(prev => [...prev, sheet]);
    setSelectedId(id);
  };

  const updateSheet = (id, patch) => {
    onChange(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };
  const updateFrame = (id, patch) => {
    onChange(prev => prev.map(s => s.id === id ? { ...s, frame: { ...(s.frame || {}), ...patch } } : s));
  };
  const removeSheet = (id) => {
    const target = sheets.find(s => s.id === id);
    confirmDelete(
      'Delete sprite sheet',
      `Delete "${target?.name || 'this sheet'}"? Any entity referencing it will lose its sprite.`,
      () => {
        onChange(prev => prev.filter(s => s.id !== id));
        if (selectedId === id) setSelectedId(null);
      }
    );
  };

  const addAnimation = (sheetId) => {
    onChange(prev => prev.map(s => {
      if (s.id !== sheetId) return s;
      // Default to ALL frames in the configured grid so the animation
      // starts playing immediately. User can edit the FRAMES list to keep
      // only specific cells (e.g. just walk-cycle frames).
      const total = Math.max(1, (s.frame?.cols || 1) * (s.frame?.rows || 1));
      const allFrames = Array.from({ length: total }, (_, i) => i);
      const next = { id: mkId(), name: `anim_${(s.animations || []).length + 1}`, frames: allFrames, fps: 6, loop: true };
      return { ...s, animations: [...(s.animations || []), next] };
    }));
  };
  const updateAnimation = (sheetId, animId, patch) => {
    onChange(prev => prev.map(s => {
      if (s.id !== sheetId) return s;
      return { ...s, animations: (s.animations || []).map(a => a.id === animId ? { ...a, ...patch } : a) };
    }));
  };
  const removeAnimation = (sheetId, animId) => {
    onChange(prev => prev.map(s => {
      if (s.id !== sheetId) return s;
      return { ...s, animations: (s.animations || []).filter(a => a.id !== animId) };
    }));
  };

  return (
    <div style={{ display: 'flex', gap: 12, height: '100%', minHeight: 320, minWidth: 0 }}>
      {/* Sidebar list */}
      <div style={{ width: 180, flex: '0 0 180px', borderRight: '1px solid var(--border)', paddingRight: 8, overflowY: 'auto', overflowX: 'hidden' }}>
        <label className="small-btn" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', marginBottom: 8 }}>
          + Import PNG
          <input
            type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) { importSheet(e.target.files[0]); e.target.value = ''; } }}
          />
        </label>
        {sheets.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', padding: 12 }}>
            [ No sprite sheets ]
          </div>
        )}
        {sheets.map(s => (
          <div
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            style={{
              padding: '4px 6px', fontSize: 11, cursor: 'pointer',
              background: selectedId === s.id ? 'var(--selected)' : 'transparent',
              color: selectedId === s.id ? 'var(--accent)' : 'var(--text)',
              border: '1px solid var(--border)', marginBottom: 2,
            }}
          >{s.name}</div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: '1 1 0', minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {!selected && (
          <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: 24 }}>
            Select or import a sprite sheet to begin.
          </div>
        )}
        {selected && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 4 }}>
              <div className="property-group" style={{ flex: '1 1 0', margin: 0 }}>
                <label>NAME</label>
                <input type="text" value={selected.name} onChange={e => updateSheet(selected.id, { name: e.target.value })} />
              </div>
              <label
                className="small-btn"
                style={{ cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
                title="Replace the source image — all frame config and animations are preserved"
              >
                ↩ Replace image
                <input
                  type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    const src = await readFileAsDataUrl(e.target.files[0]);
                    updateSheet(selected.id, { src });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="property-group">
              <label>TRANSPARENT COLOR (legacy PNGs without alpha)</label>
              <TransparentColorControls
                value={selected.frame?.transparentColor || ''}
                onChange={v => updateFrame(selected.id, { transparentColor: v || null })}
                tolerance={selected.frame?.transparentTolerance ?? 0}
                onChangeTolerance={n => updateFrame(selected.id, { transparentTolerance: n })}
                picking={picking}
                onTogglePicker={() => setPicking(p => !p)}
              />
            </div>
            <SheetGridPreview
              sheet={selected}
              maxWidth={420}
              onSize={setSourceSize}
              onUpdateFrame={(patch) => updateFrame(selected.id, patch)}
              isPicking={picking}
              onPickColor={(color) => { updateFrame(selected.id, { transparentColor: color }); setPicking(false); }}
            />
            {sourceSize && (() => {
              const f = selected.frame;
              const right = cellOrigin(f, f.cols - 1, 0).x + f.width;
              const bottom = cellOrigin(f, 0, f.rows - 1).y + f.height;
              const fits = right <= sourceSize.width && bottom <= sourceSize.height;
              return (
                <div style={{ fontSize: 10, color: fits ? 'var(--text-dim)' : '#ff9966', marginTop: 4 }}>
                  Source PNG: {sourceSize.width}×{sourceSize.height}px · grid covers {right}×{bottom}px
                  {!fits && ' ⚠ exceeds source — adjust cells/offsets/gaps'}
                </div>
              );
            })()}

            <div style={{ marginTop: 8 }} className="al-section-title">FRAME GRID (source pixels)</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
              GAP X/Y, OFFSET LEFT/TOP accept a number or a comma-list — e.g. <code style={{ color: 'var(--accent)' }}>10,12,8</code>. Click any gap badge on the image to edit it inline.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              <div className="property-group">
                <label>OFFSET LEFT</label>
                <GapInput value={selected.frame?.offsetLeft ?? selected.frame?.offsetX ?? 0}
                  onCommit={v => updateFrame(selected.id, { offsetLeft: v })} />
              </div>
              <div className="property-group">
                <label>OFFSET TOP</label>
                <GapInput value={selected.frame?.offsetTop ?? selected.frame?.offsetY ?? 0}
                  onCommit={v => updateFrame(selected.id, { offsetTop: v })} />
              </div>
              <div className="property-group">
                <label>FRAME W</label>
                <NumericInput min={1} value={selected.frame?.width ?? 32}
                  onCommit={n => updateFrame(selected.id, { width: n })} />
              </div>
              <div className="property-group">
                <label>FRAME H</label>
                <NumericInput min={1} value={selected.frame?.height ?? 32}
                  onCommit={n => updateFrame(selected.id, { height: n })} />
              </div>
              <div className="property-group">
                <label>COLS</label>
                <NumericInput min={1} value={selected.frame?.cols ?? 1}
                  onCommit={n => updateFrame(selected.id, { cols: n })} />
              </div>
              <div className="property-group">
                <label>ROWS</label>
                <NumericInput min={1} value={selected.frame?.rows ?? 1}
                  onCommit={n => updateFrame(selected.id, { rows: n })} />
              </div>
              <div className="property-group">
                <label>GAP X</label>
                <GapInput value={selected.frame?.gapX ?? 0}
                  onCommit={v => updateFrame(selected.id, { gapX: v })} />
              </div>
              <div className="property-group">
                <label>GAP Y</label>
                <GapInput value={selected.frame?.gapY ?? 0}
                  onCommit={v => updateFrame(selected.id, { gapY: v })} />
              </div>
            </div>

            <div className="property-divider" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="al-section-title" style={{ marginBottom: 0 }}>ANIMATIONS</div>
              <button className="small-btn" onClick={() => addAnimation(selected.id)}>+ Add</button>
            </div>
            {(selected.animations || []).length === 0 && (
              <div style={{ color: 'var(--text-dim)', fontSize: 10, padding: 8 }}>[ no animations ]</div>
            )}
            {(selected.animations || []).map(anim => (
              <div key={anim.id} style={{ padding: '8px 0', marginTop: 6, minWidth: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
                  <AnimationPreview sheet={selected} animation={anim} />
                  <div style={{ flex: '1 1 0', minWidth: 0 }}>
                    <div className="property-group">
                      <label>NAME</label>
                      <input type="text" value={anim.name}
                        onChange={e => updateAnimation(selected.id, anim.id, { name: e.target.value })} />
                    </div>
                    <div className="property-group">
                      <label>FRAMES (comma-separated cell indexes, 0-based)</label>
                      <FramesInput
                        value={anim.frames || []}
                        onCommit={fr => updateAnimation(selected.id, anim.id, { frames: fr })}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <div className="property-group">
                        <label>FPS</label>
                        <NumericInput min={1} value={anim.fps ?? 6}
                          onCommit={n => updateAnimation(selected.id, anim.id, { fps: n })} />
                      </div>
                      <div className="property-group">
                        <label>LOOP</label>
                        <input type="checkbox" checked={!!anim.loop}
                          onChange={e => updateAnimation(selected.id, anim.id, { loop: e.target.checked })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        className="small-btn"
                        disabled={!(anim.frames || []).length}
                        onClick={async (e) => {
                          const btn = e.currentTarget;
                          const orig = btn.textContent;
                          btn.disabled = true;
                          btn.textContent = 'rendering…';
                          try { await exportAnimationGIF(selected, anim); }
                          catch (err) { console.error('GIF export failed:', err); alert('GIF export failed: ' + err.message); }
                          finally { btn.disabled = false; btn.textContent = orig; }
                        }}
                        title="Download this animation as an animated GIF"
                      >↓ download gif</button>
                      <button
                        className="small-btn"
                        onClick={() => removeAnimation(selected.id, anim.id)}
                        style={{ color: '#ff5566', borderColor: '#ff5566' }}
                      >delete animation</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="property-divider" />
            <button
              className="small-btn"
              onClick={() => removeSheet(selected.id)}
              style={{ color: '#ff5566', borderColor: '#ff5566' }}
            >delete sheet</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tilesets tab ────────────────────────────────────────────────────────
// Mirrors the Sprite editor (sidebar + detail with grid preview, inline
// gap badges, offsets, etc.) since the only material difference is "no
// animations". Tilesets store fields at the top level; we wrap them in a
// fake `frame` shape when handing them to SheetGridPreview / NumericInput.
function TilesetsTab({ tilesets, onChange, confirmDelete }) {
  const [selectedId, setSelectedId] = useState(tilesets[0]?.id || null);
  const [sourceSize, setSourceSize] = useState(null);
  const [picking, setPicking] = useState(false);
  const selected = tilesets.find(t => t.id === selectedId) || null;

  const importTileset = async (file) => {
    const src = await readFileAsDataUrl(file);
    const id = mkId();
    onChange(prev => [...prev, {
      id, kind: 'tileset',
      name: file.name.replace(/\.[^.]+$/, ''),
      src,
      tileWidth: 32, tileHeight: 32, cols: 1, rows: 1,
      offsetLeft: 0, offsetTop: 0, gapX: 0, gapY: 0,
    }]);
    setSelectedId(id);
  };

  const updateTileset = (id, patch) => {
    onChange(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  };
  const removeTileset = (id) => {
    const target = tilesets.find(t => t.id === id);
    confirmDelete(
      'Delete tileset',
      `Delete "${target?.name || 'this tileset'}"? Any level using it will lose its tile graphics.`,
      () => {
        onChange(prev => prev.filter(t => t.id !== id));
        if (selectedId === id) setSelectedId(null);
      }
    );
  };

  // Wrap a tileset in the SpriteSheet `frame` shape so SheetGridPreview
  // can render its grid and edit gaps inline.
  const fakeSheetFor = (t) => ({
    src: t.src,
    frame: {
      width: t.tileWidth, height: t.tileHeight,
      cols: t.cols, rows: t.rows,
      offsetLeft: t.offsetLeft ?? 0, offsetTop: t.offsetTop ?? 0,
      gapX: t.gapX ?? 0, gapY: t.gapY ?? 0,
      transparentColor: t.transparentColor ?? null,
    },
  });
  // Translate the `frame` patch sent by SheetGridPreview into the tileset's
  // top-level field names.
  const patchFrame = (id, framePatch) => {
    const flat = {};
    const keyMap = { width: 'tileWidth', height: 'tileHeight' };
    for (const [k, v] of Object.entries(framePatch)) {
      flat[keyMap[k] || k] = v;
    }
    updateTileset(id, flat);
  };

  return (
    <div style={{ display: 'flex', gap: 12, height: '100%', minHeight: 320, minWidth: 0 }}>
      {/* Sidebar list */}
      <div style={{ width: 180, flex: '0 0 180px', borderRight: '1px solid var(--border)', paddingRight: 8, overflowY: 'auto', overflowX: 'hidden' }}>
        <label className="small-btn" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', marginBottom: 8 }}>
          + Import PNG
          <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) { importTileset(e.target.files[0]); e.target.value = ''; } }} />
        </label>
        {tilesets.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', padding: 12 }}>
            [ No tilesets ]
          </div>
        )}
        {tilesets.map(t => (
          <div
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            style={{
              padding: '4px 6px', fontSize: 11, cursor: 'pointer',
              background: selectedId === t.id ? 'var(--selected)' : 'transparent',
              color: selectedId === t.id ? 'var(--accent)' : 'var(--text)',
              border: '1px solid var(--border)', marginBottom: 2,
            }}
          >{t.name}</div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: '1 1 0', minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {!selected && (
          <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: 24 }}>
            Select or import a tileset to begin. Tilesets are the source for paintable tiles in Levels.
          </div>
        )}
        {selected && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 4 }}>
              <div className="property-group" style={{ flex: '1 1 0', margin: 0 }}>
                <label>NAME</label>
                <input type="text" value={selected.name}
                  onChange={e => updateTileset(selected.id, { name: e.target.value })} />
              </div>
              <label
                className="small-btn"
                style={{ cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}
                title="Replace the source image — all tile config is preserved"
              >
                ↩ Replace image
                <input
                  type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    const src = await readFileAsDataUrl(e.target.files[0]);
                    updateTileset(selected.id, { src });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <div className="property-group">
              <label>TRANSPARENT COLOR (legacy PNGs without alpha)</label>
              <TransparentColorControls
                value={selected.transparentColor || ''}
                onChange={v => updateTileset(selected.id, { transparentColor: v || null })}
                tolerance={selected.transparentTolerance ?? 0}
                onChangeTolerance={n => updateTileset(selected.id, { transparentTolerance: n })}
                picking={picking}
                onTogglePicker={() => setPicking(p => !p)}
              />
            </div>
            <SheetGridPreview
              sheet={fakeSheetFor(selected)}
              maxWidth={420}
              onSize={setSourceSize}
              onUpdateFrame={(framePatch) => patchFrame(selected.id, framePatch)}
              isPicking={picking}
              onPickColor={(color) => { updateTileset(selected.id, { transparentColor: color }); setPicking(false); }}
            />
            {sourceSize && (() => {
              const view = fakeSheetFor(selected).frame;
              const right = cellOriginInline(view, view.cols - 1, 0).x + view.tileWidth;
              const bottom = cellOriginInline(view, 0, view.rows - 1).y + view.tileHeight;
              const fits = right <= sourceSize.width && bottom <= sourceSize.height;
              return (
                <div style={{ fontSize: 10, color: fits ? 'var(--text-dim)' : '#ff9966', marginTop: 4 }}>
                  Source PNG: {sourceSize.width}×{sourceSize.height}px · grid covers {right}×{bottom}px
                  {!fits && ' ⚠ exceeds source — adjust cells/offsets/gaps'}
                </div>
              );
            })()}

            <div style={{ marginTop: 8 }} className="al-section-title">TILE GRID (source pixels)</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
              GAP X/Y, OFFSET LEFT/TOP accept a number or a comma-list — e.g. <code style={{ color: 'var(--accent)' }}>10,12,8</code>. Click any gap badge on the image to edit it inline.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              <div className="property-group">
                <label>OFFSET LEFT</label>
                <GapInput value={selected.offsetLeft ?? 0}
                  onCommit={v => updateTileset(selected.id, { offsetLeft: v })} />
              </div>
              <div className="property-group">
                <label>OFFSET TOP</label>
                <GapInput value={selected.offsetTop ?? 0}
                  onCommit={v => updateTileset(selected.id, { offsetTop: v })} />
              </div>
              <div className="property-group">
                <label>TILE W</label>
                <NumericInput min={1} value={selected.tileWidth ?? 32}
                  onCommit={n => updateTileset(selected.id, { tileWidth: n })} />
              </div>
              <div className="property-group">
                <label>TILE H</label>
                <NumericInput min={1} value={selected.tileHeight ?? 32}
                  onCommit={n => updateTileset(selected.id, { tileHeight: n })} />
              </div>
              <div className="property-group">
                <label>COLS</label>
                <NumericInput min={1} value={selected.cols ?? 1}
                  onCommit={n => updateTileset(selected.id, { cols: n })} />
              </div>
              <div className="property-group">
                <label>ROWS</label>
                <NumericInput min={1} value={selected.rows ?? 1}
                  onCommit={n => updateTileset(selected.id, { rows: n })} />
              </div>
              <div className="property-group">
                <label>GAP X</label>
                <GapInput value={selected.gapX ?? 0}
                  onCommit={v => updateTileset(selected.id, { gapX: v })} />
              </div>
              <div className="property-group">
                <label>GAP Y</label>
                <GapInput value={selected.gapY ?? 0}
                  onCommit={v => updateTileset(selected.id, { gapY: v })} />
              </div>
            </div>

            <div className="property-divider" />
            <button
              className="small-btn"
              onClick={() => removeTileset(selected.id)}
              style={{ color: '#ff5566', borderColor: '#ff5566' }}
            >delete tileset</button>
          </>
        )}
      </div>
    </div>
  );
}

// Inline cellOrigin used only by TilesetsTab's coverage indicator. Keeps
// SpriteSheetManager free of cross-file imports for a tiny utility.
function cellOriginInline(frame, col, row) {
  const offLeft = Array.isArray(frame.offsetLeft) ? Number(frame.offsetLeft[row]) || 0 : Number(frame.offsetLeft) || 0;
  const offTop  = Array.isArray(frame.offsetTop)  ? Number(frame.offsetTop[col])  || 0 : Number(frame.offsetTop)  || 0;
  const gapPick = (g, axisIdx, gapIdx) => {
    if (Array.isArray(g)) {
      if (Array.isArray(g[0])) return Number(g[axisIdx]?.[gapIdx]) || 0;
      return Number(g[gapIdx]) || 0;
    }
    return Number(g) || 0;
  };
  let x = offLeft;
  for (let i = 0; i < col; i++) x += frame.width + gapPick(frame.gapX, row, i);
  let y = offTop;
  for (let i = 0; i < row; i++) y += frame.height + gapPick(frame.gapY, col, i);
  return { x, y };
}

// ─── Backgrounds tab ─────────────────────────────────────────────────────
// Backgrounds are full images (PNG/JPG/GIF) used as parallax layers in
// Levels. No grid configuration — they're consumed whole.
function BackgroundsTab({ backgrounds, onChange, confirmDelete }) {
  const importBg = async (file) => {
    const src = await readFileAsDataUrl(file);
    onChange(prev => [...prev, {
      id: mkId(), kind: 'background',
      name: file.name.replace(/\.[^.]+$/, ''),
      src,
    }]);
  };
  const updateBg = (id, patch) => onChange(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  const removeBg = (id) => {
    const target = backgrounds.find(b => b.id === id);
    confirmDelete(
      'Delete background',
      `Delete "${target?.name || 'this background'}"? Any level layer using it will lose its image.`,
      () => onChange(prev => prev.filter(b => b.id !== id))
    );
  };
  return (
    <div style={{ overflowY: 'auto', minHeight: 320 }}>
      <label className="small-btn" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 8 }}>
        + Import background
        <input type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) { importBg(e.target.files[0]); e.target.value = ''; } }} />
      </label>
      {backgrounds.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: 24 }}>
          [ No backgrounds — Levels can stack these as parallax layers behind the tilemap ]
        </div>
      )}
      {backgrounds.map(b => (
        <div key={b.id} style={{ border: '1px solid var(--border)', padding: 8, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
          <img src={b.src} alt={b.name} style={{ width: 96, height: 64, objectFit: 'contain', background: 'rgba(0,0,0,0.4)', imageRendering: 'pixelated', flex: '0 0 96px' }} />
          <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div className="property-group" style={{ margin: 0 }}>
              <label>NAME</label>
              <input type="text" value={b.name} onChange={e => updateBg(b.id, { name: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <label
                className="small-btn"
                style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
                title="Replace the image — name is preserved"
              >
                ↩ Replace
                <input
                  type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    const src = await readFileAsDataUrl(e.target.files[0]);
                    updateBg(b.id, { src });
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                className="small-btn"
                onClick={() => removeBg(b.id)}
                style={{ alignSelf: 'flex-start', color: '#ff5566', borderColor: '#ff5566' }}
              >delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sounds tab ──────────────────────────────────────────────────────────
function SoundsTab({ sounds, onChange, confirmDelete }) {
  const importSound = async (file) => {
    const src = await readFileAsDataUrl(file);
    onChange(prev => [...prev, { id: mkId(), kind: 'sound', name: file.name.replace(/\.[^.]+$/, ''), src }]);
  };
  const updateSound = (id, patch) => onChange(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSound = (id) => {
    const target = sounds.find(s => s.id === id);
    confirmDelete(
      'Delete sound',
      `Delete "${target?.name || 'this sound'}"?`,
      () => onChange(prev => prev.filter(s => s.id !== id))
    );
  };
  return (
    <div style={{ overflowY: 'auto', minHeight: 320 }}>
      <label className="small-btn" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 8 }}>
        + Import audio
        <input type="file" accept="audio/*" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) { importSound(e.target.files[0]); e.target.value = ''; } }} />
      </label>
      {sounds.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 11, textAlign: 'center', padding: 24 }}>
          [ No sounds — SoundEmitter and music slots will use these ]
        </div>
      )}
      {sounds.map(s => (
        <div key={s.id} style={{ border: '1px solid var(--border)', padding: 8, marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <div className="property-group" style={{ flex: 1, margin: 0, minWidth: 0 }}>
            <label>NAME</label>
            <input type="text" value={s.name} onChange={e => updateSound(s.id, { name: e.target.value })} />
          </div>
          <audio src={s.src} controls style={{ height: 28 }} />
          <button
            className="small-btn"
            onClick={() => removeSound(s.id)}
            style={{ color: '#ff5566', borderColor: '#ff5566' }}
          >delete</button>
        </div>
      ))}
    </div>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────
export default function SpriteSheetManager({ assets, setAssets, onClose, setConfirmModal }) {
  const [tab, setTab] = useState('sprites');
  const counts = useMemo(() => ({
    sprites: (assets?.sprites || []).length,
    tilesets: (assets?.tilesets || []).length,
    backgrounds: (assets?.backgrounds || []).length,
    sounds: (assets?.sounds || []).length,
  }), [assets]);

  const updateSlice = (slice) => (updater) => {
    setAssets(prev => ({
      ...prev,
      [slice]: typeof updater === 'function' ? updater(prev[slice] || []) : updater,
    }));
  };

  // Wrap a destructive action behind the project's design-system confirm
  // modal. Falls back to native confirm only if the modal isn't wired (e.g.
  // when the manager is mounted standalone for testing).
  const confirmDelete = (title, message, onConfirm) => {
    if (setConfirmModal) {
      setConfirmModal({
        title, message, confirmText: 'Delete',
        onConfirm: () => { onConfirm(); setConfirmModal(null); },
        onCancel: () => setConfirmModal(null),
      });
    } else if (window.confirm(message)) {
      onConfirm();
    }
  };

  return (
    <div className="projects-overlay" onClick={onClose}>
      <div className="projects-modal" onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '92vw', height: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-titlebar">
          <span className="modal-title">[ Sprite Sheet Manager ]</span>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px 0 8px', borderBottom: '1px solid var(--border)' }}>
          {[
            ['sprites', `Sprites (${counts.sprites})`],
            ['tilesets', `Tilesets (${counts.tilesets})`],
            ['backgrounds', `Backgrounds (${counts.backgrounds})`],
            ['sounds', `Sounds (${counts.sounds})`],
          ].map(([key, label]) => (
            <div
              key={key}
              onClick={() => setTab(key)}
              className={`retro-tab ${tab === key ? 'active' : ''}`}
              style={{
                padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                border: '1px solid var(--border)',
                borderBottom: tab === key ? '1px solid var(--bg)' : '1px solid var(--border)',
                background: tab === key ? 'var(--bg)' : 'rgba(0,0,0,0.2)',
                color: tab === key ? 'var(--accent)' : 'var(--text-dim)',
                marginBottom: -1, marginRight: 2,
                fontWeight: tab === key ? 'bold' : 'normal',
              }}
            >{label}</div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 0 0 12px', minWidth: 0 }}>
          {tab === 'sprites' && <SpriteSheetsTab sheets={assets?.sprites || []} onChange={updateSlice('sprites')} confirmDelete={confirmDelete} />}
          {tab === 'tilesets' && <TilesetsTab tilesets={assets?.tilesets || []} onChange={updateSlice('tilesets')} confirmDelete={confirmDelete} />}
          {tab === 'backgrounds' && <BackgroundsTab backgrounds={assets?.backgrounds || []} onChange={updateSlice('backgrounds')} confirmDelete={confirmDelete} />}
          {tab === 'sounds' && <SoundsTab sounds={assets?.sounds || []} onChange={updateSlice('sounds')} confirmDelete={confirmDelete} />}
        </div>
      </div>
    </div>
  );
}
