// Game runtime. Pure JS, no React. Owns a tick loop driven by
// requestAnimationFrame, an internal clone of the level state, an input
// map, and the draw routines. The RuntimeView React wrapper attaches a
// canvas, forwards keyboard input, and calls start()/stop() around its
// lifecycle.
//
// Coordinate convention (matches the editor):
//   - World pixel space, top-left origin internally.
//   - Tilemap data row 0 is the floor (bottom of the canvas); the runtime
//     flips Y when reading layer.data so falling entities collide there.
//   - Gravity > 0 → platformer. Gravity = 0 → top-down (Up/Down move).

import { resolveTilesetView, cellOrigin } from '../lib/tilesetView';
import { loadMaskedImage } from '../lib/imageMask';

// ── Geometry helpers for line-segment collision ─────────────────────────────
function cross2d(ax, ay, bx, by) { return ax * by - ay * bx; }
function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross2d(bx-ax, by-ay, cx-ax, cy-ay);
  const d2 = cross2d(bx-ax, by-ay, dx-ax, dy-ay);
  const d3 = cross2d(dx-cx, dy-cy, ax-cx, ay-cy);
  const d4 = cross2d(dx-cx, dy-cy, bx-cx, by-cy);
  return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0));
}
function aabbVsSegment(x, y, w, h, px, py, qx, qy) {
  if (segmentsIntersect(x,   y,   x+w, y,   px, py, qx, qy)) return true;
  if (segmentsIntersect(x+w, y,   x+w, y+h, px, py, qx, qy)) return true;
  if (segmentsIntersect(x+w, y+h, x,   y+h, px, py, qx, qy)) return true;
  if (segmentsIntersect(x,   y+h, x,   y,   px, py, qx, qy)) return true;
  return (px >= x && px <= x+w && py >= y && py <= y+h) ||
         (qx >= x && qx <= x+w && qy >= y && qy <= y+h);
}

export class GameRuntime {
  constructor({ level, assets, canvas }) {
    this.level = level;
    this.assets = assets;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Clone entity state so we never mutate editor state.
    this.entities = (level.entities || []).map(e => ({
      ...e,
      position: { ...(e.position || { x: 0, y: 0 }) },
      velocity: { x: 0, y: 0 },
      onGround: false,
      _airborneFrames: 0,
      _hitState: { timeLeft: 0, anim: null },
      _invincibleTime: 0,
      _hp: e.stats?.hp ?? 100,
      _dead: false,
      _vanished: false,         // true after death + vanish delay expires
      _vanishTimeLeft: 0,       // countdown to removal (0 = never auto-vanish)
      // Combo / multi-attack state (player)
      _comboState: null,        // { attackId, attackTimeLeft, windowLeft, nextAttackId, comboWindowDur }
      _idleState: { idx: 0, timer: 0 }, // cycling idles
      // Enemy AI state
      _aiState: 'patrol',
      _spawnX: e.position?.x ?? 0,
      _patrolDir: 1,
      _attackCooldown: 0,
      _attackHitSet: null,
      currentAnim: e.defaultAnimation,
      animFrame: 0,
      animTime: 0,
      facing: e.facing || 'right',
    }));

    this.input = { left: false, right: false, up: false, down: false, jump: false, attack: false, interact: false, dash: false };
    this._prevAttackInput = false;
    this.cameraX = 0;
    this.cameraY = 0;
    this.time = 0;
    this.lastT = 0;
    this.rafId = null;
    this.running = false;
    this.showColliders = false;
    this.images = new Map(); // assetId → HTMLImageElement | HTMLCanvasElement
    this.preload();
  }

  setShowColliders(v) { this.showColliders = v; }

  segmentCollide(x, y, w, h) {
    for (const shape of (this.level.colliderShapes || [])) {
      const pts = shape.points || [];
      const n = pts.length;
      if (n < 2) continue;
      const limit = shape.closed ? n : n - 1;
      for (let i = 0; i < limit; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % n];
        if (aabbVsSegment(x, y, w, h, p0.x, p0.y, p1.x, p1.y)) return true;
      }
    }
    return false;
  }

  // Combined tile + segment check used by _applyPhysics.
  collides(x, y, w, h) {
    return this.tileCollide(x, y, w, h) || this.segmentCollide(x, y, w, h);
  }

  preload() {
    const queue = [];
    const ts = resolveTilesetView(this.assets, this.level.tileMap?.tilesetAssetId);
    if (ts?.src) queue.push([ts.id, ts.src, ts.transparentColor, ts.transparentTolerance || 0]);
    for (const e of this.entities) {
      // New multi-sheet format: load every sprite sheet referenced in animations.
      const sheetIds = new Set();
      for (const slot of (e.animations || [])) {
        if (slot.spriteSheetId) sheetIds.add(slot.spriteSheetId);
      }
      // Legacy fallback: single spriteSheetAssetId.
      if (e.spriteSheetAssetId) sheetIds.add(e.spriteSheetAssetId);
      for (const sid of sheetIds) {
        const sheet = (this.assets.sprites || []).find(s => s.id === sid);
        if (sheet?.src) queue.push([sheet.id, sheet.src, sheet.frame?.transparentColor, sheet.frame?.transparentTolerance || 0]);
      }
    }
    for (const bg of this.level.backgrounds || []) {
      const a = (this.assets.backgrounds || []).find(x => x.id === bg.assetId);
      if (a?.src) queue.push([a.id, a.src, null, 0]);
    }
    for (const [id, src, color, tol] of queue) {
      loadMaskedImage(src, color, tol).then(entry => {
        if (entry?.img) this.images.set(id, entry.img);
      });
    }
  }

  // ── Multi-sheet animation helpers ─────────────────────────────────────────
  // Resolve which sprite sheet handles a named animation. Supports the new
  // per-animation slot format (entity.animations[]) and falls back to the
  // legacy entity.spriteSheetAssetId for entities created before this change.
  _getSheetForAnim(entity, animName) {
    if (entity.animations?.length) {
      const slot = entity.animations.find(a => a.name === animName);
      if (slot?.spriteSheetId) {
        return (this.assets.sprites || []).find(s => s.id === slot.spriteSheetId) || null;
      }
    }
    return (this.assets.sprites || []).find(s => s.id === entity.spriteSheetAssetId) || null;
  }

  // Resolve the sheet-side animation definition for a named local animation.
  _getAnimDef(entity, animName) {
    if (entity.animations?.length) {
      const slot = entity.animations.find(a => a.name === animName);
      if (slot) {
        const sheet = this._getSheetForAnim(entity, animName);
        return (sheet?.animations || []).find(a => a.name === slot.animName) || null;
      }
    }
    const sheet = (this.assets.sprites || []).find(s => s.id === entity.spriteSheetAssetId);
    return (sheet?.animations || []).find(a => a.name === animName) || null;
  }

  // Return a flat list of available local animation names for this entity.
  _getEntityAnimNames(entity) {
    if (entity.animations?.length) return entity.animations.map(a => a.name);
    const sheet = (this.assets.sprites || []).find(s => s.id === entity.spriteSheetAssetId);
    return (sheet?.animations || []).map(a => a.name);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  setInput(action, pressed) {
    if (action in this.input) this.input[action] = pressed;
  }

  // Snapshot the runtime state for debug overlays. Cheap to call every
  // frame from a React parent; returns plain objects so React can shallow-
  // compare and avoid re-rendering when nothing changed.
  getDebugInfo() {
    const player = this.entities.find(e => e.role === 'playerMain') || null;
    const enemies = this.entities.filter(e => e.role === 'enemy');
    return {
      input: { ...this.input },
      camera: { x: Math.round(this.cameraX), y: Math.round(this.cameraY) },
      player: player ? {
        x: Math.round(player.position.x),
        y: Math.round(player.position.y),
        vx: Math.round(player.velocity.x),
        vy: Math.round(player.velocity.y),
        onGround: player.onGround,
        anim: player.currentAnim,
        frame: player.animFrame,
        hitState: player._hitState?.timeLeft > 0 ? player._hitState.anim : null,
        hp: player._hp,
      } : null,
      enemies: { total: enemies.length, alive: enemies.filter(e => !e._dead).length },
    };
  }

  // Apply a hit to the player (called from the debug HUD test buttons).
  applyHit(power = 10) {
    const entity = this.entities.find(e => e.role === 'playerMain');
    if (entity) this.applyHitToEntity(entity, power);
  }

  frame = (t) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    this.time += dt;
    this.update(dt);
    this.draw();
    this.rafId = requestAnimationFrame(this.frame);
  };

  // ── Simulation ─────────────────────────────────────────────────────────
  update(dt) {
    const gravity = this.level.gravity || 0;
    const isPlatformer = gravity > 0;
    const tm = this.level.tileMap || {};
    const tileW = tm.tileWidth || 32;
    const tileH = tm.tileHeight || 32;
    const cols = tm.cols || 0;
    const rows = tm.rows || 0;
    const player = this.entities.find(e => e.role === 'playerMain') || null;
    const attackEdge = this.input.attack && !this._prevAttackInput;
    this._prevAttackInput = this.input.attack;
    for (const entity of this.entities) {
      if (entity._vanished) continue;
      if (entity._dead) { this._tickDeathSequence(entity, dt); continue; }
      if (entity.role === 'playerMain') {
        this.updatePlayer(entity, dt, gravity, isPlatformer, tileW, tileH, cols, rows, attackEdge);
      } else if (entity.role === 'enemy') {
        if (player) this.updateEnemyAI(entity, player, dt, tileW, tileH);
        this._applyPhysics(entity, dt, gravity, isPlatformer, tileW, tileH, cols, rows);
        this.updateEnemyAnimation(entity, dt);
      }
    }
    if (player && !player._dead) this.checkCombat(player, dt);
    this.updateCamera();
  }

  // Shared physics step used by both player and enemy entities.
  // Handles bounds clamping, gravity, and axis-separated tile + segment collision.
  // Step-up: when a grounded entity is blocked horizontally, the engine tries
  // lifting it up to tileH/2 pixels so it can slide over gentle slopes instead
  // of stopping dead. Step-down keeps it glued to downward slopes while walking.
  _applyPhysics(entity, dt, gravity, isPlatformer, tileW, tileH, cols, rows) {
    const w = entity.renderSize?.width  || 32;
    const h = entity.renderSize?.height || 32;
    if (cols > 0 && rows > 0) {
      entity.position.x = Math.max(0, Math.min(entity.position.x, cols * tileW - w));
      entity.position.y = Math.max(0, Math.min(entity.position.y, rows * tileH - h));
    }
    if (isPlatformer) entity.velocity.y += gravity * dt;

    // ── X axis ────────────────────────────────────────────────────────────
    const newX = entity.position.x + entity.velocity.x * dt;
    if (!this.collides(newX, entity.position.y, w, h)) {
      entity.position.x = newX;
    } else if (isPlatformer && entity.onGround) {
      // Step-up: allow the entity to climb slopes without stopping.
      // Max rise is tied to horizontal pixels-per-frame so steep lines (>~50°)
      // still act as walls — preventing large frame-to-frame pops.
      const hMove = Math.abs(entity.velocity.x * dt);
      const maxStep = Math.max(1, Math.min(Math.ceil(tileH * 0.35), Math.ceil(hMove) + 1));
      let climbed = false;
      for (let step = 1; step <= maxStep; step++) {
        if (!this.collides(newX, entity.position.y - step, w, h)) {
          entity.position.x = newX;
          entity.position.y -= step;
          entity.onGround  = true;
          entity._airborneFrames = 0;
          climbed = true;
          break;
        }
      }
      if (!climbed) {
        entity.velocity.x = 0;
        if (entity.role === 'enemy') entity._patrolDir *= -1;
      }
    } else {
      entity.velocity.x = 0;
      if (entity.role === 'enemy') entity._patrolDir *= -1;
    }

    // ── Y axis ────────────────────────────────────────────────────────────
    const newY = entity.position.y + entity.velocity.y * dt;
    if (!this.collides(entity.position.x, newY, w, h)) {
      entity.position.y = newY;
      if (isPlatformer) {
        entity._airborneFrames = (entity._airborneFrames || 0) + 1;
        if (entity._airborneFrames > 3) entity.onGround = false;
      }
    } else {
      if (entity.velocity.y > 0 && isPlatformer) entity.onGround = true;
      entity._airborneFrames = 0;
      entity.velocity.y = 0;
    }
  }

  updatePlayer(entity, dt, gravity, isPlatformer, tileW, tileH, cols, rows, attackEdge) {
    const speed = entity.stats?.speed || 120;
    const ix = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const isDashing = this.input.dash;
    const effectiveSpeed = isDashing
      ? (entity.stats?.runSpeed ?? Math.round(speed * 1.8))
      : speed;
    entity.velocity.x = ix * effectiveSpeed;

    if (isPlatformer) {
      if (this.input.jump && entity.onGround) {
        const jumpTiles = entity.stats?.jumpHeight ?? 3;
        entity.velocity.y = -Math.sqrt(2 * gravity * jumpTiles * tileH);
        entity.onGround = false;
        entity._airborneFrames = 99;
      }
    } else {
      const iy = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
      entity.velocity.y = iy * effectiveSpeed;
    }

    this._applyPhysics(entity, dt, gravity, isPlatformer, tileW, tileH, cols, rows);

    if (entity.velocity.x > 1) entity.facing = 'right';
    if (entity.velocity.x < -1) entity.facing = 'left';
    if (entity._invincibleTime > 0) entity._invincibleTime -= dt;

    const attacks  = entity.behavior?.attacks;
    const animNames = this._getEntityAnimNames(entity);
    const moving   = Math.abs(entity.velocity.x) > 1 || (!isPlatformer && Math.abs(entity.velocity.y) > 1);
    const walkName = animNames.find(n => /\bwalk\b/i.test(n));
    const runName  = entity.behavior?.runAnim  || animNames.find(n => /\brun\b/i.test(n));
    const jumpName = entity.behavior?.jumpAnim || animNames.find(n => /\bjump\b|\bleap\b|\bair\b|\bfall\b/i.test(n));
    const moveName = (this.input.dash && runName) ? runName : (walkName || runName);

    // Tick active combo attack timer, then open/close the chain window.
    if (entity._comboState?.attackTimeLeft > 0) {
      entity._comboState.attackTimeLeft -= dt;
      if (entity._comboState.attackTimeLeft <= 0) {
        entity._comboState.attackTimeLeft = 0;
        if (entity._comboState.nextAttackId && entity._comboState.comboWindowDur > 0) {
          entity._comboState.windowLeft = entity._comboState.comboWindowDur;
        } else {
          entity._comboState = null;
        }
      }
    } else if (entity._comboState?.windowLeft > 0) {
      entity._comboState.windowLeft -= dt;
      if (entity._comboState.windowLeft <= 0) entity._comboState = null;
    }

    // New attack press — chain if inside combo window, else start first attack.
    if (attackEdge && attacks?.length) {
      const combo = entity._comboState;
      if (combo?.windowLeft > 0 && combo?.nextAttackId) {
        const next = attacks.find(a => a.id === combo.nextAttackId);
        if (next) this._triggerAttack(entity, next);
      } else if (!combo?.attackTimeLeft) {
        this._triggerAttack(entity, attacks[0]);
      }
    }

    // Animation priority: hit > active combo attack > (legacy hold-to-attack) > jump > move > idle.
    let desired = entity.defaultAnimation;
    if (entity._hitState?.timeLeft > 0) {
      entity._hitState.timeLeft -= dt;
      desired = entity._hitState.anim;
      if (entity._hitState.timeLeft <= 0) entity._hitState = { timeLeft: 0, anim: null };
    } else if (entity._comboState?.attackTimeLeft > 0) {
      const curAtk = attacks?.find(a => a.id === entity._comboState.attackId);
      desired = curAtk?.anim || desired;
    } else {
      // Legacy single-attack fallback (no attacks array defined).
      const legacyAtk = !attacks?.length
        ? (entity.behavior?.attackAnim || animNames.find(n => /attack|hit|slash|punch|combo/i.test(n)))
        : null;
      if (legacyAtk && this.input.attack) desired = legacyAtk;
      else if (isPlatformer && !entity.onGround && jumpName) desired = jumpName;
      else if (moving && moveName) desired = moveName;
      else desired = this._resolveIdleAnim(entity, dt);
    }
    if (!desired && animNames.length) desired = animNames[0];
    if (entity.currentAnim !== desired) {
      entity.currentAnim = desired;
      entity.animFrame = 0;
      entity.animTime = 0;
    }
    const anim = this._getAnimDef(entity, entity.currentAnim);
    if (anim?.frames?.length > 1) {
      entity.animTime += dt;
      const step = 1 / Math.max(1, anim.fps || 6);
      while (entity.animTime >= step) {
        entity.animTime -= step;
        entity.animFrame = anim.loop !== false
          ? (entity.animFrame + 1) % anim.frames.length
          : Math.min(entity.animFrame + 1, anim.frames.length - 1);
      }
    }
  }

  // Start a timed attack, resetting the per-swing hit set so the same enemy
  // can be damaged again on the next attack in the combo chain.
  _triggerAttack(entity, attackDef) {
    entity._comboState = {
      attackId: attackDef.id,
      attackTimeLeft: (attackDef.duration ?? 400) / 1000,
      windowLeft: 0,
      nextAttackId: attackDef.comboNext || null,
      comboWindowDur: (attackDef.comboWindow ?? 500) / 1000,
    };
    entity._attackHitSet = new Set();
    if (attackDef.anim) {
      entity.currentAnim = attackDef.anim;
      entity.animFrame = 0;
      entity.animTime = 0;
    }
  }

  // Returns the idle animation name to play, cycling through behavior.idles
  // with per-entry min/max timing. Falls back to defaultAnimation.
  _resolveIdleAnim(entity, dt) {
    const idles = entity.behavior?.idles;
    if (!idles?.length) return entity.defaultAnimation;
    let st = entity._idleState;
    if (!st) st = entity._idleState = { idx: 0, timer: 0 };
    st.timer -= dt;
    if (st.timer <= 0) {
      const nextIdx = idles.length > 1
        ? (st.idx + 1 + Math.floor(Math.random() * (idles.length - 1))) % idles.length
        : 0;
      st.idx = nextIdx;
      const idle = idles[nextIdx];
      const minT = idle.minTime ?? 2;
      const maxT = Math.max(minT + 0.1, idle.maxTime ?? 6);
      st.timer = minT + Math.random() * (maxT - minT);
    }
    return idles[st.idx]?.anim || entity.defaultAnimation;
  }

  // Advance the death animation (non-looping, holds last frame) and tick the
  // vanish countdown. Called every frame while entity._dead && !entity._vanished.
  _tickDeathSequence(entity, dt) {
    const anim = this._getAnimDef(entity, entity.currentAnim);
    if (anim?.frames?.length > 1) {
      entity.animTime += dt;
      const step = 1 / Math.max(1, anim.fps || 6);
      while (entity.animTime >= step) {
        entity.animTime -= step;
        entity.animFrame = Math.min(entity.animFrame + 1, anim.frames.length - 1);
      }
    }
    if (entity._vanishTimeLeft > 0) {
      entity._vanishTimeLeft -= dt;
      if (entity._vanishTimeLeft <= 0) entity._vanished = true;
    }
  }

  // Generalized hit application — works for any entity (player or enemy).
  // Damage formula: incoming power is reduced by the target's flat defense stat,
  // then a ±20% random variance is applied. Result is always at least 1.
  applyHitToEntity(entity, power = 10) {
    if (!entity || entity._dead || entity._invincibleTime > 0) return;
    const defense  = entity.stats?.defense || 0;
    const reduced  = Math.max(0, power - defense);
    // If defense fully absorbs the hit, deal 0 — no chip damage on tanks.
    // Otherwise apply ±20% variance so identical attacks don't feel robotic.
    const variance = reduced > 0 ? reduced * 0.2 * (Math.random() * 2 - 1) : 0;
    const actual   = Math.max(0, Math.round(reduced + variance));
    entity._hp = (entity._hp ?? 100) - actual;
    entity._invincibleTime = 0.4;
    if (entity._hp <= 0) {
      entity._hp = 0;
      entity._dead = true;
      const deathAnim = entity.behavior?.deathAnim
        || this._getEntityAnimNames(entity).find(n => /\bdeath\b|\bdie\b|\bdead\b/i.test(n));
      if (deathAnim) {
        entity.currentAnim = deathAnim;
        entity.animFrame = 0;
        entity.animTime = 0;
      }
      const vanishMs = entity.behavior?.vanishDelay;
      entity._vanishTimeLeft = (vanishMs != null && vanishMs > 0) ? vanishMs / 1000 : 0;
      if (entity.role === 'enemy') entity._aiState = 'dead';
      return;
    }
    const animNames = this._getEntityAnimNames(entity);
    const threshold  = entity.behavior?.hitThreshold ?? 30;
    const hitName    = entity.behavior?.hitAnim      || animNames.find(n => /\bhurt\b|\bpain\b|\bflinch\b|\bdamage\b/i.test(n));
    const heavyName  = entity.behavior?.heavyHitAnim || animNames.find(n => /\bheavy\b|\bstagger\b|\bknockback\b|\bko\b/i.test(n));
    const anim = (power >= threshold && heavyName) ? heavyName : hitName;
    if (anim) {
      const dur = (entity.behavior?.hitDuration ?? 500) / 1000;
      entity._hitState = { timeLeft: dur, anim };
      entity.currentAnim = anim;
      entity.animFrame = 0;
      entity.animTime = 0;
    }
    if (entity.role === 'enemy') entity._aiState = 'hurt';
  }

  // Enemy AI — patrol / chase / attack state machine.
  updateEnemyAI(entity, player, dt, tileW, tileH) {
    const speed          = entity.stats?.speed || 80;
    const detectionRange = (entity.behavior?.detectionRange ?? 8) * tileW;
    const attackRange    =  entity.behavior?.attackRange    ?? 48;
    const patrolRange    = (entity.behavior?.patrolRange    ?? 3) * tileW;
    const isPlatformer   = (this.level.gravity || 0) > 0;

    if (entity._invincibleTime > 0) entity._invincibleTime -= dt;
    if (entity._attackCooldown  > 0) entity._attackCooldown  -= dt;

    // Locked in hurt animation — wait until it expires, then return to patrol.
    if (entity._hitState?.timeLeft > 0) {
      entity._hitState.timeLeft -= dt;
      if (entity._hitState.timeLeft <= 0) {
        entity._hitState = { timeLeft: 0, anim: null };
        entity._aiState = 'patrol';
      }
      entity.velocity.x = 0;
      return;
    }
    if (entity._dead) { entity.velocity.x = 0; return; }

    const playerCx = player.position.x + (player.renderSize?.width  || 32) / 2;
    const enemyCx  = entity.position.x  + (entity.renderSize?.width  || 32) / 2;
    const dx   = playerCx - enemyCx;
    const dist = Math.abs(dx);

    // State transitions: attack range beats detection range beats patrol.
    if (dist <= attackRange) {
      entity._aiState = 'attack';
    } else if (dist <= detectionRange) {
      entity._aiState = 'chase';
    } else if (entity._aiState !== 'patrol') {
      entity._aiState = 'patrol';
    }

    if (entity._aiState === 'attack') {
      entity.velocity.x = 0;
      entity.facing = dx >= 0 ? 'right' : 'left';
    } else if (entity._aiState === 'chase') {
      entity.velocity.x = Math.sign(dx) * speed;
      entity.facing = dx >= 0 ? 'right' : 'left';
    } else {
      // Patrol: walk back and forth within patrolRange tiles of spawn X.
      const distFromSpawn = entity.position.x - entity._spawnX;
      let dirFlipped = false;
      if (distFromSpawn >  patrolRange) { entity._patrolDir = -1; dirFlipped = true; }
      if (distFromSpawn < -patrolRange) { entity._patrolDir =  1; dirFlipped = true; }
      // Edge detection — only in platformer mode when the entity is on the ground,
      // and only when the distance check didn't already flip the direction (prevents
      // the two checks fighting each other and causing rapid oscillation).
      if (!dirFlipped && isPlatformer && entity.onGround) {
        const w = entity.renderSize?.width  || 32;
        const h = entity.renderSize?.height || 32;
        const footX = entity._patrolDir > 0 ? entity.position.x + w : entity.position.x - 2;
        if (!this.tileCollide(footX, entity.position.y + h, 2, tileH)) entity._patrolDir *= -1;
      }
      entity.velocity.x = entity._patrolDir * speed * 0.5;
      entity.facing = entity._patrolDir > 0 ? 'right' : 'left';
    }
  }

  // Enemy animation selection driven by AI state.
  updateEnemyAnimation(entity, dt) {
    const animNames  = this._getEntityAnimNames(entity);
    if (!animNames.length) return;
    const walkName   = entity.behavior?.runAnim    || animNames.find(n => /\bwalk\b|\brun\b/i.test(n));
    const attackName = entity.behavior?.attacks?.[0]?.anim
      || entity.behavior?.attackAnim
      || animNames.find(n => /attack|slash|punch|combo/i.test(n));
    const idleName   = entity.defaultAnimation || animNames[0];
    let desired = idleName;
    if (entity._hitState?.timeLeft > 0) {
      desired = entity._hitState.anim || idleName;
    } else if (entity._aiState === 'attack' && attackName) {
      desired = attackName;
    } else if (walkName && (entity._aiState === 'chase' ||
               (entity._aiState === 'patrol' && Math.abs(entity.velocity.x) > 1))) {
      desired = walkName;
    }
    if (entity.currentAnim !== desired) {
      entity.currentAnim = desired;
      entity.animFrame = 0;
      entity.animTime = 0;
    }
    const anim = this._getAnimDef(entity, entity.currentAnim);
    if (anim?.frames?.length > 1) {
      entity.animTime += dt;
      const step = 1 / Math.max(1, anim.fps || 6);
      while (entity.animTime >= step) {
        entity.animTime -= step;
        entity.animFrame = anim.loop !== false
          ? (entity.animFrame + 1) % anim.frames.length
          : Math.min(entity.animFrame + 1, anim.frames.length - 1);
      }
    }
  }

  // Bidirectional combat: player attack damages enemies; enemies contact-damage player.
  checkCombat(player, dt) {
    const pw = player.renderSize?.width  || 32;
    const ph = player.renderSize?.height || 32;
    for (const enemy of this.entities) {
      if (enemy.role !== 'enemy' || enemy._dead) continue;
      const ew = enemy.renderSize?.width  || 32;
      const eh = enemy.renderSize?.height || 32;

      // AABB overlap between player and this enemy.
      const overlapX = player.position.x < enemy.position.x + ew && player.position.x + pw > enemy.position.x;
      const overlapY = player.position.y < enemy.position.y + eh && player.position.y + ph > enemy.position.y;

      // Player attack: active combo swing OR legacy held-button attack.
      const attacks = player.behavior?.attacks;
      const comboActive = player._comboState?.attackTimeLeft > 0;
      const legacyActive = !attacks?.length && this.input.attack;
      if (comboActive || legacyActive) {
        const curAtk = attacks?.find(a => a.id === player._comboState?.attackId);
        const reach  = curAtk?.reach ?? Math.round(pw * 1.8);
        const pCx    = player.position.x + pw / 2;
        const eCx    = enemy.position.x  + ew / 2;
        const inReach = player.facing === 'right'
          ? eCx > pCx && eCx < pCx + reach
          : eCx < pCx && eCx > pCx - reach;
        const inYRange = Math.abs((player.position.y + ph / 2) - (enemy.position.y + eh / 2)) < (ph + eh) / 2;
        if (inReach && inYRange) {
          if (!player._attackHitSet) player._attackHitSet = new Set();
          const key = enemy.id || enemy;
          if (!player._attackHitSet.has(key)) {
            player._attackHitSet.add(key);
            this.applyHitToEntity(enemy, curAtk?.damage ?? 25);
          }
        }
      } else if (!comboActive && !legacyActive) {
        if (!attacks?.length) player._attackHitSet = null;
      }

      // Enemy contact damage — only while in attack state and cooldown is ready.
      if (overlapX && overlapY && enemy._aiState === 'attack' && enemy._attackCooldown <= 0) {
        const enemyDmg = enemy.behavior?.attacks?.[0]?.damage ?? enemy.stats?.damage ?? 10;
        this.applyHitToEntity(player, enemyDmg);
        enemy._attackCooldown = (enemy.behavior?.attackCooldown ?? 1200) / 1000;
      }
    }
  }

  // True if the AABB (x, y, w, h) overlaps any non-zero tile or hits the
  // level bounds. Prefers a layer with kind === 'collision'; falls back to
  // the first layer so single-layer maps work without extra configuration.
  tileCollide(x, y, w, h) {
    const tm = this.level.tileMap || {};
    const cols = tm.cols || 0;
    const rows = tm.rows || 0;
    const tileW = tm.tileWidth || 32;
    const tileH = tm.tileHeight || 32;
    const layer = (tm.layers || []).find(l => l.kind === 'collision') || (tm.layers || [])[0];
    if (!layer) return false;

    if (x < 0 || x + w > cols * tileW) return true;
    if (y < 0 || y + h > rows * tileH) return true;

    const c0 = Math.max(0, Math.floor(x / tileW));
    const c1 = Math.min(cols - 1, Math.floor((x + w - 1) / tileW));
    const r0v = Math.max(0, Math.floor(y / tileH));
    const r1v = Math.min(rows - 1, Math.floor((y + h - 1) / tileH));
    for (let r = r0v; r <= r1v; r++) {
      const dr = (rows - 1) - r; // visual row → data row (floor-up)
      for (let c = c0; c <= c1; c++) {
        if ((layer.data[dr * cols + c] | 0) > 0) return true;
      }
    }
    return false;
  }

  updateCamera() {
    const player = this.entities.find(e => e.role === 'playerMain');
    if (!player) return;
    const tm = this.level.tileMap || {};
    const levelW = (tm.cols || 0) * (tm.tileWidth || 32);
    const levelH = (tm.rows || 0) * (tm.tileHeight || 32);
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    this.cameraX = player.position.x + (player.renderSize?.width || 32) / 2 - viewW / 2;
    this.cameraY = player.position.y + (player.renderSize?.height || 32) / 2 - viewH / 2;
    this.cameraX = Math.max(0, Math.min(this.cameraX, Math.max(0, levelW - viewW)));
    this.cameraY = Math.max(0, Math.min(this.cameraY, Math.max(0, levelH - viewH)));
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackgrounds();
    this.drawTilemap();
    this.drawEntities();
    this.drawOcclusion();
    if (this.showColliders) this.drawColliders();
  }

  // Redraws backgrounds + tilemap clipped to each occlusion polygon so those
  // regions appear in front of entities — giving the illusion the player is
  // passing behind foreground objects painted into the background image.
  drawOcclusion() {
    const shapes = this.level.occlusionShapes || [];
    if (!shapes.length) return;
    const ctx = this.ctx;
    for (const shape of shapes) {
      const pts = shape.points || [];
      if (pts.length < 3) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x - this.cameraX, pts[0].y - this.cameraY);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x - this.cameraX, pts[i].y - this.cameraY);
      }
      ctx.closePath();
      ctx.clip();
      this.drawBackgrounds();
      this.drawTilemap();
      ctx.restore();
    }
  }

  drawBackgrounds() {
    const ctx = this.ctx;
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    for (const layer of this.level.backgrounds || []) {
      const asset = (this.assets.backgrounds || []).find(a => a.id === layer.assetId);
      const img = asset && this.images.get(asset.id);
      if (!img) continue;
      const px = layer.parallax?.x ?? 0.5;
      const py = layer.parallax?.y ?? 0.5;
      const sx = (layer.scroll?.x || 0) * this.time;
      const sy = (layer.scroll?.y || 0) * this.time;
      const ox = layer.offset?.x || 0;
      const oy = layer.offset?.y || 0;
      const scale = layer.scale || 1;
      const opacity = layer.opacity ?? 1;
      const repX = layer.repeat?.x !== false;
      const repY = layer.repeat?.y === true;
      const iw = img.width * scale;
      const ih = img.height * scale;
      let offX = ox - this.cameraX * px + sx;
      let offY = oy - this.cameraY * py + sy;
      if (repX) { offX = offX % iw; if (offX > 0) offX -= iw; }
      if (repY) { offY = offY % ih; if (offY > 0) offY -= ih; }
      const cols = repX ? Math.ceil((viewW - offX) / iw) + 1 : 1;
      const rows = repY ? Math.ceil((viewH - offY) / ih) + 1 : 1;
      ctx.save();
      ctx.globalAlpha = opacity;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.drawImage(img, offX + c * iw, offY + r * ih, iw, ih);
        }
      }
      ctx.restore();
    }
  }

  drawTilemap() {
    const tm = this.level.tileMap || {};
    const ts = resolveTilesetView(this.assets, tm.tilesetAssetId);
    if (!ts) return;
    const img = this.images.get(ts.id);
    if (!img) return;
    const layer = (tm.layers || [])[0];
    if (!layer) return;
    const cols = tm.cols || 0;
    const rows = tm.rows || 0;
    const tileW = tm.tileWidth || 32;
    const tileH = tm.tileHeight || 32;
    const tsCols = Math.max(1, ts.cols || 1);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);
    for (let i = 0; i < cols * rows; i++) {
      const v = layer.data[i] | 0;
      if (v <= 0) continue;
      const tsIdx = v - 1;
      const { x: sx, y: sy } = cellOrigin(ts, tsIdx % tsCols, Math.floor(tsIdx / tsCols));
      const dx = (i % cols) * tileW;
      const dy = ((rows - 1) - Math.floor(i / cols)) * tileH;
      ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, dx, dy, tileW, tileH);
    }
    ctx.restore();
  }

  drawColliders() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);

    // Tile collision layer — orange fill + stroke per solid cell.
    const tm = this.level.tileMap || {};
    const cols = tm.cols || 0;
    const rows = tm.rows || 0;
    const tileW = tm.tileWidth || 32;
    const tileH = tm.tileHeight || 32;
    const layer = (tm.layers || []).find(l => l.kind === 'collision') || (tm.layers || [])[0];
    if (layer) {
      ctx.fillStyle   = 'rgba(255,165,0,0.25)';
      ctx.strokeStyle = 'rgba(255,165,0,0.85)';
      ctx.lineWidth = 1;
      for (let i = 0; i < cols * rows; i++) {
        if ((layer.data[i] | 0) <= 0) continue;
        const dx = (i % cols) * tileW;
        const dy = ((rows - 1) - Math.floor(i / cols)) * tileH;
        ctx.fillRect(dx, dy, tileW, tileH);
        ctx.strokeRect(dx + 0.5, dy + 0.5, tileW - 1, tileH - 1);
      }
    }

    // Occlusion masks — purple fill to show foreground regions.
    for (const shape of (this.level.occlusionShapes || [])) {
      const pts = shape.points || [];
      if (pts.length < 3) continue;
      ctx.fillStyle   = 'rgba(180,0,255,0.15)';
      ctx.strokeStyle = 'rgba(180,0,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Line-based collision shapes — dashed orange polylines.
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 2;
    for (const shape of (this.level.colliderShapes || [])) {
      const pts = shape.points || [];
      if (pts.length < 2) continue;
      ctx.strokeStyle = 'rgba(255,165,0,0.9)';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (shape.closed) ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,165,0,0.9)';
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);

    // Entity hitboxes — green for player, red for enemies.
    ctx.lineWidth = 1;
    for (const entity of this.entities) {
      if (entity._vanished) continue;
      const ew = entity.renderSize?.width  || 32;
      const eh = entity.renderSize?.height || 32;
      const ex = entity.position.x;
      const ey = entity.position.y;
      const isPlayer = entity.role === 'playerMain';
      ctx.fillStyle   = isPlayer ? 'rgba(0,255,160,0.12)' : 'rgba(255,60,60,0.12)';
      ctx.strokeStyle = isPlayer ? 'rgba(0,255,160,0.9)'  : 'rgba(255,60,60,0.9)';
      ctx.fillRect(ex, ey, ew, eh);
      ctx.strokeRect(ex + 0.5, ey + 0.5, ew - 1, eh - 1);
    }

    ctx.restore();
  }

  drawEntities() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);
    for (const entity of this.entities) {
      if (entity._vanished) continue;
      this.drawEntity(entity);
    }
    ctx.restore();
  }

  drawEntity(entity) {
    const ctx = this.ctx;
    const sheet = this._getSheetForAnim(entity, entity.currentAnim);
    if (!sheet) return;
    const img = this.images.get(sheet.id);
    if (!img) return;
    const anim = this._getAnimDef(entity, entity.currentAnim);
    const frames = anim?.frames || [];
    if (!frames.length) return;
    const f = sheet.frame;
    const cols = Math.max(1, f.cols || 1);
    const idx = frames[entity.animFrame] ?? 0;
    const cx = idx % cols;
    const cy = Math.floor(idx / cols);
    // Reuse cellOrigin by feeding it a tileset-shaped view.
    const view = {
      tileWidth: f.width, tileHeight: f.height,
      cols: f.cols, rows: f.rows,
      offsetLeft: f.offsetLeft ?? f.offsetX ?? 0,
      offsetTop:  f.offsetTop  ?? f.offsetY ?? 0,
      gapX: f.gapX, gapY: f.gapY,
    };
    const { x: sx, y: sy } = cellOrigin(view, cx, cy);
    const fw = f.width;
    const fh = f.height;
    // Lock display height to renderSize.height so all animations appear at
    // the same character height. Width scales proportionally — wide animations
    // (run, attack) may be wider than the hitbox; that is intentional.
    // Bottom-anchored: py = entity.position.y, so sprite bottom = hitbox
    // bottom = ground tile surface. No floating gap.
    const rw = entity.renderSize?.width || fw;
    const hitboxH = entity.renderSize?.height || fh;
    const slot = (entity.animations || []).find(a => a.name === entity.currentAnim);
    // Per-slot renderH / spriteOffsetY override.
    const rh = (slot?.renderH != null ? slot.renderH : hitboxH) || fh;
    const dh = rh;
    const dw = Math.round(fw * (rh / fh));
    const cox = Math.round((rw - dw) / 2);
    const spriteOffY = (slot?.spriteOffsetY != null ? slot.spriteOffsetY : entity.spriteOffsetY) || 0;
    // Bottom-anchor: sprite bottom always aligns with hitbox bottom regardless
    // of the override height. py shifts down by (hitboxH - rh) so the visual
    // base stays on the floor when the sprite is shorter than the hitbox.
    const nativeDir = slot?.nativeDir || 'right';
    const shouldFlip = (nativeDir !== entity.facing);
    const px = entity.position.x + cox;
    const py = entity.position.y + hitboxH - dh - spriteOffY;
    if (shouldFlip) {
      ctx.save();
      ctx.translate(px + dw, py);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, fw, fh, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, fw, fh, px, py, dw, dh);
    }
  }
}
