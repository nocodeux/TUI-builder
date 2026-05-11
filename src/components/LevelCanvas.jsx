// LevelCanvas — the game-world authoring surface.
//
// Rendered instead of the regular Canvas when a Level is active and the
// levelLayer toggle is set to 'game'. Owns absolute-positioned coordinates
// and never imports LayoutRow / flexbox machinery (enforced by
// scripts/check-architecture.js per Q4).

import React, { useEffect, useRef, useState } from 'react';
import { useDrop } from 'react-dnd';

// ─── Sprite render for a single entity ───────────────────────────────────
// Reads the entity's spriteSheetAssetId + defaultAnimation from assets and
// plays the animation on a small canvas. Falls back to a placeholder box
// when no sprite is configured.
function EntitySprite({ entity, assets, width, height }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);
  const [frame, setFrame] = useState(0);

  const sheet = assets?.sprites?.find(s => s.id === entity.spriteSheetAssetId) || null;
  const anim = sheet?.animations?.find(a => a.name === entity.defaultAnimation)
    || sheet?.animations?.[0]
    || null;
  const frames = anim?.frames || [];
  const fps = Math.max(1, anim?.fps || 6);

  // Load source image when the sheet changes.
  useEffect(() => {
    if (!sheet?.src) { imgRef.current = null; setImgReady(false); return; }
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgReady(true); };
    img.src = sheet.src;
    return () => { imgRef.current = null; setImgReady(false); };
  }, [sheet?.src]);

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
    if (!canvas || !imgReady || !sheet?.frame) return;
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
    ctx.drawImage(imgRef.current, sx, sy, f.width, f.height, 0, 0, canvas.width, canvas.height);
  }, [frame, frames, imgReady, sheet?.frame?.width, sheet?.frame?.height, sheet?.frame?.cols,
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

  return (
    <canvas
      ref={canvasRef}
      width={width} height={height}
      style={{
        display: 'block',
        imageRendering: 'pixelated',
        transform: entity.facing === 'left' ? 'scaleX(-1)' : 'none',
        pointerEvents: 'none',
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

  const w = entity.renderSize?.width ?? 64;
  const h = entity.renderSize?.height ?? 64;

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
        height: h,
        cursor: drag.current ? 'grabbing' : 'grab',
        outline: isSelected ? '1px dashed var(--accent)' : 'none',
        outlineOffset: 2,
        zIndex: isSelected ? 10 : 1,
      }}
      title={`${entity.name} · ${entity.role}`}
    >
      <EntitySprite entity={entity} assets={assets} width={w} height={h} />
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
        x: Math.max(0, Math.round(offset.x - rect.left - w / 2)),
        y: Math.max(0, Math.round(offset.y - rect.top - h / 2)),
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
      {entities.length === 0 && !isOver && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'var(--text-dim)', fontSize: 11,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          [ Drop a GameEntity from the GAME section to place it ]
        </div>
      )}
    </div>
  );
}
