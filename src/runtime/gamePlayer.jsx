// React-based game player for published TUIFY pages.
// Replaces the vanilla-JS standalone.js so published games use the same
// React components (EmbedRuntime, GameHUD) as the builder canvas.
//
// Reads two globals set by generated HTML:
//   window.__TUIFY_WORLDS__  — array of world objects (standalone game)
//   window.__TUIFY_ASSETS__  — assets sidecar object
//   window.__TUIFY_EMBEDS__  — array of embed descriptors (page embeds)

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import EmbedRuntime from '../components/Componentes/EmbedRuntime';

// Full-page standalone game: manages which world is currently displayed,
// handles cross-world navigation from HUD buttons.
function StandaloneGame({ worlds, assets }) {
  const [currentWorldId, setCurrentWorldId] = useState(worlds[0]?.id);
  const world = worlds.find(w => w.id === currentWorldId) || worlds[0];

  const handleExternalNavigate = (targetId) => {
    if (worlds.some(w => w.id === targetId)) setCurrentWorldId(targetId);
  };

  if (!world) return null;

  return (
    <DndProvider backend={HTML5Backend}>
      <EmbedRuntime
        key={world.id}
        world={world}
        assets={assets}
        scaling="fit"
        maintainAspect={true}
        onNavigateExternal={handleExternalNavigate}
      />
    </DndProvider>
  );
}

function init() {
  if (window.__TUIFY_PLAYER_INIT__) return;
  window.__TUIFY_PLAYER_INIT__ = true;
  // ── Standalone / combined game ────────────────────────────────────────────
  // Support both new array format (__TUIFY_WORLDS__) and legacy single-world
  // format (__TUIFY_WORLD__) for backwards compatibility.
  const worlds = window.__TUIFY_WORLDS__ || (window.__TUIFY_WORLD__ ? [window.__TUIFY_WORLD__] : null);
  const assets = window.__TUIFY_ASSETS__ || {};

  if (worlds?.length) {
    const gameRoot = document.getElementById('game-root');
    if (gameRoot) {
      createRoot(gameRoot).render(<StandaloneGame worlds={worlds} assets={assets} />);
    }
  }

  // ── Page embeds ───────────────────────────────────────────────────────────
  // Each embed descriptor names a container div; EmbedRuntime mounts into it.
  const embeds = window.__TUIFY_EMBEDS__;
  if (Array.isArray(embeds)) {
    embeds.forEach(({ containerId, world, assets: embedAssets, scaling, maintainAspect }) => {
      const container = document.getElementById(containerId);
      if (!container || !world) return;
      createRoot(container).render(
        <DndProvider backend={HTML5Backend}>
          <EmbedRuntime
            world={world}
            assets={embedAssets || {}}
            scaling={scaling || 'fit'}
            maintainAspect={maintainAspect !== false}
          />
        </DndProvider>
      );
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
