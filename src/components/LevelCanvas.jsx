// LevelCanvas — the game-world authoring surface.
//
// Rendered instead of the regular Canvas when a Level is active and the
// levelLayer toggle is set to 'game'. Owns absolute-positioned coordinates
// and never imports LayoutRow / flexbox machinery (enforced by
// scripts/check-architecture.js per Q4).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { resolveTilesetView, cellOrigin } from '../lib/tilesetView';
import { loadMaskedImage } from '../lib/imageMask';

// ─── Parallax background layers ──────────────────────────────────────────
// Renders level.backgrounds[] as stacked images BEHIND the tilemap. In the
// editor preview we apply offset, scale, opacity, and repeat — parallax /
// auto-scroll are stored on each layer and animate only at runtime when
// the camera moves.
//
// Background scale is expressed as a multiplier on the image's NATURAL pixel
// size (same semantics as the runtime). We track natural dimensions here so
// backgroundSize uses explicit pixel values rather than %-of-element-width,
// which would diverge from what the runtime draws.
function BackgroundLayers({ layers, assets, viewportW, viewportH }) {
  const [naturalSizes, setNaturalSizes] = React.useState({});

  React.useEffect(() => {
    for (const layer of layers || []) {
      const asset = (assets?.backgrounds || []).find(b => b.id === layer.assetId);
      if (!asset?.src || naturalSizes[asset.id]) continue;
      const img = new Image();
      img.onload = () => {
        setNaturalSizes(prev => ({ ...prev, [asset.id]: { w: img.naturalWidth, h: img.naturalHeight } }));
      };
      img.src = asset.src;
    }
  }, [layers, assets?.backgrounds]);

  if (!layers?.length) return null;
  return (
    <div style={{
      // Pin to the top-left of the LevelCanvas wrapper and size to the
      // EXACT level pixel area — never `inset: 0`, which would stretch to
      // the wrapper (typically larger via flex: 1). Matches what the
      // runtime canvas renders so Play is a visually seamless toggle.
      position: 'absolute', top: 0, left: 0,
      width: viewportW, height: viewportH,
      pointerEvents: 'none', overflow: 'hidden', zIndex: 0,
    }}>
      {layers.map(layer => {
        const asset = (assets?.backgrounds || []).find(b => b.id === layer.assetId);
        if (!asset?.src) return null;
        const repeatX = layer.repeat?.x !== false;
        const repeatY = layer.repeat?.y === true;
        const repeatRule = repeatX && repeatY ? 'repeat' : repeatX ? 'repeat-x' : repeatY ? 'repeat-y' : 'no-repeat';
        const scale = layer.scale ?? 1;
        const nat = naturalSizes[asset.id];
        // Use explicit pixel backgroundSize so it matches the runtime's
        // iw = img.width * scale calculation exactly. Falls back to 'auto'
        // until the natural dimensions are measured (typically < 1 frame).
        const bgSize = nat ? `${nat.w * scale}px ${nat.h * scale}px` : 'auto';
        return (
          <div
            key={layer.id}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: viewportW, height: viewportH,
              backgroundImage: `url(${asset.src})`,
              backgroundRepeat: repeatRule,
              backgroundSize: bgSize,
              backgroundPosition: `${layer.offset?.x || 0}px ${layer.offset?.y || 0}px`,
              opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
              imageRendering: 'pixelated',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── TileMap background canvas ──────────────────────────────────────────
// Renders the active tile layer as a single canvas behind entities.
// Maintains a local mutable copy of the layer data while a stroke is in
// progress (Q6: one history entry per stroke, not per tile change).
function TileMapBackground({ tileMap, tileset, paintBrush, onCommitLayer }) {
  const canvasRef = useRef(null);
  const tilesetImgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);
  // Local mutable layer used while painting; null when not stroking.
  // We keep it in a ref to avoid a re-render per painted tile.
  const localLayerRef = useRef(null);
  const [strokeTick, setStrokeTick] = useState(0); // forces redraw during a stroke

  const cols = tileMap?.cols || 0;
  const rows = tileMap?.rows || 0;
  const tileW = tileMap?.tileWidth || 32;
  const tileH = tileMap?.tileHeight || 32;
  const totalW = cols * tileW;
  const totalH = rows * tileH;

  useEffect(() => {
    if (!tileset?.src) { tilesetImgRef.current = null; setImgReady(false); return; }
    let cancelled = false;
    loadMaskedImage(tileset.src, tileset.transparentColor, tileset.transparentTolerance || 0).then(entry => {
      if (cancelled || !entry) return;
      tilesetImgRef.current = entry.img;
      setImgReady(true);
    });
    return () => { cancelled = true; tilesetImgRef.current = null; setImgReady(false); };
  }, [tileset?.src, tileset?.transparentColor, tileset?.transparentTolerance]);

  // Draw all tiles. Source of truth: localLayer (during stroke) else tileMap.layers[0].data.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const layer = (tileMap?.layers || [])[0];
    if (!layer) return;
    const data = localLayerRef.current?.data || layer.data || [];
    if (!tileset || !imgReady || !tilesetImgRef.current) {
      // Draw collision overlays for cells that have been painted solid (value > 0).
      ctx.fillStyle = 'rgba(255,165,0,0.4)';
      for (let i = 0; i < cols * rows; i++) {
        if ((data[i] | 0) <= 0) continue;
        const dataCol = i % cols;
        const dataRow = Math.floor(i / cols);
        const dx = dataCol * tileW;
        const dy = (rows - 1 - dataRow) * tileH;
        ctx.fillRect(dx, dy, tileW, tileH);
      }
      // Draw grid (brighter when tile brush is armed, subtle otherwise).
      ctx.strokeStyle = paintBrush?.tileValue != null ? 'rgba(255,230,0,0.25)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let c = 1; c < cols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * tileW + 0.5, 0);
        ctx.lineTo(c * tileW + 0.5, totalH);
        ctx.stroke();
      }
      for (let r = 1; r < rows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * tileH + 0.5);
        ctx.lineTo(totalW, r * tileH + 0.5);
        ctx.stroke();
      }
      return;
    }
    const tsCols = Math.max(1, tileset.cols || 1);
    // Data row 0 is the FLOOR (bottom of the world). Render flipped so the
    // floor lives at the bottom of the canvas and new rows added at the
    // top of the data array stack visually upward.
    for (let i = 0; i < cols * rows; i++) {
      const v = data[i] | 0;
      if (v <= 0) continue;
      const tsIdx = v - 1;
      const tsCol = tsIdx % tsCols;
      const tsRow = Math.floor(tsIdx / tsCols);
      const { x: sx, y: sy } = cellOrigin(tileset, tsCol, tsRow);
      const dataCol = i % cols;
      const dataRow = Math.floor(i / cols);
      const dx = dataCol * tileW;
      const dy = (rows - 1 - dataRow) * tileH;
      ctx.drawImage(tilesetImgRef.current, sx, sy, tileset.tileWidth, tileset.tileHeight, dx, dy, tileW, tileH);
    }
    // Subtle grid overlay so the user always sees cell boundaries while painting.
    if (paintBrush) {
      ctx.strokeStyle = 'rgba(255,230,0,0.15)';
      ctx.lineWidth = 1;
      for (let c = 1; c < cols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * tileW + 0.5, 0);
        ctx.lineTo(c * tileW + 0.5, totalH);
        ctx.stroke();
      }
      for (let r = 1; r < rows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * tileH + 0.5);
        ctx.lineTo(totalW, r * tileH + 0.5);
        ctx.stroke();
      }
    }
  }, [tileMap, tileset, imgReady, cols, rows, tileW, tileH, totalW, totalH, paintBrush, strokeTick]);

  // Convert a pointer event into a (col, row) coordinate within the tile
  // grid. Y is flipped so canvas-bottom maps to data row 0 (the floor).
  const eventToCell = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const visualRow = Math.floor(y / tileH);
    return {
      col: Math.floor(x / tileW),
      row: Math.max(0, Math.min(rows - 1, (rows - 1) - visualRow)),
    };
  };

  const paintAt = useCallback((col, row, value) => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    const layer = (tileMap?.layers || [])[0];
    if (!layer) return;
    if (!localLayerRef.current) {
      // Snapshot layer data into a fresh array so React state is untouched
      // until commit on pointer-up.
      const initial = new Array(cols * rows).fill(0);
      const src = layer.data || [];
      for (let i = 0; i < initial.length; i++) initial[i] = src[i] | 0;
      localLayerRef.current = { layerId: layer.id, data: initial };
    }
    const idx = row * cols + col;
    if (localLayerRef.current.data[idx] === value) return; // no-op if same
    localLayerRef.current.data[idx] = value;
    setStrokeTick(t => t + 1);
  }, [cols, rows, tileMap?.layers, tileW, tileH]);

  const onPointerDown = (e) => {
    if (!paintBrush) return; // only paint when armed
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    canvasRef.current.setPointerCapture(e.pointerId);
    const { col, row } = eventToCell(e);
    // Right-click = erase regardless of brush.tileValue.
    const value = e.button === 2 ? 0 : paintBrush.tileValue;
    paintAt(col, row, value);
    // Stash the active value for subsequent pointermove events.
    canvasRef.current._activePaintValue = value;
  };
  const onPointerMove = (e) => {
    if (!paintBrush) return;
    if (!canvasRef.current?.hasPointerCapture?.(e.pointerId)) return;
    const { col, row } = eventToCell(e);
    paintAt(col, row, canvasRef.current._activePaintValue ?? paintBrush.tileValue);
  };
  const finishStroke = (e) => {
    if (!localLayerRef.current) return;
    try { canvasRef.current?.releasePointerCapture?.(e.pointerId); } catch {}
    const local = localLayerRef.current;
    localLayerRef.current = null;
    canvasRef.current._activePaintValue = undefined;
    // Commit to React state — single update per stroke = one history entry.
    onCommitLayer(local.layerId, local.data);
  };

  return (
    <canvas
      ref={canvasRef}
      width={totalW}
      height={totalH}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: totalW, height: totalH,
        imageRendering: 'pixelated',
        cursor: paintBrush?.tileValue != null ? (paintBrush.tileValue === 0 ? 'cell' : 'crosshair') : 'default',
        pointerEvents: paintBrush?.tileValue != null ? 'auto' : 'none',
      }}
    />
  );
}

// ─── SVG overlay for line-based collision shapes ──────────────────────────
// Click to place points, double-click / Escape to finish.
// Right-click drag any node to reposition it.
// Backspace removes the last placed point while drawing.
function ColliderShapesLayer({
  shapes = [], occlusionShapes = [],
  viewportW, viewportH,
  isDrawing, isDrawingMask,
  onCommitShape, onUpdateShapePoints,
  onCommitOcclusionShape, onUpdateOcclusionShapePoints,
}) {
  const [inProgress, setInProgress] = useState(null); // { points: [{x,y}] }
  const [cursor, setCursor]         = useState(null);
  // dragging: { kind: 'inProgress'|'collision'|'occlusion', shapeId, ptIdx }
  const [dragging, setDragging]     = useState(null);
  // local mutable copy of a committed shape's points during a drag
  const [dragPts, setDragPts]       = useState(null);
  const svgRef = useRef(null);
  const activeMode = isDrawingMask ? 'mask' : isDrawing ? 'line' : null;
  // Prevents the click-to-add-point from firing after a node drag begins.
  const nodeDragStarted = useRef(false);

  // Discard in-progress state when drawing mode is turned off.
  useEffect(() => { if (!activeMode) { setInProgress(null); setCursor(null); } }, [activeMode]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        // Remove last placed point while drawing.
        setInProgress(prev => {
          if (!prev?.points?.length) return prev;
          const pts = prev.points.slice(0, -1);
          return pts.length ? { ...prev, points: pts } : null;
        });
        return;
      }
      if (e.key === 'Escape') {
        setInProgress(prev => {
          if (prev?.points?.length >= 2) {
            if (activeMode === 'mask') onCommitOcclusionShape({ points: prev.points, closed: true });
            else onCommitShape({ points: prev.points, closed: false });
          }
          return null;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMode, onCommitShape, onCommitOcclusionShape]);

  const toLocal = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
  };

  // Begin dragging a node (left or right-click on any circle).
  const startDrag = (e, kind, shapeId, ptIdx, sourcePts) => {
    e.preventDefault();
    e.stopPropagation();
    nodeDragStarted.current = true; // suppress the following click event
    setDragging({ kind, shapeId, ptIdx });
    if (kind === 'collision' || kind === 'occlusion') setDragPts([...sourcePts]);
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
  };

  const handlePointerMove = (e) => {
    const pt = toLocal(e);
    setCursor(pt);
    if (!dragging) return;
    if (dragging.kind === 'inProgress') {
      setInProgress(prev => {
        if (!prev) return prev;
        const pts = [...prev.points];
        pts[dragging.ptIdx] = pt;
        return { ...prev, points: pts };
      });
    } else {
      setDragPts(prev => {
        if (!prev) return prev;
        const pts = [...prev];
        pts[dragging.ptIdx] = pt;
        return pts;
      });
    }
  };

  const handlePointerUp = (e) => {
    if (dragging?.kind === 'collision' && dragPts) onUpdateShapePoints(dragging.shapeId, dragPts);
    if (dragging?.kind === 'occlusion'  && dragPts) onUpdateOcclusionShapePoints(dragging.shapeId, dragPts);
    setDragging(null);
    setDragPts(null);
    try { svgRef.current?.releasePointerCapture?.(e.pointerId); } catch {}
  };

  const handleClick = (e) => {
    if (nodeDragStarted.current) { nodeDragStarted.current = false; return; }
    if (!activeMode || dragging) return;
    e.stopPropagation();
    const pt = toLocal(e);
    setInProgress(prev => prev ? { ...prev, points: [...prev.points, pt] } : { points: [pt] });
  };

  const handleDblClick = (e) => {
    if (!activeMode || !inProgress || dragging) return;
    e.stopPropagation();
    // dblclick fires two click events first; slice off the duplicate last point.
    const pts = inProgress.points.slice(0, -1);
    if (pts.length >= 2) {
      if (activeMode === 'mask') onCommitOcclusionShape({ points: pts, closed: true });
      else onCommitShape({ points: pts, closed: false });
    }
    setInProgress(null);
  };

  const lastPt = inProgress?.points?.[inProgress.points.length - 1];
  const isActive = activeMode || shapes.some(s => s.points?.length > 0) || occlusionShapes.some(s => s.points?.length > 0);

  return (
    <svg
      ref={svgRef}
      width={viewportW} height={viewportH}
      style={{
        position: 'absolute', top: 0, left: 0, overflow: 'visible',
        // Only capture background-area clicks when actively drawing a new shape.
        // Node circles carry their own pointerEvents:'all' so drag always works.
        pointerEvents: activeMode ? 'all' : 'none',
        cursor: dragging ? 'grabbing' : activeMode ? 'crosshair' : 'default',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={handlePointerMove}
      onPointerUp={dragging ? handlePointerUp : undefined}
      onMouseLeave={() => { if (!dragging) setCursor(null); }}
      onClick={handleClick}
      onDoubleClick={handleDblClick}
    >
      {/* Occlusion shapes — purple filled polygon */}
      {occlusionShapes.map((shape, si) => {
        const rawPts = shape.points || [];
        const pts = (dragging?.kind === 'occlusion' && dragging.shapeId === shape.id && dragPts)
          ? dragPts : rawPts;
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return (
          <g key={shape.id || si}>
            <path d={d} fill="rgba(160,0,255,0.12)" stroke="rgba(180,0,255,0.85)" strokeWidth={2} strokeDasharray="5 3" />
            {pts.map((p, pi) => (
              <circle key={pi} cx={p.x} cy={p.y} r={5}
                fill="rgba(180,0,255,0.9)" stroke="rgba(0,0,0,0.6)" strokeWidth={1}
                style={{ cursor: 'grab', pointerEvents: 'all' }}
                onPointerDown={(e) => { if (e.button === 0 || e.button === 2) startDrag(e, 'occlusion', shape.id, pi, rawPts); }}
              />
            ))}
          </g>
        );
      })}
      {/* Collision shapes — dashed orange */}
      {shapes.map((shape, si) => {
        const rawPts = shape.points || [];
        const pts = (dragging?.kind === 'collision' && dragging.shapeId === shape.id && dragPts)
          ? dragPts : rawPts;
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (shape.closed ? ' Z' : '');
        return (
          <g key={shape.id || si}>
            <path d={d} fill="none" stroke="rgba(255,165,0,0.85)" strokeWidth={2} strokeDasharray="5 3" />
            {pts.map((p, pi) => (
              <circle key={pi} cx={p.x} cy={p.y} r={5}
                fill="rgba(255,165,0,0.9)" stroke="rgba(0,0,0,0.6)" strokeWidth={1}
                style={{ cursor: 'grab', pointerEvents: 'all' }}
                onPointerDown={(e) => { if (e.button === 0 || e.button === 2) startDrag(e, 'collision', shape.id, pi, rawPts); }}
              />
            ))}
          </g>
        );
      })}
      {/* In-progress shape (cyan while line mode, purple while mask mode) */}
      {inProgress && (
        <g>
          {inProgress.points.length >= 2 && (
            activeMode === 'mask'
              ? <polygon points={inProgress.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(160,0,255,0.12)" stroke="rgba(180,0,255,0.9)" strokeWidth={2} />
              : <polyline points={inProgress.points.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="rgba(0,220,255,0.9)" strokeWidth={2} />
          )}
          {lastPt && cursor && !dragging && (
            <line x1={lastPt.x} y1={lastPt.y} x2={cursor.x} y2={cursor.y}
              stroke={activeMode === 'mask' ? 'rgba(180,0,255,0.45)' : 'rgba(0,220,255,0.45)'}
              strokeWidth={1} strokeDasharray="4 2"
            />
          )}
          {inProgress.points.map((p, pi) => (
            <circle key={pi} cx={p.x} cy={p.y} r={5}
              fill={activeMode === 'mask' ? 'rgba(180,0,255,0.85)' : 'rgba(0,220,255,0.85)'}
              stroke="rgba(0,0,0,0.6)" strokeWidth={1}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onPointerDown={(e) => { if (e.button === 0 || e.button === 2) startDrag(e, 'inProgress', null, pi, inProgress.points); }}
            />
          ))}
        </g>
      )}
      {/* Hint bar */}
      {activeMode && (
        <text x={8} y={viewportH - 10} fontSize={10} fontFamily="monospace"
          fill={activeMode === 'mask' ? 'rgba(180,0,255,0.8)' : 'rgba(0,220,255,0.7)'}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {inProgress
            ? `${inProgress.points.length} pt${inProgress.points.length !== 1 ? 's' : ''} · dbl-click or Esc to finish · Backspace to undo · right-click drag to move`
            : `Click to start ${activeMode === 'mask' ? 'a mask polygon' : 'a line'} · right-click drag nodes to reposition`}
        </text>
      )}
    </svg>
  );
}

// ─── Sprite render for a single entity ───────────────────────────────────
// Resolves the sprite sheet for the entity's defaultAnimation, supporting
// both the new per-animation slot format (entity.animations[]) and the
// legacy single spriteSheetAssetId. Falls back to a placeholder box when
// no sprite is configured.
function EntitySprite({ entity, assets, width, height, hitboxH }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);
  const [frame, setFrame] = useState(0);

  // Resolve sheet + animation def from either new or legacy format.
  let sheet = null;
  let anim = null;
  if (entity.animations?.length) {
    const slot = entity.animations.find(a => a.name === entity.defaultAnimation)
      || entity.animations[0];
    if (slot) {
      sheet = assets?.sprites?.find(s => s.id === slot.spriteSheetId) || null;
      anim = sheet?.animations?.find(a => a.name === slot.animName)
        || sheet?.animations?.[0]
        || null;
    }
  }
  // Legacy fallback: single spriteSheetAssetId.
  if (!sheet) {
    sheet = assets?.sprites?.find(s => s.id === entity.spriteSheetAssetId) || null;
    anim = sheet?.animations?.find(a => a.name === entity.defaultAnimation)
      || sheet?.animations?.[0]
      || null;
  }

  const frames = anim?.frames || [];
  const fps = Math.max(1, anim?.fps || 6);

  // Load source image (with optional color-key transparency) when the
  // sheet or its transparent color/tolerance changes.
  const entityTransparent = sheet?.frame?.transparentColor || null;
  const entityTolerance = sheet?.frame?.transparentTolerance ?? 0;
  useEffect(() => {
    if (!sheet?.src) { imgRef.current = null; setImgReady(false); return; }
    let cancelled = false;
    imgRef.current = null;
    setImgReady(false);
    loadMaskedImage(sheet.src, entityTransparent, entityTolerance).then(entry => {
      if (cancelled || !entry?.img) return;
      imgRef.current = entry.img;
      setImgReady(true);
    });
    return () => { cancelled = true; imgRef.current = null; setImgReady(false); };
  }, [sheet?.src, entityTransparent, entityTolerance]);

  useEffect(() => { setFrame(0); }, [frames.length, anim?.name]);

  // Tick frames.
  useEffect(() => {
    if (frames.length <= 1) return;
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [frames.length, fps]);

  // Draw current frame to canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    // Belt-and-suspenders: imgReady should imply imgRef.current is set, but
    // sheet swaps can briefly diverge those two while the new image loads.
    if (!canvas || !imgReady || !imgRef.current || !sheet?.frame) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!frames.length) return;
    const idx = frames[frame] ?? 0;
    const f = sheet.frame;
    const cols = Math.max(1, f.cols || 1);
    const cx = idx % cols;
    const cy = Math.floor(idx / cols);
    // Inline cell origin (avoid pulling SpriteSheetManager helpers — keeps
    // this component standalone and Phase 3a-focused).
    const offLeft = Array.isArray(f.offsetLeft) ? Number(f.offsetLeft[cy]) || 0
      : Array.isArray(f.offsetX) ? Number(f.offsetX[cy]) || 0
      : Number(f.offsetLeft ?? f.offsetX ?? 0) || 0;
    const offTop = Array.isArray(f.offsetTop) ? Number(f.offsetTop[cx]) || 0
      : Array.isArray(f.offsetY) ? Number(f.offsetY[cx]) || 0
      : Number(f.offsetTop ?? f.offsetY ?? 0) || 0;
    const readGap = (gap, axisIdx, gapIdx) => {
      if (Array.isArray(gap)) {
        if (Array.isArray(gap[0])) return Number(gap[axisIdx]?.[gapIdx]) || 0;
        return Number(gap[gapIdx]) || 0;
      }
      return Number(gap) || 0;
    };
    let sx = offLeft;
    for (let i = 0; i < cx; i++) sx += f.width + readGap(f.gapX, cy, i);
    let sy = offTop;
    for (let i = 0; i < cy; i++) sy += f.height + readGap(f.gapY, cx, i);
    const fw = f.width;
    const fh = f.height;
    // Height-lock: display height = canvas height (= renderSize.height).
    // Width scales proportionally. Wide animations overflow left/right —
    // that's intentional; clipping is handled by overflow:visible on the
    // parent PlacedEntity div. Bottom-anchored so feet always on the floor.
    const dh = canvas.height;
    const dw = Math.round(fw * (canvas.height / fh));
    const ox = Math.round((canvas.width - dw) / 2);
    const oy = 0;
    ctx.drawImage(imgRef.current, sx, sy, fw, fh, ox, oy, dw, dh);
  // width/height in deps: canvas attribute change resets pixels but doesn't
  // trigger a React re-render that re-fires this effect. Adding them ensures
  // we redraw immediately when the user changes renderSize in the Inspector.
  }, [width, height, frame, frames, imgReady, sheet?.frame?.width, sheet?.frame?.height, sheet?.frame?.cols,
      JSON.stringify(sheet?.frame?.gapX), JSON.stringify(sheet?.frame?.gapY),
      JSON.stringify(sheet?.frame?.offsetLeft), JSON.stringify(sheet?.frame?.offsetTop)]);

  if (!sheet) {
    return (
      <div style={{
        width, height,
        border: '1px dashed var(--text-dim)',
        background: 'rgba(255,255,0,0.05)',
        color: 'var(--text-dim)',
        fontSize: 10, fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}>
        no sprite
      </div>
    );
  }

  const defaultSlot = entity.animations?.find(a => a.name === entity.defaultAnimation) || entity.animations?.[0];
  const nativeDir = defaultSlot?.nativeDir || 'right';
  const shouldFlip = nativeDir !== (entity.facing || 'right');
  const spriteOffY = (defaultSlot?.spriteOffsetY != null ? defaultSlot.spriteOffsetY : entity.spriteOffsetY) || 0;
  // Bottom-anchor: same logic as the runtime. translateY pushes the canvas
  // down so its bottom aligns with the hitbox bottom, then spriteOffY pulls it
  // back up. When height === hitboxH the net offset is just -spriteOffY.
  const translateY = hitboxH - height - spriteOffY;
  return (
    <canvas
      ref={canvasRef}
      width={width} height={height}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        transform: `${shouldFlip ? 'scaleX(-1) ' : ''}translateY(${translateY}px)`,
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}

// ─── Single placed entity (positioned absolutely, draggable to reposition) ──
function PlacedEntity({ entity, assets, isSelected, onSelect, onMove, onDelete }) {
  const ref = useRef(null);
  const drag = useRef(null);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const rect = ref.current.parentElement.getBoundingClientRect();
    drag.current = {
      offsetX: e.clientX - rect.left - entity.position.x,
      offsetY: e.clientY - rect.top - entity.position.y,
      moved: false,
    };
    ref.current.setPointerCapture(e.pointerId);
    onSelect(entity.id, e.shiftKey);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const rect = ref.current.parentElement.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left - drag.current.offsetX);
    const y = Math.round(e.clientY - rect.top - drag.current.offsetY);
    drag.current.moved = true;
    onMove(entity.id, { x, y });
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    try { ref.current.releasePointerCapture(e.pointerId); } catch {}
    drag.current = null;
  };

  const defaultSlotForSize = entity.animations?.find(a => a.name === entity.defaultAnimation) || entity.animations?.[0];
  const w = entity.renderSize?.width ?? 64;
  const hitboxH = entity.renderSize?.height ?? 64;
  // spriteH may differ from hitboxH via per-slot renderH override; the div
  // always uses hitboxH so the collision outline matches physics.
  const spriteH = (defaultSlotForSize?.renderH != null ? defaultSlotForSize.renderH : hitboxH);

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        left: entity.position.x,
        top: entity.position.y,
        width: w,
        height: hitboxH,
        overflow: 'visible',
        cursor: drag.current ? 'grabbing' : 'grab',
        outline: isSelected ? '1px dashed var(--accent)' : 'none',
        outlineOffset: 2,
        zIndex: isSelected ? 10 : 1,
      }}
      title={`${entity.name} · ${entity.role}`}
    >
      <EntitySprite entity={entity} assets={assets} width={w} height={spriteH} hitboxH={hitboxH} />
      {isSelected && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(entity.id); }}
          style={{
            position: 'absolute', top: -10, right: -10, width: 18, height: 18,
            background: '#330000', border: '1px solid #ff5566', color: '#ff8899',
            fontSize: 10, lineHeight: '14px', padding: 0, cursor: 'pointer', zIndex: 11,
          }}
          title="Delete entity"
        >×</button>
      )}
    </div>
  );
}

// ─── Main LevelCanvas component ─────────────────────────────────────────
export default function LevelCanvas({
  level,
  worldId,
  assets,
  selectedIds,
  onSelectEntity,
  onDeselect,
  onAddEntity,
  onMoveEntity,
  onDeleteEntities,
  paintBrush,
  onUpdateLevel,
}) {
  const ref = useRef(null);

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'GAME_COMPONENT',
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;
      const offset = monitor.getClientOffset();
      const rect = ref.current?.getBoundingClientRect();
      if (!offset || !rect) return;
      const w = item.type === 'GameEntity' ? 64 : 32; // default entity render size
      const h = w;
      const position = {
        x: Math.max(0, Math.round(offset.x - rect.left + ref.current.scrollLeft - w / 2)),
        y: Math.max(0, Math.round(offset.y - rect.top  + ref.current.scrollTop  - h / 2)),
      };
      onAddEntity(item.type, position);
      return { handled: true };
    },
    collect: m => ({ isOver: !!m.isOver({ shallow: true }), canDrop: !!m.canDrop() }),
  });

  const setRefs = (node) => {
    ref.current = node;
    drop(node);
  };

  const entities = level?.entities || [];
  const tileset = resolveTilesetView(assets, level?.tileMap?.tilesetAssetId);

  const handleCommitLayer = useCallback((layerId, nextData) => {
    if (!level?.tileMap) return;
    onUpdateLevel({
      tileMap: {
        ...level.tileMap,
        layers: (level.tileMap.layers || []).map(l =>
          l.id === layerId ? { ...l, data: nextData } : l
        ),
      },
    });
  }, [level?.tileMap, onUpdateLevel]);

  const handleCommitShape = useCallback((shape) => {
    const id = `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    onUpdateLevel({ colliderShapes: [...(level?.colliderShapes || []), { ...shape, id }] });
  }, [level?.colliderShapes, onUpdateLevel]);

  const handleUpdateShapePoints = useCallback((shapeId, newPoints) => {
    onUpdateLevel({
      colliderShapes: (level?.colliderShapes || []).map(s =>
        s.id === shapeId ? { ...s, points: newPoints } : s
      ),
    });
  }, [level?.colliderShapes, onUpdateLevel]);

  const handleCommitOcclusionShape = useCallback((shape) => {
    const id = `oc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    onUpdateLevel({ occlusionShapes: [...(level?.occlusionShapes || []), { ...shape, id }] });
  }, [level?.occlusionShapes, onUpdateLevel]);

  const handleUpdateOcclusionShapePoints = useCallback((shapeId, newPoints) => {
    onUpdateLevel({
      occlusionShapes: (level?.occlusionShapes || []).map(s =>
        s.id === shapeId ? { ...s, points: newPoints } : s
      ),
    });
  }, [level?.occlusionShapes, onUpdateLevel]);

  return (
    <div
      ref={setRefs}
      onClick={(e) => { if (e.target === ref.current) onDeselect(); }}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        background: 'var(--bg)',
        overflow: 'auto',
        backgroundImage:
          'linear-gradient(45deg, rgba(255,255,255,0.025) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.025) 75%), ' +
          'linear-gradient(45deg, rgba(255,255,255,0.025) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.025) 75%)',
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 12px 12px',
        outline: isOver && canDrop ? '1px dashed var(--accent)' : 'none',
        outlineOffset: -1,
      }}
    >
      <BackgroundLayers
        layers={level?.backgrounds || []}
        assets={assets}
        viewportW={(level?.tileMap?.cols || 0) * (level?.tileMap?.tileWidth || 32)}
        viewportH={(level?.tileMap?.rows || 0) * (level?.tileMap?.tileHeight || 32)}
      />
      <TileMapBackground
        tileMap={level?.tileMap}
        tileset={tileset}
        paintBrush={paintBrush}
        onCommitLayer={handleCommitLayer}
      />
      <ColliderShapesLayer
        shapes={level?.colliderShapes}
        occlusionShapes={level?.occlusionShapes}
        viewportW={(level?.tileMap?.cols || 0) * (level?.tileMap?.tileWidth || 32)}
        viewportH={(level?.tileMap?.rows || 0) * (level?.tileMap?.tileHeight || 32)}
        isDrawing={paintBrush?.mode === 'line'}
        isDrawingMask={paintBrush?.mode === 'mask'}
        onCommitShape={handleCommitShape}
        onUpdateShapePoints={handleUpdateShapePoints}
        onCommitOcclusionShape={handleCommitOcclusionShape}
        onUpdateOcclusionShapePoints={handleUpdateOcclusionShapePoints}
      />
      {entities.map(e => (
        <PlacedEntity
          key={e.id}
          entity={e}
          assets={assets}
          isSelected={selectedIds.includes(e.id)}
          onSelect={onSelectEntity}
          onMove={onMoveEntity}
          onDelete={(id) => onDeleteEntities([id])}
        />
      ))}
      {entities.length === 0 && !isOver && !paintBrush && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--text-dim)', fontSize: 11,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          [ Drop a GameEntity from the GAME section, or click a tile in the palette to paint ]
        </div>
      )}
    </div>
  );
}
